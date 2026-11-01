// ============================================================================
// lib/moderation/confirm-timeout — "한쪽 확인 후 N시간 지나면 자동 공개" (대표 결정 2026-10-26)
//
// 이중 컨펌(회의 결정 [9])의 절충: 크로스뷰(candidate)·팟캐스트(review)에서 **한 기관만** 확인한 채
// CONFIRM_TIMEOUT_HOURS(기본 3) 가 지나면 상대 확인 없이 공개로 전이한다. 반려(reject)는 그대로 즉시.
//   · 판정·전이·감사 로그는 DB 함수 auto_publish_single_confirmed(p_hours)(0031) 가 **한 트랜잭션**에서 한다 —
//     행 잠금 뒤 최신 값으로 재판정(재확인·수정승인이 끼어도 옛 스냅샷으로 공개되지 않음), 로그 실패 시 롤백,
//     PostgREST 행 상한 영향 없음(codex 리뷰 2026-10-26).
//   · 확인 기록이 둘 다 없는 행은 대상이 아니다. 로그 action=auto_publish(승인율 제외) + details.autoPublish.reason.
//   · 공개되면 IndexNow 에 알린다. 되돌리기는 콘텐츠 관리 → 검수로 되돌리기(확인 기록 비움).
// 호출: /api/cron/temperature(15분)에서 runConfirmTimeoutSweep(). CONFIRM_TIMEOUT_HOURS=0|off 면 아무것도 안 한다.
// 2026-10-29 부터 REQUIRED_CONFIRMATIONS=1(한쪽 확인 즉시 공개)이라 한쪽만 확인된 채 기다리는 행이 생기지 않는다 — 그때는 스윕도 돌지 않는다.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { REQUIRED_CONFIRMATIONS } from "@/lib/auth/roles";
import { pingIndexNow } from "@/lib/seo/indexnow";

export interface SweepResult {
  hours: number;
  crossview: string[];
  podcast: string[];
  errors: number;
}

/** 자동 공개 대기 시간(시간). 미설정·0 이하·off·NaN 이면 비활성(기본 off — 양측 확인 필수 배포판이 설정 없이 절충을 켜지 않도록) */
export function confirmTimeoutHours(): number {
  const raw = (process.env.CONFIRM_TIMEOUT_HOURS ?? "off").trim().toLowerCase();
  if (raw === "off" || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 한쪽 확인 후 N시간이 지난 크로스뷰·팟캐를 공개한다(DB 함수 1회 호출). 실패해도 throw 하지 않는다. */
export async function runConfirmTimeoutSweep(supabase: SupabaseClient): Promise<SweepResult> {
  const hours = confirmTimeoutHours();
  const result: SweepResult = { hours, crossview: [], podcast: [], errors: 0 };
  if (hours <= 0 || REQUIRED_CONFIRMATIONS <= 1) return result;
  try {
    const { data, error } = await supabase.rpc("auto_publish_single_confirmed", { p_hours: hours });
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { target: string; target_id: string }[]) {
      if (row.target === "crossview") result.crossview.push(row.target_id);
      else if (row.target === "podcast") result.podcast.push(row.target_id);
    }
  } catch (e) {
    result.errors += 1;
    console.error("[confirm-timeout] 자동 공개 스윕 실패:", e instanceof Error ? e.message : e);
    return result;
  }
  const pushed = [...result.crossview.map((id) => `/crossview/${id}`), ...result.podcast.map((id) => `/podcast/${id}`)];
  if (pushed.length) {
    console.log(`[confirm-timeout] 자동 공개 ${pushed.length}건 (${hours}h)`);
    void pingIndexNow(pushed);
  }
  return result;
}
