// ============================================================================
// GET /api/admin/logs — 감사 로그(moderation_logs) 타임라인
//
// 출처: REQ(F7) — 감사로그 뷰 (이슈 #34), deliverables/07 §5
//
// 필터:
//   - target : crossview | podcast | forum | temperature | all
//   - action : approve | reject | edit_approve | confirm | auto_publish | cleanup | all
//              confirm = 이중 컨펌의 한쪽 기관 확인(발행 전 단계, 0019)
//              auto_publish = 팟캐 검수 마감 자동 공개(사람 승인 아님, 0023 · #185)
//   - from/to: created_at 범위 (ISO)
// cursor(created_at) 기반 페이지네이션. CSV 내보내기는 클라이언트가 수행한다.
// 권한: logs.view (viewer 포함).
// ============================================================================

import { createServiceClient } from "@/lib/supabase/server";
import { requirePermission, okResponse, errorResponse } from "@/lib/auth";
import type { ModerationLog } from "@/types";
import type { ModerationLogAction } from "../_lib/moderation";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const TARGETS = ["crossview", "podcast", "forum", "temperature"];
// 'confirm' 은 이중 컨펌의 한쪽 확인 단계 — 승인과 구분해 필터한다(0019).
const ACTIONS = ["approve", "reject", "edit_approve", "confirm", "auto_publish", "cleanup"];

/** 응답 항목 — 감사 로그 액션은 ModerationAction 에 'confirm' 을 더한 집합이다. */
type LogItem = Omit<ModerationLog, "action"> & { action: ModerationLogAction };

/** DB row(snake_case) → LogItem(camelCase) */
function toLog(r: Record<string, unknown>): LogItem {
  return {
    id: String(r.id),
    target: r.target as ModerationLog["target"],
    targetId: String(r.target_id),
    action: r.action as ModerationLogAction,
    reason: typeof r.reason === "string" ? r.reason : null,
    details:
      r.details && typeof r.details === "object"
        ? (r.details as Record<string, unknown>)
        : null,
    operator: typeof r.operator === "string" ? r.operator : null,
    createdAt: String(r.created_at),
  };
}

export async function GET(request: Request) {
  const guard = await requirePermission("logs.view");
  if (guard.response) return guard.response;

  const url = new URL(request.url);
  const target = url.searchParams.get("target");
  const action = url.searchParams.get("action");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const cursor = url.searchParams.get("cursor");
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), MAX_LIMIT)
      : DEFAULT_LIMIT;

  try {
    const supabase = createServiceClient();
    let query = supabase
      .from("moderation_logs")
      .select("id, target, target_id, action, reason, details, operator, created_at")
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (target && TARGETS.includes(target)) query = query.eq("target", target);
    if (action && ACTIONS.includes(action)) query = query.eq("action", action);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);
    if (cursor) query = query.lt("created_at", cursor);

    const { data, error } = await query;
    if (error) {
      console.error("logs: 조회 실패:", error);
      return errorResponse(500, "QUERY_FAILED", "감사 로그 조회에 실패했습니다.");
    }

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows).map(toLog);
    const nextCursor = hasMore ? (page[page.length - 1]?.createdAt ?? null) : null;

    return okResponse({ items: page, nextCursor });
  } catch (error) {
    console.error("logs: 예기치 못한 오류:", error);
    return errorResponse(500, "INTERNAL_ERROR", "처리 중 오류가 발생했습니다.");
  }
}
