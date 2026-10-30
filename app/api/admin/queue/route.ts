// ============================================================================
// GET /api/admin/queue?type=crossview|podcast|forum — 검수 대기 목록
//
// 출처: docs/06-API명세.md §4
//       deliverables/05-검수-프로세스.md (대기 상태: candidate / review / flagged)
//
// 동작:
//   1) 인증 가드 (dashboard.view — viewer 포함 조회 가능)
//   2) type 별 검수 대기 행 조회 (service_role, RLS 우회)
//   3) cursor(created_at) 기반 페이지네이션
//
// 이중 컨펌(회의 결정 [9]): 크로스뷰·팟캐스트 항목은 meta.confirmations 로
// 소속별 확인 시각을 함께 내려 준다(카드의 "옥천신문 ✓ / MBC충북 –" 배지).
// 어느 소속 버튼을 활성화할지 판단할 수 있게 요청자 정보(viewer)도 함께 반환한다.
// ============================================================================

import { createServiceClient } from "@/lib/supabase/server";
import {
  requirePermission,
  okResponse,
  errorResponse,
  roleHasPermission,
  MODERATE_PERMISSION,
  type AdminOrg,
  type AdminRole,
} from "@/lib/auth";
import {
  QUEUE_CONFIG,
  enrichQueueItems,
  type QueueItem,
  type QueueTarget,
} from "../_lib/moderation";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** type 쿼리 파라미터 검증 */
function parseType(value: string | null): QueueTarget | null {
  if (value === "crossview" || value === "podcast" || value === "forum") {
    return value;
  }
  return null;
}

/** limit 파싱 (1~MAX_LIMIT, 기본 20) */
function parseLimit(value: string | null): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/** 큐를 보는 사람 — 어느 소속으로 확인할 수 있는지 판단하는 데 쓴다. */
interface QueueViewer {
  role: AdminRole;
  /** 이 사람이 대표하는 소속. super_admin 은 null. */
  org: AdminOrg | null;
  /** super_admin 은 양쪽 소속을 대신 확인할 수 있다. */
  canConfirmBoth: boolean;
  /** 이 대상(type)에 대해 검수 액션 권한이 있는지 */
  canModerate: boolean;
}

/** 큐 응답 페이로드 */
interface QueueResponse {
  type: QueueTarget;
  items: QueueItem[];
  /** 다음 페이지 cursor (created_at). 더 없으면 null. */
  nextCursor: string | null;
  viewer: QueueViewer;
}

export async function GET(request: Request) {
  // 1) 조회 권한 가드 (viewer 포함)
  const guard = await requirePermission("dashboard.view");
  if (guard.response) return guard.response;

  // 2) 파라미터
  const url = new URL(request.url);
  const type = parseType(url.searchParams.get("type"));
  if (!type) {
    return errorResponse(
      400,
      "INVALID_TYPE",
      "type 은 crossview|podcast|forum 중 하나여야 합니다.",
    );
  }
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor"); // created_at ISO, 선택

  const config = QUEUE_CONFIG[type];
  const supabase = createServiceClient();

  try {
    // 3) 조회: 검수대기 필터 + 최신순. limit+1 로 다음 페이지 존재 여부 확인.
    let query = supabase
      .from(config.table)
      .select(config.select)
      .eq(config.filterColumn, config.filterValue)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      // created_at < cursor (다음 페이지)
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;
    if (error) {
      console.error("queue: 조회 실패:", error);
      return errorResponse(500, "QUERY_FAILED", "대기 목록 조회에 실패했습니다.");
    }

    // 스키마가 타입 미지정이라 Supabase 가 select 결과 타입을 좁히지 못한다.
    // unknown 경유로 안전하게 캐스팅한다.
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map(config.toItem);
    // 카드 펼침용 상세 보강 (양측 기사 제목 / 신고 수 등) — 실패는 흡수.
    await enrichQueueItems(supabase, type, items);
    const nextCursor = hasMore
      ? (items[items.length - 1]?.createdAt ?? null)
      : null;

    const viewer: QueueViewer = {
      role: guard.user.role,
      org: guard.user.org,
      canConfirmBoth: guard.user.role === "super_admin",
      canModerate: roleHasPermission(guard.user.role, MODERATE_PERMISSION[type]),
    };
    const result: QueueResponse = { type, items, nextCursor, viewer };
    return okResponse(result);
  } catch (error) {
    console.error("queue: 예기치 못한 오류:", error);
    return errorResponse(500, "INTERNAL_ERROR", "처리 중 오류가 발생했습니다.");
  }
}
