// ============================================================================
// POST /api/admin/moderate — 검수 승인/수정승인/반려
//
// 출처: docs/06-API명세.md §4, deliverables/05-검수-프로세스.md, REQ(F7)
//
// 동작:
//   1) 인증 + 대상별 권한 가드 (MODERATE_PERMISSION)
//   2) action 별 대상 행 갱신 (service_role)
//        - approve/reject : 상태 전이
//        - edit_approve   : 인라인 편집 필드 반영 + 승인 (before/after 스냅샷)
//   3) moderation_logs 기록 (action·reason·details·operator)
// 모든 액션은 감사 로그(moderation_logs)에 남는다(권한표 §5).
//
// 이중 컨펌(회의 결정 [9]): 크로스뷰·팟캐스트의 승인/수정승인은 **한 번에 발행되지
// 않는다.** 요청자의 소속(옥천신문/MBC충북)을 confirmations 에 기록하고, 양측이
// 모두 확인됐을 때만 기존 승인 전이(approved/published)를 실행한다. 한쪽만 확인되면
// status 는 candidate/review 그대로 두고 { confirmed, pending } 을 돌려준다.
// 공론장(forum)·온도계는 이중 컨펌 대상이 아니라 기존 단일 경로를 그대로 쓴다.
//
// 확인 기록 자체는 DB 함수 confirm_content(0019)가 원자적으로 병합하므로 이 라우트는
// confirmations 를 다시 쓰지 않는다(동시 확인 lost update 방지). 또한 아직 한쪽만
// 확인된 단계는 감사 로그에 action='confirm'(기관 확인)으로 남겨 승인 집계와 구분한다.
// ============================================================================

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import {
  requirePermission,
  okResponse,
  errorResponse,
  isDualConfirmTarget,
  MODERATE_PERMISSION,
  type AdminOrg,
} from "@/lib/auth";
import { pingIndexNow } from "@/lib/seo/indexnow";
import {
  getModerationUpdate,
  getEditApproveUpdate,
  editableSelect,
  isEditableTarget,
  pickEditableFields,
  planDualConfirm,
  logActionFor,
  resolveConfirmOrg,
  DUAL_CONFIRM_TABLE,
  QUEUE_STATE_GUARD,
  type ConfirmState,
  type EditableTarget,
} from "../_lib/moderation";

export const runtime = "nodejs";

/** 요청 바디 스키마 (docs/06 §4 + F7 edit_approve + 이중 컨펌 org 확장) */
const bodySchema = z.object({
  target: z.enum(["crossview", "podcast", "forum", "temperature"]),
  targetId: z.string().uuid({ message: "targetId 는 UUID 여야 합니다." }),
  action: z.enum(["approve", "reject", "edit_approve"]),
  reason: z.string().trim().max(1000).optional(),
  /** edit_approve 시 편집값 (컬럼→새 값). 서버에서 화이트리스트로 좁힌다. */
  edits: z.record(z.string()).optional(),
  /**
   * 확인 주체 소속. super_admin 은 필수(양쪽을 대행할 수 있으므로 명시),
   * 그 외 관리자는 생략하거나 자기 소속과 같아야 한다.
   */
  org: z.enum(["okinews", "mbc"]).optional(),
});

/** 이중 컨펌 실패 코드 → HTTP 상태 (그 외는 500) */
const CONFIRM_ERROR_STATUS: Record<string, number> = {
  TARGET_NOT_FOUND: 404,
  // 대상이 없거나 이미 발행/반려되어 큐를 떠남 — 기존 409 응답과 동일 의미.
  NOT_IN_QUEUE: 409,
};

interface ModerateResult {
  target: string;
  targetId: string;
  action: "approve" | "reject" | "edit_approve";
  statusUpdated: boolean;
  logId: string;
  /** 이중 컨펌 대상일 때만 — 확인이 끝난 소속 */
  confirmed?: AdminOrg[];
  /** 이중 컨펌 대상일 때만 — 아직 확인이 남은 소속 */
  pending?: AdminOrg[];
  /** 이중 컨펌 대상일 때만 — 이번 요청으로 발행 전이가 일어났는지 */
  published?: boolean;
}

/** 편집 전 원본 스냅샷 조회 (편집 대상 컬럼만) */
async function fetchBefore(
  supabase: SupabaseClient,
  table: string,
  target: EditableTarget,
  targetId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from(table)
    .select(editableSelect(target))
    .eq("id", targetId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  const before: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    if (key !== "id") before[key] = row[key];
  }
  return before;
}

/**
 * 대상 행 갱신 실행 — 큐 상태 가드를 함께 적용한다(교차리뷰 반영).
 * notFound = 행이 없거나 이미 처리된(큐 밖) 상태.
 */
async function applyUpdate(
  supabase: SupabaseClient,
  table: string,
  values: Record<string, unknown>,
  targetId: string,
  stateGuard: { column: string; value: string | boolean } | null,
): Promise<{ error?: true; notFound?: true; ok?: true }> {
  let query = supabase.from(table).update(values).eq("id", targetId);
  if (stateGuard) query = query.eq(stateGuard.column, stateGuard.value);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) return { error: true };
  if (!data) return { notFound: true };
  return { ok: true };
}

/**
 * 전이 전 원상복구용 스냅샷 — update 가 바꿀 컬럼들의 현재 값.
 * 감사 로그 기록 실패 시 전이를 되돌려 "로그 없는 상태 변경"을 막는다.
 */
async function fetchRevertSnapshot(
  supabase: SupabaseClient,
  table: string,
  columns: string[],
  targetId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from(table)
    .select(columns.join(", "))
    .eq("id", targetId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "요청 본문이 JSON 이 아닙니다.");
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      first?.message ?? "요청 형식이 올바르지 않습니다.",
    );
  }
  const { target, targetId, action, reason, edits, org: requestedOrg } =
    parsed.data;

  // 수정승인은 편집 필드가 있는 대상(크로스뷰·팟캐스트)만 허용.
  if (action === "edit_approve" && !isEditableTarget(target)) {
    return errorResponse(
      400,
      "NOT_EDITABLE",
      "수정승인은 크로스뷰·팟캐스트만 가능합니다.",
    );
  }

  // 대상별 권한 가드 (crossview→crossview.moderate 등)
  const guard = await requirePermission(MODERATE_PERMISSION[target]);
  if (guard.response) return guard.response;
  const operator = guard.user;

  const supabase = createServiceClient();

  try {
    // 팟캐 승인 시 published_at 을 scheduled_for(콘텐츠 날짜)로 박기 위해 먼저 읽는다.
    // (off-by-one 방지 — 제목·발행일·정렬을 콘텐츠 날짜로 일치. #107/#109)
    let scheduledFor: string | null = null;
    if (target === "podcast") {
      const { data: ep } = await supabase
        .from("podcast_episodes")
        .select("scheduled_for")
        .eq("id", targetId)
        .maybeSingle();
      scheduledFor = (ep?.scheduled_for as string | null) ?? null;
    }

    // 갱신값 + 감사 details 구성
    let update = getModerationUpdate(target, action, operator.id, scheduledFor);
    let details: Record<string, unknown> | null = null;

    let safeEdits: Record<string, string> | null = null;
    let editedContent = false;

    if (action === "edit_approve" && isEditableTarget(target)) {
      safeEdits = pickEditableFields(target, edits ?? {});
      update = getEditApproveUpdate(target, safeEdits, operator.id);
      const before = await fetchBefore(supabase, update.table, target, targetId);
      if (!before) {
        return errorResponse(
          404,
          "TARGET_NOT_FOUND",
          "해당 대상을 찾을 수 없습니다.",
        );
      }
      details = { kind: "edit_approve", before, after: safeEdits };
      // 본문이 실제로 바뀌었는지 — 바뀌었다면 상대 소속의 확인은 무효가 된다.
      editedContent = Object.entries(safeEdits).some(
        ([key, value]) => before[key] !== value,
      );
    }

    // 이중 컨펌 — 크로스뷰·팟캐스트의 승인/수정승인은 양측 확인이 모두 있어야 발행.
    let confirm: ConfirmState | null = null;
    // 로그 기록 실패 시 RPC 가 쓴 확인 기록을 되돌리기 위한 보정값.
    let confirmRevert: { table: string; values: Record<string, unknown> } | null =
      null;
    if (action !== "reject" && isDualConfirmTarget(target)) {
      const resolved = resolveConfirmOrg(operator, requestedOrg);
      if (resolved.error) {
        return errorResponse(400, resolved.error.code, resolved.error.message);
      }
      const plan = await planDualConfirm(
        supabase,
        target,
        targetId,
        resolved.org,
        operator.id,
        editedContent,
      );
      if (plan.kind === "error") {
        return errorResponse(
          CONFIRM_ERROR_STATUS[plan.code] ?? 500,
          plan.code,
          plan.message,
        );
      }
      confirm = plan.state;
      const table = update?.table ?? DUAL_CONFIRM_TABLE[target];
      // RPC 가 confirmations 를 이미 갱신했다 → 여기서 다시 쓰면 그 사이 들어온
      // 상대 확인을 덮어쓴다. 로그 실패 시 되돌릴 값만 따로 들고 있는다.
      confirmRevert = { table, values: { confirmations: plan.previous } };
      const editValues = safeEdits ?? {};
      update = plan.state.complete
        ? // 양측 확인 완료 → 기존 승인 전이(+편집값) 실행
          { table, values: { ...(update?.values ?? {}) } }
        : // 한쪽만 확인 → status 는 그대로 두고 편집값만 저장(없으면 갱신 없음)
          Object.keys(editValues).length > 0
          ? { table, values: { ...editValues } }
          : null;
      details = {
        ...(details ?? {}),
        confirm: {
          org: resolved.org,
          confirmed: plan.state.confirmed,
          pending: plan.state.pending,
          published: plan.state.complete,
          // 수정으로 상대 확인을 되돌렸는지(재확인이 필요해진 경우)
          resetOthers: editedContent,
        },
      };
    }

    /**
     * RPC 가 쓴 확인 기록을 되돌린다(상태 전이나 로그가 실패했을 때).
     * 확인 기록만 남고 전이·로그가 없는 상태를 만들지 않기 위한 보정 쓰기다.
     */
    const revertConfirm = async (): Promise<void> => {
      if (!confirmRevert) return;
      const { error: cRevertErr } = await supabase
        .from(confirmRevert.table)
        .update(confirmRevert.values)
        .eq("id", targetId);
      if (cRevertErr) {
        console.error("moderate: 확인 기록 원복 실패(수동 확인 필요):", cRevertErr);
      }
    };

    // 상태 갱신 (temperature 는 update=null → 로그만)
    // 큐 상태 가드: candidate/review/is_flagged 인 행만 전이 허용(교차리뷰 반영)
    // ⚠️ statusUpdated 는 여기서는 "행을 갱신했다"는 뜻이다(로그 실패 시 원복 판단용).
    //    응답에 담는 값은 아래에서 이중 컨펌 완료 여부까지 반영해 계산한다.
    let statusUpdated = false;
    let revertSnapshot: Record<string, unknown> | null = null;
    if (update) {
      revertSnapshot = await fetchRevertSnapshot(
        supabase,
        update.table,
        Object.keys(update.values),
        targetId,
      );
      const res = await applyUpdate(
        supabase,
        update.table,
        update.values,
        targetId,
        QUEUE_STATE_GUARD[target],
      );
      if (res.error) {
        await revertConfirm();
        return errorResponse(
          500,
          "UPDATE_FAILED",
          "대상 상태를 갱신하지 못했습니다.",
        );
      }
      if (res.notFound) {
        await revertConfirm();
        return errorResponse(
          409,
          "NOT_IN_QUEUE",
          "대상이 없거나 이미 처리되었습니다.",
        );
      }
      statusUpdated = true;
    }

    // 감사 로그 기록 — 실패 시 전이를 되돌린다(로그 없는 상태 변경 금지)
    const { data: log, error: logErr } = await supabase
      .from("moderation_logs")
      .insert({
        target,
        target_id: targetId,
        // 양측 확인이 끝나 발행으로 전이될 때만 승인, 그 전은 'confirm'(기관 확인)
        action: logActionFor(action, confirm),
        reason: reason ?? null,
        details,
        operator: operator.id,
      })
      .select("id")
      .single();

    if (logErr || !log) {
      console.error("moderate: 로그 기록 실패:", logErr);
      if (update && statusUpdated && revertSnapshot) {
        const { error: revertErr } = await supabase
          .from(update.table)
          .update(revertSnapshot)
          .eq("id", targetId);
        if (revertErr) {
          console.error("moderate: 전이 원복 실패(수동 확인 필요):", revertErr);
        }
      }
      // 확인 기록은 RPC 가 별도로 썼으므로 따로 되돌린다.
      await revertConfirm();
      return errorResponse(
        500,
        "LOG_FAILED",
        "검수 로그 기록에 실패해 전이를 취소했습니다.",
      );
    }

    const result: ModerateResult = {
      target,
      targetId,
      action,
      // 한쪽만 확인된 이중 컨펌은 행을 갱신했어도 "상태 전이"는 아니다.
      statusUpdated: statusUpdated && (confirm === null || confirm.complete),
      logId: String(log.id),
      ...(confirm
        ? {
            confirmed: confirm.confirmed,
            pending: confirm.pending,
            published: confirm.complete,
          }
        : {}),
    };
    // 공개로 전이된 크로스뷰·팟캐는 IndexNow(네이버·Bing)에 새 URL 을 알린다 — 응답을 기다리지 않는다(2026-10-26 SEO)
    if (result.statusUpdated && action !== "reject" && (target === "crossview" || target === "podcast")) {
      void pingIndexNow([`/${target}/${targetId}`]);
    }
    return okResponse(result);
  } catch (error) {
    console.error("moderate: 예기치 못한 오류:", error);
    return errorResponse(500, "INTERNAL_ERROR", "처리 중 오류가 발생했습니다.");
  }
}
