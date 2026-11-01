// ============================================================================
// lib/temperature/link — 이슈 ↔ 기사 ↔ 여론 연결 (#183)
//
// 문제: 이슈 키워드(codex 가 뽑은 명사구, 예 "지방채 발행 동의안")를 댓글 본문과 substring 으로만
// 맞추니 169개 사안 중 167개가 7일 창 댓글 0건 → 감정 분산 β 가 구조적으로 0 이었다(2026-10-11 실측).
// 댓글은 기사에 달린 것이라 **기사를 거쳐** 연결하는 게 맞다:
//   이슈 키워드 → (제목·설명에 맞는) 기사 집합 → 그 기사의 댓글(article_id)
// 여기에 키워드 직접 매칭도 남기되, 여러 낱말 키워드는 **모든 낱말이 들어 있으면** 맞은 것으로 완화한다.
// 지역 공론 온도계이므로 MBC충북 유튜브의 전국 정치 클립(lib/podcast/regional)은 기사 풀에서 뺀다 —
// 7일 댓글 365건 중 대부분이 그런 클립 댓글이었고, 이슈와 무관하다.
// 순수 함수 + 로더. compute.ts(산출)와 board.ts(공개 감정 분포)가 같은 규칙을 쓴다.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { judgeRegional } from "@/lib/podcast/regional";

/** 연결에 쓰는 기사 최소 정보 */
export interface ArticleLite {
  id: string;
  source: string;
  kind: string;
  title: string;
  /** 유튜브는 설명(지역성 판정·연결에 사용), 그 외는 빈 문자열 */
  body: string;
  regional: boolean;
}

/** 기사 풀 상한 — 30일 비공고 기사 ~2,000건 */
const MAX_ARTICLES = 6000;

/**
 * 키워드가 본문에 "맞는가". 통째로 들어 있거나, 여러 낱말 키워드면 2글자 이상 낱말이 전부 들어 있으면 참.
 * 예: "옥천군 신청사" ↔ "신청사 짓는다고 옥천군이…" → 참. 한 낱말 키워드는 통째 포함만 본다.
 */
export function keywordHit(text: string, keyword: string): boolean {
  const t = text.toLowerCase();
  const k = keyword.trim().toLowerCase();
  if (!k) return false;
  if (t.includes(k)) return true;
  const toks = k.split(/\s+/).filter((x) => x.length >= 2);
  return toks.length > 1 && toks.every((x) => t.includes(x));
}

/** 여론 본문이 이슈 키워드 중 하나에라도 맞는가 */
export function matchesAnyKeyword(text: string, keywords: string[]): boolean {
  if (!text) return false;
  return keywords.some((k) => keywordHit(text, k));
}

/**
 * 최근 lookbackDays 의 비공고 기사 풀을 읽는다. 유튜브만 설명(body)까지 — 지역성 판정에 필요하고 짧다.
 * 뉴스 본문은 길어 매 15분 끌어오지 않는다(제목으로 충분히 연결된다).
 */
export async function loadArticlePool(
  supabase: SupabaseClient,
  now: Date,
  lookbackDays: number,
): Promise<ArticleLite[]> {
  const since = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const [news, youtube] = await Promise.all([
    fetchAllRows<{ id: string; source: string; kind: string; title: string | null }>(
      (from, to) =>
        supabase
          .from("articles")
          .select("id, source, kind, title")
          .neq("kind", "notice")
          .neq("kind", "youtube")
          .gte("published_at", since)
          .order("published_at", { ascending: false })
          .range(from, to),
      { max: MAX_ARTICLES, label: "articles(news)" },
    ),
    fetchAllRows<{ id: string; source: string; kind: string; title: string | null; body: string | null }>(
      (from, to) =>
        supabase
          .from("articles")
          .select("id, source, kind, title, body")
          .eq("kind", "youtube")
          .gte("published_at", since)
          .order("published_at", { ascending: false })
          .range(from, to),
      { max: MAX_ARTICLES, label: "articles(youtube)" },
    ),
  ]);
  const pool: ArticleLite[] = [];
  for (const a of news) pool.push({ id: a.id, source: a.source, kind: a.kind, title: a.title ?? "", body: "", regional: true });
  for (const a of youtube) {
    const body = a.body ?? "";
    pool.push({
      id: a.id,
      source: a.source,
      kind: a.kind,
      title: a.title ?? "",
      body,
      regional: judgeRegional({ source: a.source as "mbc_cb", kind: "youtube", title: a.title ?? "", body }).regional,
    });
  }
  return pool;
}

/** 이슈 키워드에 맞는 **지역** 기사 id 집합. 유튜브는 제목 + 설명 앞부분, 뉴스는 제목으로 본다. */
export function linkArticles(keywords: string[], pool: ArticleLite[]): Set<string> {
  const out = new Set<string>();
  if (keywords.length === 0) return out;
  for (const a of pool) {
    if (!a.regional) continue;
    const text = a.kind === "youtube" ? `${a.title} ${a.body.slice(0, 400)}` : a.title;
    if (matchesAnyKeyword(text, keywords)) out.add(a.id);
  }
  return out;
}
