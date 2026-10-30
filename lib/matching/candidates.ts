// ============================================================================
// lib/matching/candidates — pgvector 코사인 Top-N 후보 조회 + 필터
//
// deliverables/01 §4: 신규 기사 → 임베딩 → 반대 매체와 벡터 유사도 Top-N(10)
//   → 발행일 ±7일 + 키워드 교집합 필터.
//
// pgvector 코사인 검색은 Supabase RPC(match_opposite_articles)로 위임한다.
// (HNSW 인덱스 활용; SQL 정의는 supabase/migrations 담당 영역이라 여기선 호출만)
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Article, MediaSource } from "@/types";
import type { MatchCandidate, MatchOptions } from "./types";
import { toArticle, type ArticleRow } from "./mappers";
import { NON_STORY_RE } from "@/lib/podcast/regional";

/** 기준 기사의 반대 tier(매체) 결정. macro(mbc_cb) ↔ micro(okinews) */
export function oppositeSource(source: MediaSource): MediaSource {
  return source === "mbc_cb" ? "okinews" : "mbc_cb";
}

/**
 * pgvector RPC가 돌려주는 row 형태.
 * articles 컬럼 + 코사인 거리(distance) 또는 유사도(similarity)를 포함한다.
 */
type CandidateRpcRow = ArticleRow & {
  similarity?: number | null;
  distance?: number | null;
};

/**
 * 코사인 거리(0~2)를 유사도(0~1)로 환산.
 * pgvector `<=>` 연산자는 cosine distance(= 1 - cosine_similarity)를 돌려준다.
 */
function toSimilarity(row: CandidateRpcRow): number {
  if (typeof row.similarity === "number") return row.similarity;
  if (typeof row.distance === "number") return 1 - row.distance;
  return 0;
}

/** 두 기사 발행일이 허용 범위(±days) 안인지 */
function withinPublishedWindow(
  base: Article,
  candidate: Article,
  days: number,
): boolean {
  if (!base.publishedAt || !candidate.publishedAt) return false;
  const baseMs = new Date(base.publishedAt).getTime();
  const candMs = new Date(candidate.publishedAt).getTime();
  if (Number.isNaN(baseMs) || Number.isNaN(candMs)) return false;
  const windowMs = days * 24 * 60 * 60 * 1000;
  return Math.abs(baseMs - candMs) <= windowMs;
}

/**
 * 기사가 아니라 **지면 인덱스 페이지**인지 판정한다.
 *
 * 옥천신문 크롤 결과에는 "1852호 지면 보기" 처럼 발행 회차 목차만 있는 항목이
 * 섞여 들어온다. 본문이 사실상 없어 매칭·요약이 전부 제목 반복으로 퇴화하고
 * (readingPoint = `"1852호 지면 보기" — 같은 사안, 두 개의 시선`), 시연 목록
 * 상단을 차지한다. 후보 단계에서 걸러 페어 자체가 생기지 않게 한다.
 */
const INDEX_PAGE_TITLE = /^\s*\d+호\s*지면\s*보기\s*$/;

export function isIndexPageArticle(article: Article): boolean {
  return INDEX_PAGE_TITLE.test(article.title ?? "");
}

/**
 * 기사가 아닌 항목 — 지면 인덱스 페이지, 유튜브 라이브·전체 다시보기("다시보기ㅣ뉴스투데이", "[LIVE] 실시간 스트리밍").
 * 다시보기·라이브는 하루치 뉴스가 통째라 임베딩이 아무 옥천 기사와도 적당히 가까워 페어가 만들어지고
 * 목록에 "다시보기" 가 사안처럼 떴다(2026-10-19 #188 정리 중 3건 발견). 기준·후보 양쪽에서 뺀다.
 */
export function isNonStoryArticle(article: Article): boolean {
  return isIndexPageArticle(article) || NON_STORY_RE.test(article.title ?? "");
}

/** 키워드 교집합이 1개 이상인지 (양쪽 키워드가 없으면 통과시켜 후보 유지) */
function hasKeywordOverlap(base: Article, candidate: Article): boolean {
  const baseKeywords = base.keywords ?? [];
  const candKeywords = candidate.keywords ?? [];
  if (baseKeywords.length === 0 || candKeywords.length === 0) return true;
  const set = new Set(baseKeywords.map((k) => k.toLowerCase()));
  return candKeywords.some((k) => set.has(k.toLowerCase()));
}

/**
 * 신규(기준) 기사에 대해 반대 매체의 pgvector 코사인 Top-N 후보를 조회하고
 * 발행일 ±N일 + 키워드 교집합으로 필터링한다.
 *
 * @returns 유사도 내림차순 후보 배열 (필터 통과분)
 */
export async function findCandidates(
  supabase: SupabaseClient,
  base: Article,
  options: MatchOptions,
): Promise<MatchCandidate[]> {
  if (!base.embedding || base.embedding.length === 0) {
    // 임베딩이 없으면 벡터 매칭 불가 — 빈 후보.
    return [];
  }

  // 지면 인덱스 페이지·라이브·다시보기는 기준 기사로도 후보로도 쓰지 않는다.
  if (isNonStoryArticle(base)) return [];

  const targetSource = oppositeSource(base.source);

  // pgvector 코사인 Top-N RPC 호출.
  // SQL 시그니처(매핑 담당 영역): match_opposite_articles(
  //   query_embedding vector(1536), target_source media_source,
  //   match_count int, exclude_id uuid
  // ) returns setof articles + similarity
  const { data, error } = await supabase.rpc("match_opposite_articles", {
    query_embedding: base.embedding,
    target_source: targetSource,
    match_count: options.topN,
    exclude_id: base.id,
  });

  if (error) {
    throw new Error(`pgvector 후보 조회 실패: ${error.message}`);
  }

  const rows = (data ?? []) as CandidateRpcRow[];

  return rows
    .map((row) => ({
      article: toArticle(row),
      similarity: toSimilarity(row),
    }))
    .filter(
      (c) =>
        !isNonStoryArticle(c.article) &&
        withinPublishedWindow(base, c.article, options.publishedWithinDays) &&
        hasKeywordOverlap(base, c.article),
    );
}
