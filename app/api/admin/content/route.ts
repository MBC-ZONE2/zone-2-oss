// ============================================================================
// GET /api/admin/content — 발행/반려 콘텐츠 이력 (콘텐츠 관리 탭)
//
// 출처: REQ(F7) — 관리자 대시보드 콘텐츠 관리 (이슈 #34)
//
// AI 생성 콘텐츠(크로스뷰·팟캐스트)의 처리 이력을 조회한다.
//   - type   : crossview | podcast | all
//   - status : published | rejected | all
//   - q      : 제목 검색 (ilike)
// 조회 권한: dashboard.view (viewer 포함). 롤백은 별도 엔드포인트/권한.
// ============================================================================

import { createServiceClient } from "@/lib/supabase/server";
import { requirePermission, okResponse, errorResponse } from "@/lib/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONTENT_CONFIG,
  isContentTarget,
  type ContentItem,
  type ContentTarget,
} from "../_lib/content";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** 한 대상의 이력 조회 */
async function queryContent(
  supabase: SupabaseClient,
  target: ContentTarget,
  opts: { status: string | null; q: string | null; limit: number },
): Promise<ContentItem[]> {
  const cfg = CONTENT_CONFIG[target];
  // status 필터: 특정 값이면 그 값만, 아니면 발행/반려 전체.
  const statuses =
    opts.status === "published"
      ? [cfg.publishedValue]
      : opts.status === "rejected"
        ? [cfg.rejectedValue]
        : [...cfg.statusValues];

  let query = supabase
    .from(cfg.table)
    .select(cfg.select)
    .in(cfg.statusColumn, statuses)
    .order("created_at", { ascending: false })
    .limit(opts.limit);

  if (opts.q) query = query.ilike(cfg.searchColumn, `%${opts.q}%`);

  const { data, error } = await query;
  if (error) {
    console.error(`content: ${target} 조회 실패:`, error);
    return [];
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map(cfg.toItem);
}

export async function GET(request: Request) {
  const guard = await requirePermission("dashboard.view");
  if (guard.response) return guard.response;

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type") ?? "all";
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q")?.trim() || null;
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), MAX_LIMIT)
      : DEFAULT_LIMIT;

  const targets: ContentTarget[] = isContentTarget(typeParam)
    ? [typeParam]
    : ["crossview", "podcast"];

  try {
    const supabase = createServiceClient();
    const lists = await Promise.all(
      targets.map((t) => queryContent(supabase, t, { status, q, limit })),
    );
    // 병합 후 처리 일시 내림차순 정렬 + limit 절단.
    const items = lists
      .flat()
      .sort((a, b) => b.processedAt.localeCompare(a.processedAt))
      .slice(0, limit);

    return okResponse({ items });
  } catch (error) {
    console.error("content: 예기치 못한 오류:", error);
    return errorResponse(500, "INTERNAL_ERROR", "처리 중 오류가 발생했습니다.");
  }
}
