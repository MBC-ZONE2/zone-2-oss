// ============================================================================
// components/forum/crossview-links — 연결 기사(article_id) → 승인 크로스뷰 페어 id
//
// 목록·상세의 "↔ 크로스뷰" 밑줄 링크용 역방향 조회. 서버 컴포넌트(page.tsx)에서만
// 부른다(브라우저 번들 금지). 실패는 빈 맵으로 폴백 — 링크는 /crossview 목록으로.
// ============================================================================

import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** articleId → crossview pair id */
export type PairByArticle = Record<string, string>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PairRow {
  id: string;
  article_macro: string | null;
  article_micro: string | null;
}

export async function loadPairIdsByArticleIds(
  supabase: SupabaseServerClient,
  articleIds: Array<string | null | undefined>,
): Promise<PairByArticle> {
  const ids = Array.from(
    new Set(
      articleIds.filter((id): id is string => Boolean(id) && UUID_RE.test(String(id))),
    ),
  );
  if (ids.length === 0) return {};
  try {
    const list = `(${ids.join(",")})`;
    const { data, error } = await supabase
      .from("crossview_pairs")
      .select("id, article_macro, article_micro")
      .eq("status", "approved")
      .or(`article_macro.in.${list},article_micro.in.${list}`)
      .order("created_at", { ascending: false });
    if (error || !data) return {};
    const map: PairByArticle = {};
    for (const row of data as PairRow[]) {
      // 최신 페어를 우선(정렬이 최신순이므로 먼저 본 값을 유지)
      if (row.article_macro && !map[row.article_macro]) map[row.article_macro] = row.id;
      if (row.article_micro && !map[row.article_micro]) map[row.article_micro] = row.id;
    }
    return map;
  } catch {
    return {};
  }
}

/** 연결 기사가 있을 때의 "↔ 크로스뷰" href (페어를 모르면 목록으로) */
export function crossviewHref(
  articleId: string | null,
  pairByArticle?: PairByArticle,
): string | null {
  if (!articleId) return null;
  const pairId = pairByArticle?.[articleId];
  return pairId ? `/crossview/${pairId}` : "/crossview";
}
