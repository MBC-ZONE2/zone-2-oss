// ============================================================================
// POST /api/admin/moderate/bulk — 일괄 승인/반려 (최대 20건)
//
// 출처: REQ(F7) — 검수 큐 일괄 처리 (이슈 #34)
//
// 동작:
//   1) 인증 가드 (requireAuth) — 항목별로 대상 권한을 개별 확인
//   2) 항목별 상태 전이 + 감사 로그 (부분 실패 허용 — 항목별 결과 반환)
// 플래그 항목 제외는 서버가 강제한다(교차리뷰 반영 — 직접 POST 우회 차단):
//   - 공론장: 큐 항목이 전부 플래그 상태 → 일괄 처리 자체를 거부(개별 검토)
//   - 팟캐스트: 대본 금칙어 히트 시 항목 거부
//   - 큐 상태 가드: candidate/review 인 행만 전이 허용
// 이중 컨펌(회의 결정 [9]): 일괄 승인도 **한 번에 발행되지 않는다.** 크로스뷰·
// 팟캐스트는 요청자 소속의 확인만 기록하고, 양측이 모두 확인된 항목만 발행된다.
// 확인 기록 병합은 DB 함수 confirm_content(0019)가 원자적으로 하고(동시 확인 lost
// update 방지), 아직 한쪽만 확인된 단계는 감사 로그 action='confirm' 으로 남긴다.
// ============================================================================

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import {
  requireAuth,
  okResponse,
  errorResponse,
  isDualConfirmTarget,
  roleHasPermission,
  MODERATE_PERMISSION,
  type AdminUser,
} from "@/lib/auth";
import { checkBannedWords } from "@/lib/moderation";
import {
  getModerationUpdate,
  planDualConfirm,
  logActionFor,
  resolveConfirmOrg,
  DUAL_CONFIRM_TABLE,
  QUEUE_STATE_GUARD,
  type ConfirmState,
} from "../../_lib/moderation";

export const runtime = "nodejs";

const MAX_ITEMS = 20;

const itemSchema = z.object({
  target: z.enum(["crossview", "podcast", "forum"]),
  targetId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(1000).optional(),
});

const bodySchema = z.object({
  items: z.array(itemSchema).min(1).max(MAX_ITEMS),
});

type BulkItem = z.infer<typeof itemSchema>;

/** 항목별 처리 결과 */
interface ItemResult {
  targetId: string;
  ok: boolean;
  code?: string;
  message?: string;
  /**
   * 이중 컨펌 대상에서 이번 처리로 발행까지 갔는지.
   * false 면 내 소속 확인만 기록된 것이라 항목이 큐에 남는다(상대 확인 대기).
   */
  published?: boolean;
  /** 확인이 끝난 소속 목록 (이중 컨펌 대상만) */
  confirmed?: string[];
}

/** 단건 처리 — 상태 전이 + 감사 로그. 실패 시 code/message 를 담아 반환. */
async function processOne(
  supabase: SupabaseClient,
  item: BulkItem,
  operator: AdminUser,
): Promise<ItemResult> {
  const operatorId = operator.id;
  const { target, targetId, action, reason } = item;
  // 반려는 사유 필수
  if (action === "reject" && (!reason || reason.length === 0)) {
    return { targetId, ok: false, code: "REASON_REQUIRED", message: "반려 사유가 필요합니다." };
  }

  // 서버측 제외 강제(교차리뷰 반영) — 클라이언트 제외 로직의 우회 차단
  if (target === "forum") {
    return {
      targetId,
      ok: false,
      code: "BULK_NOT_ALLOWED",
      message: "공론장 항목은 개별 검토가 필요합니다.",
    };
  }
  // 팟캐는 승인 시 published_at 을 scheduled_for(콘텐츠 날짜)로 박으므로
  // 여기서 함께 읽어 둔다(off-by-one 방지 — 아래 getModerationUpdate 로 전달).
  let scheduledFor: string | null = null;
  if (target === "podcast") {
    const { data: ep } = await supabase
      .from("podcast_episodes")
      .select("script, scheduled_for")
      .eq("id", targetId)
      .maybeSingle();
    scheduledFor = (ep?.scheduled_for as string | null) ?? null;
    const hit = checkBannedWords(String(ep?.script ?? ""));
    if (hit.matched) {
      return {
        targetId,
        ok: false,
        code: "FLAGGED_EXCLUDED",
        message: "금칙어 감지 — 개별 검토가 필요합니다.",
      };
    }
  }

  let update = getModerationUpdate(target, action, operatorId, scheduledFor);

  // 이중 컨펌 — 승인은 내 소속 확인만 기록하고, 양측이 모두 확인돼야 발행 전이.
  let confirm: ConfirmState | null = null;
  // 로그 기록 실패 시 RPC 가 쓴 확인 기록을 되돌리기 위한 보정값.
  let confirmRevert: { table: string; values: Record<string, unknown> } | null = null;
  const revertConfirm = async (): Promise<void> => {
    if (!confirmRevert) return;
    const { error } = await supabase
      .from(confirmRevert.table)
      .update(confirmRevert.values)
      .eq("id", targetId);
    if (error) console.error("bulk: 확인 기록 원복 실패(수동 확인 필요):", error);
  };
  if (action === "approve" && isDualConfirmTarget(target)) {
    const resolved = resolveConfirmOrg(operator);
    if (resolved.error) {
      return { targetId, ok: false, code: resolved.error.code, message: resolved.error.message };
    }
    const plan = await planDualConfirm(supabase, target, targetId, resolved.org, operatorId);
    if (plan.kind === "error") {
      return { targetId, ok: false, code: plan.code, message: plan.message };
    }
    confirm = plan.state;
    const table = update?.table ?? DUAL_CONFIRM_TABLE[target];
    // RPC 가 confirmations 를 이미 썼다 → 여기서 다시 쓰지 않는다.
    confirmRevert = { table, values: { confirmations: plan.previous } };
    update = plan.state.complete
      ? // 양측 확인 완료 → 기존 승인 전이 실행
        { table, values: { ...(update?.values ?? {}) } }
      : // 한쪽만 확인 → 상태 갱신 없음(확인 기록은 RPC 가 이미 저장)
        null;
  }

  let revertSnapshot: Record<string, unknown> | null = null;
  if (update) {
    // 원복 스냅샷(로그 실패 시 되돌림) — 바꿀 컬럼의 현재 값만
    const { data: snap } = await supabase
      .from(update.table)
      .select(Object.keys(update.values).join(", "))
      .eq("id", targetId)
      .maybeSingle();
    revertSnapshot = (snap as Record<string, unknown> | null) ?? null;

    let query = supabase.from(update.table).update(update.values).eq("id", targetId);
    const stateGuard = QUEUE_STATE_GUARD[target];
    if (stateGuard) query = query.eq(stateGuard.column, stateGuard.value);
    const { data, error } = await query.select("id").maybeSingle();
    if (error) {
      await revertConfirm();
      return { targetId, ok: false, code: "UPDATE_FAILED", message: "상태 갱신 실패" };
    }
    if (!data) {
      await revertConfirm();
      return { targetId, ok: false, code: "NOT_IN_QUEUE", message: "대상이 없거나 이미 처리됨" };
    }
  }

  const { error: logErr } = await supabase.from("moderation_logs").insert({
    target,
    target_id: targetId,
    // 양측 확인이 끝나 발행으로 전이될 때만 승인, 그 전은 'confirm'(기관 확인)
    action: logActionFor(action, confirm),
    reason: reason ?? null,
    details: { kind: "bulk", confirm: confirm ?? null },
    operator: operatorId,
  });
  if (logErr) {
    // 로그 없는 상태 변경 금지 — 전이를 되돌리고 실패로 보고(교차리뷰 반영)
    if (update && revertSnapshot) {
      const { error: revertErr } = await supabase
        .from(update.table)
        .update(revertSnapshot)
        .eq("id", targetId);
      if (revertErr) {
        console.error("bulk: 전이 원복 실패(수동 확인 필요):", revertErr);
      }
    }
    // 확인 기록은 RPC 가 별도로 썼으므로 따로 되돌린다.
    await revertConfirm();
    return { targetId, ok: false, code: "LOG_FAILED", message: "로그 기록 실패 — 전이 취소" };
  }

  return {
    targetId,
    ok: true,
    published: confirm ? confirm.complete : true,
    ...(confirm ? { confirmed: confirm.confirmed } : {}),
  };
}

export async function POST(request: Request) {
  const guard = await requireAuth();
  if (guard.response) return guard.response;
  const operator = guard.user;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "요청 본문이 JSON 이 아닙니다.");
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      `items 는 1~${MAX_ITEMS}건이어야 합니다.`,
    );
  }

  const supabase = createServiceClient();
  const results: ItemResult[] = [];

  for (const item of parsed.data.items) {
    // 항목별 대상 권한 확인 (권한 없으면 개별 실패로 기록)
    if (!roleHasPermission(operator.role, MODERATE_PERMISSION[item.target])) {
      results.push({
        targetId: item.targetId,
        ok: false,
        code: "FORBIDDEN",
        message: "권한 없음",
      });
      continue;
    }
    results.push(await processOne(supabase, item, operator));
  }

  const success = results.filter((r) => r.ok).length;
  return okResponse({
    results,
    summary: { total: results.length, success, failed: results.length - success },
  });
}
