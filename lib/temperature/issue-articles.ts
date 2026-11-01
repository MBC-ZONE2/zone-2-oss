// ============================================================================
// lib/temperature/issue-articles — 사안에 연결된 지역 기사 (온도 상세 "관련 기사", 2026-10-19)
//
// 온도계에서 사안을 눌렀을 때 "무슨 기사 때문에 뜨거운가"를 보여 주고 원문으로 보낸다.
// 연결 규칙은 산출(lib/temperature/link.linkArticles)과 같다 — 키워드 → 지역 기사(30일, 공고·전국 클립 제외).
// 크로스뷰로 엮인 기사는 페어 id 를 붙여 상세로도 갈 수 있게 한다. anon + RLS(공개 읽기).
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import { linkArticles, loadArticlePool } from "./link";

export interface IssueArticle {
  id: string;
  source: string;
  kind: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  /** 승인 크로스뷰 페어 id(있으면) */
  pairId: string | null;
}

const LINK_DAYS = 30;

export async function getIssueArticles(keywords: string[], limit = 6): Promise<IssueArticle[]> {
  const kws = keywords.filter(Boolean);
  if (kws.length === 0) return [];
  const supabase = await createClient();
  const pool = await loadArticlePool(supabase, new Date(), LINK_DAYS);
  const linked = linkArticles(kws, pool);
  if (linked.size === 0) return [];

  // 풀은 최신순이라 앞에서 자르면 최근 기사부터 — URL 길이 한도(in/or 필터) 안에서 충분히 넉넉하다
  const ids = [...linked].slice(0, 60);
  const [artsRes, pairsRes] = await Promise.all([
    supabase
      .from("articles")
      .select("id, source, kind, title, url, published_at")
      .in("id", ids)
      .order("published_at", { ascending: false })
      .limit(limit),
    supabase
      .from("crossview_pairs")
      .select("id, article_macro, article_micro")
      .eq("status", "approved")
      .or(`article_macro.in.(${ids.join(",")}),article_micro.in.(${ids.join(",")})`)
      .limit(50),
  ]);
  if (artsRes.error) throw new Error(`관련 기사 조회 실패: ${artsRes.error.message}`);
  if (pairsRes.error) console.error("[issue-articles] 크로스뷰 페어 조회 실패:", pairsRes.error.message);
  const arts = artsRes.data;
  const pairs = pairsRes.error ? [] : pairsRes.data;
  const pairOf = new Map<string, string>();
  for (const p of (pairs ?? []) as { id: string; article_macro: string; article_micro: string }[]) {
    if (!pairOf.has(p.article_macro)) pairOf.set(p.article_macro, p.id);
    if (!pairOf.has(p.article_micro)) pairOf.set(p.article_micro, p.id);
  }
  return ((arts ?? []) as { id: string; source: string; kind: string; title: string | null; url: string | null; published_at: string | null }[]).map((a) => ({
    id: a.id,
    source: a.source,
    kind: a.kind,
    title: a.title ?? "",
    url: a.url,
    publishedAt: a.published_at,
    pairId: pairOf.get(a.id) ?? null,
  }));
}
