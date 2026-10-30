// ============================================================================
// POST /api/admin/content/rollback — 발행 콘텐츠 되돌리기 (published → review)
//
// 출처: REQ(F7) — 콘텐츠 관리 롤백 (이슈 #34)
//
// 발행/승인된 AI 콘텐츠를 검수 상태로 되돌린다(팟캐스트 published→review,
// 크로스뷰 approved→candidate). 사유 필수. 감사 로그에 사유·전이를 기록한다.
//
// 권한: content.rollback — 관리자 + 옥천신문·MBC충북 기자(한쪽 단독으로 되돌릴 수 있다, 2026-10-19 대표 지시).
//       되돌린 뒤 다시 공개하려면 이중 컨펌을 처음부터 다시 받는다(confirmations 초기화).
// 참고: moderation_action enum 에 rollback 값이 없어(0005 는 edit_approve 만 추가)
//       로그 action 은 'reject'(공개 철회 성격)로 남기고, 구조는 details.kind 로
//       'rollback' 을 명시한다 → 감사로그 UI 는 details.kind 로 롤백을 구분 표기.
// ============================================================================

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { requirePermission, okResponse, errorResponse } from "@/lib/auth";
import { CONTENT_CONFIG } from "../../_lib/content";

export const runtime = "nodejs";

const bodySchema = z.object({
  target: z.enum(["crossview", "podcast"]),
  targetId: z.string().uuid({ message: "targetId 는 UUID 여야 합니다." }),
  reason: z.string().trim().min(1, { message: "롤백 사유는 필수입니다." }).max(1000),
});

export async function POST(request: Request) {
  const guard = await requirePermission("content.rollback");
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
    const first = parsed.error.issues[0];
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      first?.message ?? "요청 형식이 올바르지 않습니다.",
    );
  }
  const { target, targetId, reason } = parsed.data;
  const cfg = CONTENT_CONFIG[target];

  const supabase = createServiceClient();
  try {
    // 발행 상태인 항목만 되돌린다 (이미 검수/반려면 대상 아님).
    const { data, error } = await supabase
      .from(cfg.table)
      .update(cfg.rollbackValues)
      .eq("id", targetId)
      .eq(cfg.statusColumn, cfg.publishedValue)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("rollback: 갱신 실패:", error);
      return errorResponse(500, "UPDATE_FAILED", "롤백에 실패했습니다.");
    }
    if (!data) {
      return errorResponse(
        409,
        "NOT_ROLLBACKABLE",
        "발행 상태인 대상만 되돌릴 수 있습니다.",
      );
    }

    // 감사 로그 — action=reject + details.kind=rollback (enum 미확장 대응).
    const { error: logErr } = await supabase.from("moderation_logs").insert({
      target,
      target_id: targetId,
      action: "reject",
      reason,
      details: {
        kind: "rollback",
        from: cfg.rollbackFrom,
        to: cfg.rollbackTo,
        reason,
        // 누가 되돌렸는지 — 소속(okinews/mbc) 또는 관리자. 한쪽 단독 조치라 감사 로그에서 바로 보이게
        by: operator.org ?? "admin",
        role: operator.role,
      },
      operator: operator.id,
    });
    if (logErr) {
      console.error("rollback: 로그 기록 실패:", logErr);
      return errorResponse(500, "LOG_FAILED", "롤백 로그 기록에 실패했습니다.");
    }

    return okResponse({ target, targetId, rolledBackTo: cfg.rollbackTo });
  } catch (error) {
    console.error("rollback: 예기치 못한 오류:", error);
    return errorResponse(500, "INTERNAL_ERROR", "처리 중 오류가 발생했습니다.");
  }
}
