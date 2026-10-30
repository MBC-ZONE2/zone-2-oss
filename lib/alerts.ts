// ============================================================================
// lib/alerts — 시스템 경고(운영 알람) 기록
//
// 서버/크론에서 발생한 운영 문제(예: 구독 CLI 재랭킹 실패)를 system_alerts 에
// 남겨 관리자 콘솔에 노출한다. 기록 자체가 실패해도 호출부를 깨지 않는다.
// service_role 클라이언트로 호출한다(RLS 우회).
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type AlertSeverity = "info" | "warning" | "error";

export async function recordAlert(
  supabase: SupabaseClient,
  kind: string,
  message: string,
  opts: { severity?: AlertSeverity; context?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await supabase.from("system_alerts").insert({
      kind,
      message,
      severity: opts.severity ?? "warning",
      context: opts.context ?? {},
    });
  } catch (error) {
    // 알람 기록 실패가 본 작업을 깨지 않도록 흡수(로그만).
    console.error("[alerts] recordAlert 실패:", error);
  }
}

/**
 * 특정 kind 의 **미해결** 경고를 모두 해소(resolved=true) 처리한다.
 * 근본 원인이 회복됐을 때(예: codex 재랭킹이 다시 성공) 호출해 자동으로 배너를
 * 걷는다 — 앱에 수동 해소 UI 가 없어 경고가 영구히 남던 문제를 막는다.
 * 기록 실패가 본 작업을 깨지 않도록 흡수한다.
 */
export async function resolveAlerts(
  supabase: SupabaseClient,
  kind: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("system_alerts")
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_note: "auto" })
      .eq("kind", kind)
      .eq("resolved", false);
    if (error) throw new Error(error.message); // supabase-js 는 throw 하지 않는다 — 로그라도 남기게(codex 리뷰)
  } catch (error) {
    console.error("[alerts] resolveAlerts 실패:", error);
  }
}

/**
 * 관리자가 경고 하나를 "확인"으로 해소한다(0028, #189). 누가·언제 확인했는지 남긴다.
 * @returns 실제로 바뀐 행이 있으면 true(이미 해소됐거나 없는 id 면 false)
 */
export async function resolveAlertById(
  supabase: SupabaseClient,
  id: string,
  by: string,
  note = "manual",
): Promise<boolean> {
  const { data, error } = await supabase
    .from("system_alerts")
    .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: by, resolved_note: note })
    .eq("id", id)
    .eq("resolved", false)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/**
 * 알림성(info) 경고를 `days` 일이 지나면 자동 만료한다(#189). info 는 "이런 일이 있었다"는 기록이라
 * 상황 회복을 감지할 코드가 없어 영구히 쌓였다(팟캐 마감 자동 공개 14건). 매시 크론(팟캐 health)이 부른다.
 * @returns 만료 처리한 건수
 */
export async function expireInfoAlerts(supabase: SupabaseClient, days = 7): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
    const { data, error } = await supabase
      .from("system_alerts")
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_note: `expired-${days}d` })
      .eq("resolved", false)
      .eq("severity", "info")
      .lt("created_at", cutoff)
      .select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).length;
  } catch (error) {
    console.error("[alerts] expireInfoAlerts 실패:", error);
    return 0;
  }
}

/**
 * 같은 kind 의 경고를 **중복 없이** 남긴다 — 매시 크론이 같은 문제를 매번 새 행으로 쌓지 않게.
 * `dedupeKey`(context.dedupe) 가 같은 미해결 경고가 이미 있으면 아무것도 하지 않는다.
 * `supersede`(기본 true) 면 dedupeKey 가 다른 같은 kind 의 미해결 경고는 해소하고 새로 남긴다
 * — "검수 대기 3편" 이 다음 날 "4편" 으로 바뀌는 식의 갱신에 쓴다.
 * @returns 새로 남겼으면 true
 */
export async function recordAlertOnce(
  supabase: SupabaseClient,
  kind: string,
  message: string,
  opts: {
    severity?: AlertSeverity;
    context?: Record<string, unknown>;
    dedupeKey: string;
    supersede?: boolean;
  },
): Promise<boolean> {
  try {
    const { data, error: selErr } = await supabase
      .from("system_alerts")
      .select("id, context")
      .eq("kind", kind)
      .eq("resolved", false);
    if (selErr) throw new Error(selErr.message);
    const open = (data ?? []) as { id: string; context: Record<string, unknown> | null }[];
    if (open.some((a) => a.context?.dedupe === opts.dedupeKey)) return false;
    if ((opts.supersede ?? true) && open.length > 0) {
      const { error: updErr } = await supabase
        .from("system_alerts")
        .update({ resolved: true })
        .in("id", open.map((a) => a.id));
      if (updErr) throw new Error(updErr.message);
    }
    const { error: insErr } = await supabase.from("system_alerts").insert({
      kind,
      message,
      severity: opts.severity ?? "warning",
      context: { ...(opts.context ?? {}), dedupe: opts.dedupeKey },
    });
    if (insErr) throw new Error(insErr.message);
    return true;
  } catch (error) {
    console.error("[alerts] recordAlertOnce 실패:", error);
    return false;
  }
}
