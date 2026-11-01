// ============================================================================
// POST/GET /api/cron/podcast — 팟캐스트 생성 Cron Worker
//
// 스케줄(docs/06 §5): 매일 07:00 KST — launchd 는 매시 호출하고 아래 KST 가드가 07시에만 생성한다.
// 정오 이후 호출은 무발행·검수 대기 감지(lib/podcast/health → system_alerts)를 겸한다.
// 인증(docs/06 §2): 헤더 `Authorization: Bearer $CRON_SECRET`.
// 동작: lib/podcast generateEpisode (수집→스크립트→QA→TTS→저장→알림).
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { checkPodcastDay, generateEpisode } from "@/lib/podcast";
import { backfillEpisodeHeadlines } from "@/lib/ai/podcast-headline";
import { createServiceClient } from "@/lib/supabase/server";
import type { GenerateResult } from "@/lib/podcast";
import type { ApiResponse } from "@/types";

/** CRON_SECRET 검증 — lib/cron/auth 공용(상수 시간 비교) */
function isAuthorized(request: NextRequest): boolean {
  return isCronAuthorized(request.headers);
}

/** 빈 헤드라인 보충 — 매시 3건. 실패해도 삼킨다(회차 생성·응답에 영향 없음) */
async function fillHeadlines(): Promise<void> {
  try {
    const fill = await backfillEpisodeHeadlines(3);
    if (fill.targeted > 0) {
      console.log(`[cron/podcast] 헤드라인 보충 — 대상 ${fill.targeted} 생성 ${fill.generated} 실패 ${fill.failed}`);
    }
  } catch (e) {
    console.error("[cron/podcast] 헤드라인 보충 실패:", e instanceof Error ? e.message : e);
  }
}

async function handle(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<GenerateResult>>> {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { data: null, error: { code: "unauthorized", message: "인증 실패" } },
      { status: 401 },
    );
  }

  // launchd TZ 캐시 버그(Hour=7이 밤 23시 KST에 발화)로 크론 발화 시각을 신뢰할 수
  // 없어, 크론은 매시 호출하고 여기서 "KST 07시대"에만 생성한다(TZ 비의존).
  // ?force=1 은 수동 트리거용(시각 가드 우회, 멱등성은 generateEpisode가 담당).
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const kstHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  ) % 24;
  if (!force && kstHour !== 7) {
    // 생성이 없는 시각 — 헤드라인 보충만. 생성 때 codex 가 실패해 null 로 남은 회차(대본 수정승인으로
    // 비워진 회차 포함)를 몇 건씩 채운다. 실패한 행은 '' 로 표시돼 다음 시각에 다른 행이 차례를 받는다.
    await fillHeadlines();
    // 정오 이후 — 오늘 회차가 없거나(크론 미실행·실패) 확인 대기에 머물면 system_alerts 에 남긴다(#181 결함 B).
    // 중복은 lib/podcast/health 가 거른다(같은 날 같은 상태 1회).
    if (kstHour >= 12) {
      const health = await checkPodcastDay(createServiceClient());
      if (health.alerted) console.log(`[cron/podcast] 경보 — ${health.alerted} (${health.date}, ${health.status}, 대기 ${health.pendingCount})`);
    }
    return NextResponse.json({
      data: null,
      error: { code: "skipped_off_hour", message: `KST ${kstHour}시 — 07시대에만 생성(매시 크론 가드)` },
    });
  }

  try {
    // 옥천신문은 주간지(목·금 집중, 토·일 0건)라 24h 창은 주말·조용한 날 비어
    // 매일 발행이 끊긴다. 매일 브리핑을 보장하기 위해 최근 72h(3일)로 수집한다.
    const result = await generateEpisode({ lookbackHours: 72 });
    // 회차 생성이 끝난 뒤에 보충 — 보충 대기(codex 최대 3분×3)에 07시 생성이 밀리지 않게
    await fillHeadlines();
    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    console.error("[cron/podcast] 생성 실패:", error);
    const message =
      error instanceof Error ? error.message : "팟캐스트 생성 중 오류";
    return NextResponse.json(
      { data: null, error: { code: "podcast_generation_failed", message } },
      { status: 500 },
    );
  }
}

// Cloudflare Cron Trigger 는 보통 GET 으로 호출한다. 수동 트리거용 POST 도 허용.
export const GET = handle;
export const POST = handle;
