// ============================================================================
// lib/podcast/health — 「오늘의 충북」 무발행일 감지 (#181 결함 B)
//
// 생성 실패는 podcast_episodes.status='failed' 로 남지만, 크론이 아예 안 돈 날과
// 양측 확인이 안 돼 review 에 머문 날은 아무 기록이 없어 공개 지면의 공백을 아무도 몰랐다
// (9월 #175 13편, 10/5~10/10 6편 — 둘 다 옥천신문 확인 대기). 매시 크론(/api/cron/podcast)이
// KST 정오 이후 호출하면 오늘 회차의 상태를 보고 system_alerts 에 남긴다.
//   · 회차 없음 / failed      → kind podcast_missing_day   (error)
//   · review(확인 대기)       → kind podcast_pending_review (warning) — 대기 편수·미확인 소속 포함
//   · published               → 두 kind 의 미해결 경고를 걷는다
// 같은 날 같은 상태는 한 번만 남기고, 대기 편수가 바뀌면 이전 경고를 해소하고 새로 남긴다.
//
// **검수 마감 자동 공개**(2026-10-11, 대표 결정 "구조적으로 막아"): 경고만으로는 정체가 반복됐다
// (9월 13편 #175, 10/5~10/11 7편). 회차 날짜의 KST PODCAST_AUTO_PUBLISH_HOUR(명시한 시각, 기본 off)시까지 반려가
// 없으면 양측 확인이 없어도 공개한다 — 「오늘의 충북」은 당일성 콘텐츠라 묵히면 가치가 없다.
// 사람의 거부권은 남는다: 07~12시 사이 반려 가능, 공개 뒤에도 "검수로 되돌리기"(롤백)로 내릴 수 있다.
// 자동 공개는 moderation_logs(action=auto_publish, details.autoPublish) 와 system_alerts(info) 에 남긴다 —
// 사람 승인과 구분되어 검수 승인율(지표 ⑥)에 들어가지 않는다(#185, 0023).
// PODCAST_AUTO_PUBLISH_HOUR 가 비어 있거나 off 면(기본) 사람 확인만으로 공개한다.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { orgLabel, region } from "@/config/region";
import { REQUIRED_CONFIRMATIONS } from "@/lib/auth/roles";
import { expireInfoAlerts, recordAlertOnce, resolveAlerts } from "@/lib/alerts";

export const PODCAST_MISSING_KIND = "podcast_missing_day";
export const PODCAST_PENDING_KIND = "podcast_pending_review";
export const PODCAST_AUTO_KIND = "podcast_auto_published";

/** 자동 공개 마감 시각(KST). 미설정·빈 값·"off"·잘못된 값 → 비활성(null). 켜려면 0~23 을 명시한다
 *  (기본 off — AI 생성물은 사람 확인 뒤에만 게시. 2026-10-30 까지는 미설정=12 였고 운영은 env 로 off 였다) */
export function autoPublishHour(): number | null {
  const raw = process.env.PODCAST_AUTO_PUBLISH_HOUR?.trim();
  if (raw === undefined || raw === "") return null;
  if (raw.toLowerCase() === "off") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
}

export interface PodcastHealth {
  date: string;
  /** 오늘 회차 상태. 없으면 "missing" */
  status: "published" | "review" | "generating" | "failed" | "missing";
  /** 오늘까지의 review(확인 대기) 편수 — 기간 제한 없음 */
  pendingCount: number;
  /** 새로 남긴 경고 kind(없으면 null) */
  alerted: string | null;
  /** 이번 점검에서 검수 마감으로 자동 공개한 편수 */
  autoPublished: number;
}

interface Row {
  id?: string;
  scheduled_for: string;
  status: string;
  confirmations: Record<string, unknown> | null;
}

/** KST YYYY-MM-DD */
export function kstDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** KST 시(0~23) */
function kstHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false }).format(now)) % 24;
}

/**
 * 마감이 지난 review 회차를 공개한다 — 오늘 회차는 KST deadlineHour 이후, 지난 날짜 회차는 즉시.
 * 반려된 회차는 status 가 failed 라 대상이 아니다. 공개 시각은 사람이 승인할 때와 같은 회차 날짜 09:00 KST.
 * @returns 공개한 회차 날짜들
 */
async function autoPublishOverdue(
  supabase: SupabaseClient,
  date: string,
  hour: number,
  deadlineHour: number,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("podcast_episodes")
    .select("id, scheduled_for, status, confirmations")
    .eq("status", "review")
    .lte("scheduled_for", date)
    .order("scheduled_for", { ascending: true });
  if (error) throw new Error(error.message);
  const due = ((data ?? []) as Row[]).filter((r) => r.scheduled_for < date || hour >= deadlineHour);
  const done: string[] = [];
  for (const r of due) {
    if (!r.id) continue;
    const { data: upd, error: uErr } = await supabase
      .from("podcast_episodes")
      .update({ status: "published", published_at: `${r.scheduled_for}T09:00:00+09:00` })
      .eq("id", r.id)
      .eq("status", "review") // 그 사이 사람이 처리했으면 건너뛴다
      .select("id");
    if (uErr) {
      console.error(`[podcast/health] 자동 공개 실패(${r.scheduled_for}):`, uErr.message);
      continue;
    }
    if (!upd || upd.length === 0) continue;
    const missing = ["okinews", "mbc"].filter((org) => !r.confirmations || !(org in r.confirmations));
    const { error: lErr } = await supabase.from("moderation_logs").insert({
      target: "podcast",
      target_id: r.id,
      action: "auto_publish", // 0023 — 사람 승인(approve)과 구분, 승인율 집계 제외(#185)
      operator: null,
      details: {
        autoPublish: {
          deadlineHour,
          confirmations: r.confirmations ?? {},
          missing,
          note: `검수 마감(KST ${deadlineHour}시) 경과·반려 없음 — 자동 공개. 되돌리려면 콘텐츠 관리 → 검수로 되돌리기`,
        },
      },
    });
    if (lErr) console.error("[podcast/health] 자동 공개 로그 실패:", lErr.message);
    done.push(r.scheduled_for);
  }
  return done;
}

/** 오늘(또는 지정일) 회차 상태를 보고 경보를 남기거나 걷는다. 실패해도 throw 하지 않는다. */
export async function checkPodcastDay(
  supabase: SupabaseClient,
  opts: { date?: string } = {},
): Promise<PodcastHealth> {
  const date = opts.date ?? kstDate();
  const result: PodcastHealth = { date, status: "missing", pendingCount: 0, alerted: null, autoPublished: 0 };
  try {
    // -1) 알림성(info) 경고 7일 만료 — 매시 여기서(#189). 실패해도 점검은 계속
    await expireInfoAlerts(supabase, 7);
    // 0) 검수 마감 자동 공개 — 아래 상태 판정은 공개된 결과를 본다
    const deadline = autoPublishHour();
    if (deadline !== null) {
      const published = await autoPublishOverdue(supabase, date, kstHour(), deadline);
      result.autoPublished = published.length;
      if (published.length > 0) {
        console.log(`[podcast/health] 검수 마감 자동 공개 ${published.length}편: ${published.join(", ")}`);
        const span = published.length > 1 ? `${published[0]}~${published[published.length - 1]}` : published[0];
        await recordAlertOnce(
          supabase,
          PODCAST_AUTO_KIND,
          `「${region.podcast.seriesName}」 ${published.length}편(${span})이 검수 마감(KST ${deadline}시)을 지나 사람 확인 없이 자동 공개됐습니다. 내용에 문제가 있으면 콘텐츠 관리에서 "검수로 되돌리기".`,
          { severity: "info", context: { dates: published, deadline }, dedupeKey: `${date}:${published.join(",")}`, supersede: false },
        );
      }
    }

    const [todayRes, pendingRes] = await Promise.all([
      supabase.from("podcast_episodes").select("scheduled_for, status, confirmations").eq("scheduled_for", date),
      supabase
        .from("podcast_episodes")
        .select("scheduled_for, status, confirmations")
        .eq("status", "review")
        .lte("scheduled_for", date)
        .order("scheduled_for", { ascending: true }),
    ]);
    if (todayRes.error) throw new Error(todayRes.error.message);
    if (pendingRes.error) throw new Error(pendingRes.error.message);
    const today = (todayRes.data ?? []) as Row[];
    const pending = (pendingRes.data ?? []) as Row[];
    result.pendingCount = pending.length;

    const todayStatus = pickStatus(today.map((r) => r.status));
    result.status = todayStatus;

    // 대기가 0 이면 오늘 상태와 무관하게 대기 경고는 걷는다
    if (pending.length === 0) await resolveAlerts(supabase, PODCAST_PENDING_KIND);

    if (todayStatus === "published") {
      await resolveAlerts(supabase, PODCAST_MISSING_KIND);
      if (pending.length > 0) await reportPending(supabase, date, pending, result);
      return result;
    }

    if (todayStatus === "missing" || todayStatus === "failed") {
      const why = todayStatus === "failed" ? "생성이 실패(failed)했습니다" : "회차가 생성되지 않았습니다";
      const made = await recordAlertOnce(
        supabase,
        PODCAST_MISSING_KIND,
        `오늘(${date}) 「${region.podcast.seriesName}」 ${why} — 07시 크론 실행 여부(launchd kr.zone2.podcast)·서버 로그 확인. 수동: POST /api/cron/podcast?force=1`,
        { severity: "error", context: { date, status: todayStatus }, dedupeKey: `${date}:${todayStatus}` },
      );
      if (made) result.alerted = PODCAST_MISSING_KIND;
      // 오늘 회차가 없어도 밀린 검수 대기는 따로 알린다
      if (pending.length > 0) await reportPending(supabase, date, pending, result);
      return result;
    }

    // review · generating — 생성은 됐으니 missing 경고는 걷고, 확인 대기를 알린다
    await resolveAlerts(supabase, PODCAST_MISSING_KIND);
    if (pending.length > 0) await reportPending(supabase, date, pending, result);
    return result;
  } catch (e) {
    console.error("[podcast/health] 점검 실패:", e instanceof Error ? e.message : e);
    return result;
  }
}

function pickStatus(statuses: string[]): PodcastHealth["status"] {
  if (statuses.includes("published")) return "published";
  if (statuses.includes("review")) return "review";
  if (statuses.includes("generating")) return "generating";
  if (statuses.includes("failed")) return "failed";
  return "missing";
}

/** 검수 대기 경고 — 편수·기간·미확인 소속. 편수가 바뀌면 이전 경고를 해소하고 갱신 */
async function reportPending(
  supabase: SupabaseClient,
  date: string,
  pending: Row[],
  result: PodcastHealth,
): Promise<void> {
  const missing: Record<string, number> = { okinews: 0, mbc: 0 };
  for (const r of pending) {
    for (const org of Object.keys(missing)) {
      if (!r.confirmations || !(org in r.confirmations)) missing[org] += 1;
    }
  }
  const oldest = pending[0].scheduled_for;
  const newest = pending[pending.length - 1].scheduled_for;
  const span = oldest === newest ? oldest : `${oldest}~${newest}`;
  const missingText = Object.entries(missing)
    .filter(([, n]) => n > 0)
    .map(([org, n]) => `${orgLabel(org)} ${n}편`)
    .join(" · ");
  const made = await recordAlertOnce(
    supabase,
    PODCAST_PENDING_KIND,
    `「${region.podcast.seriesName}」 검수 대기 ${pending.length}편(${span}) — 미확인: ${missingText || "없음"}. ${autoPublishHour() === null ? (REQUIRED_CONFIRMATIONS > 1 ? "양측 확인이 끝나야 공개됩니다." : "어느 한쪽이 확인하면 바로 공개됩니다.") : `반려가 없으면 KST ${autoPublishHour()}시에 자동 공개됩니다.`}`,
    {
      severity: pending.length >= 3 ? "error" : "warning",
      context: { date, pending: pending.length, oldest, newest, missing },
      dedupeKey: `${date}:${pending.length}:${missing.okinews}:${missing.mbc}`,
    },
  );
  if (made) result.alerted = PODCAST_PENDING_KIND;
}
