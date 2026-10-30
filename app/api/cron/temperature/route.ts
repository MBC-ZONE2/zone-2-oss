// ============================================================================
// POST|GET /api/cron/temperature — 온도 산출 워커 (15분 주기 가정)
//
// docs/06 §5: CRON_SECRET 검증 → 감정·집계 → 온도 산출
//   → temperature_scores + temperature_runs.
// 인증: 헤더 Authorization: Bearer $CRON_SECRET (docs §2 Cron 인증).
//
// Cloudflare Cron 트리거는 GET 으로 올 수 있어 GET/POST 모두 허용한다.
// ============================================================================

import { runTemperatureComputation } from "@/lib/temperature/compute";
import { fail, ok } from "@/lib/temperature/http";
import { checkPodcastDay } from "@/lib/podcast/health";
import { createServiceClient } from "@/lib/supabase/server";
import { sweepOrphanForumImages } from "@/lib/forum/image-sweep";
import { runConfirmTimeoutSweep } from "@/lib/moderation/confirm-timeout";

/** 공론장 고아 사진 정리 — 하루 한 번(KST 04시대 첫 15분 슬롯). 실패해도 온도 응답에 영향 없음 */
async function forumImageSweep(): Promise<void> {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === "hour")?.value) % 24;
    const minute = Number(parts.find((p) => p.type === "minute")?.value);
    if (hour !== 4 || minute >= 15) return;
    const r = await sweepOrphanForumImages(createServiceClient());
    console.log(`[cron/temperature] 공론장 사진 정리 — 훑음 ${r.scanned} · 참조 ${r.referenced} · 삭제 ${r.removed}${r.errors.length ? ` · 오류 ${r.errors.join(" / ")}` : ""}`);
  } catch (e) {
    console.error("[cron/temperature] 공론장 사진 정리 실패:", e instanceof Error ? e.message : e);
  }
}

/**
 * 팟캐 무발행 감시를 여기서도 한 번씩(매시 첫 15분 슬롯, KST 정오 이후) 돌린다 — 팟캐 크론(launchd
 * kr.zone2.podcast) 자체가 멈추면 그 안의 감시도 함께 멈추기 때문(#181 결함 B, codex 리뷰).
 * 온도 크론은 별도 launchd 잡(kr.zone2.temperature)이라 독립된 눈이 된다. 실패해도 온도 응답에 영향 없음.
 */
/** 한쪽 확인 후 N시간 지난 크로스뷰·팟캐 자동 공개(대표 결정 2026-10-26). 실패해도 온도 계산 결과에 영향 없음 */
async function confirmTimeoutSweep(): Promise<void> {
  try {
    const r = await runConfirmTimeoutSweep(createServiceClient());
    if (r.crossview.length || r.podcast.length || r.errors) {
      console.log(`[cron/temperature] 자동 공개 — 크로스뷰 ${r.crossview.length} · 팟캐 ${r.podcast.length} · 오류 ${r.errors} (${r.hours}h)`);
    }
  } catch (e) {
    console.error("[cron/temperature] 자동 공개 스윕 실패:", e instanceof Error ? e.message : e);
  }
}

async function podcastWatchdog(): Promise<void> {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === "hour")?.value) % 24;
    const minute = Number(parts.find((p) => p.type === "minute")?.value);
    if (hour < 12 || minute >= 15) return;
    const h = await checkPodcastDay(createServiceClient());
    if (h.alerted) console.log(`[cron/temperature] 팟캐 감시 경보 — ${h.alerted} (${h.date}, ${h.status}, 대기 ${h.pendingCount})`);
  } catch (e) {
    console.error("[cron/temperature] 팟캐 감시 실패:", e instanceof Error ? e.message : e);
  }
}

export const dynamic = "force-dynamic";

/** Authorization: Bearer <CRON_SECRET> 검증. 실패 시 NextResponse 반환, 성공 시 null. */
function verifyCronSecret(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // 시크릿 미설정은 서버 구성 오류 — 401 보다 명확히 500.
    console.error("CRON_SECRET 미설정");
    return fail(500, "cron_secret_unset", "CRON_SECRET 이 설정되지 않았습니다.");
  }

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (header !== expected) {
    return fail(401, "unauthorized", "유효한 CRON_SECRET 이 필요합니다.");
  }
  return null;
}

async function handle(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  // runTemperatureComputation 은 내부에서 실패를 잡아 temperature_runs 에 기록하고
  // 결과 객체를 반환한다(throw 하지 않음). status 로 HTTP 코드를 가른다.
  const result = await runTemperatureComputation();
  await podcastWatchdog();
  await confirmTimeoutSweep();
  await forumImageSweep();
  if (result.status === "fail") {
    return fail(500, "temperature_compute_failed", result.detail);
  }
  return ok(result);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
