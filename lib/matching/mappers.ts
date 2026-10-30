// ============================================================================
// lib/matching/mappers — DB row(snake_case) → 도메인 타입(camelCase) 변환
//
// 규칙(types/index.ts): DB는 snake_case, 애플리케이션 경계는 camelCase.
// Supabase 응답을 도메인 타입으로 좁혀서 매핑한다. (타입 안전 경계)
//
// 사진: 회의 결정 [3] — 기사 이미지는 옥천신문/MBC충북 **원본 우선**, AI 생성(card_image_url)은
// 보완용. 원본 URL 은 articles.raw.imageUrl 에 들어 있고 매체마다 모양이 달라
// (옥천신문=절대 https, MBC=루트 상대경로 또는 빈 문자열, 유튜브=아예 없음)
// normalizeImageUrl 에서 한 번에 정규화한 뒤 Article.imageUrl 로 노출한다.
// ============================================================================

import type { Article, CrossviewPair, CrossviewCardData } from "@/types";

/** articles 테이블 row (필요 컬럼만, snake_case) */
export interface ArticleRow {
  id: string;
  source: Article["source"];
  kind: Article["kind"];
  external_id: string | null;
  url: string | null;
  title: string;
  body: string | null;
  category: string | null;
  keywords: string[] | null;
  published_at: string | null;
  embedding: number[] | string | null;
  raw: unknown;
  /**
   * 공개 select 가 `image_url:raw->>imageUrl` 별칭으로 뽑아 온 원본 사진 URL.
   * raw 를 통째로 싣지 않는 목록/상세 쿼리용 — 없으면 raw 에서 직접 읽는다.
   */
  image_url?: string | null;
  created_at: string;
}

/** crossview_pairs 테이블 row (snake_case) */
export interface CrossviewPairRow {
  id: string;
  article_macro: string | null;
  article_micro: string | null;
  similarity: number | null;
  match_score: number | null;
  summary_macro: string | null;
  summary_micro: string | null;
  reading_point: string | null;
  card_data: CrossviewCardData | null;
  card_image_url: string | null;
  card_headline: string | null;
  status: CrossviewPair["status"];
  created_at: string;
  published_at?: string | null;
}

/**
 * pgvector embedding 정규화.
 * Supabase는 vector 컬럼을 문자열("[0.1,0.2,...]")로 돌려줄 수 있어 number[]로 맞춘다.
 */
function normalizeEmbedding(
  value: number[] | string | null,
): number[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}

/** 유튜브 썸네일 호스트 — 영상 캡처는 기사 사진이 아니라 표지로 쓰지 않는다 */
const YOUTUBE_HOSTS = /(^|\.)(ytimg\.com|youtube\.com|youtu\.be)$/i;
/** MBC충북 CMS 는 og:image 를 루트 상대경로(/upload/...)로 준다 — 절대 URL 로 올린다 */
const MBC_CMS_BASE = "https://news.mbccb.co.kr";

/** raw(JSON) 안의 imageUrl 문자열만 안전하게 꺼낸다 */
function rawImageUrl(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const value = (raw as { imageUrl?: unknown }).imageUrl;
  return typeof value === "string" ? value : null;
}

/**
 * 원본 기사 사진 URL 정규화.
 *  - kind=youtube: 썸네일뿐이라 사용하지 않는다(null)
 *  - 빈 문자열/공백: MBC 는 og:image 가 없을 때 ""(빈 값)을 준다 → null
 *  - 루트 상대경로: mbc_cb 만 CMS 도메인을 붙인다(다른 매체는 기준을 알 수 없어 버린다)
 *  - https 만 통과: 사이트가 https 라 http 사진은 브라우저가 어차피 막는다(혼합 콘텐츠)
 */
export function normalizeImageUrl(
  value: string | null | undefined,
  source: Article["source"],
  kind: Article["kind"],
): string | null {
  if (kind === "youtube") return null;
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const absolute = trimmed.startsWith("/")
    ? source === "mbc_cb"
      ? `${MBC_CMS_BASE}${trimmed}`
      : null
    : trimmed;
  if (!absolute) return null;
  let parsed: URL;
  try {
    parsed = new URL(absolute);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (YOUTUBE_HOSTS.test(parsed.hostname)) return null;
  return parsed.toString();
}

/** articles row → Article */
export function toArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    source: row.source,
    kind: row.kind,
    externalId: row.external_id,
    url: row.url,
    title: row.title,
    body: row.body,
    category: row.category,
    keywords: row.keywords,
    publishedAt: row.published_at,
    embedding: normalizeEmbedding(row.embedding),
    raw: row.raw,
    // 별칭 컬럼(image_url) 우선, 전체 row 를 받은 경우 raw.imageUrl 로 폴백
    imageUrl: normalizeImageUrl(
      row.image_url ?? rawImageUrl(row.raw),
      row.source,
      row.kind,
    ),
    createdAt: row.created_at,
  };
}

/** crossview_pairs row → CrossviewPair */
export function toCrossviewPair(row: CrossviewPairRow): CrossviewPair {
  return {
    id: row.id,
    articleMacro: row.article_macro,
    articleMicro: row.article_micro,
    similarity: row.similarity,
    matchScore: row.match_score,
    summaryMacro: row.summary_macro,
    summaryMicro: row.summary_micro,
    readingPoint: row.reading_point,
    cardData: row.card_data,
    cardImageUrl: row.card_image_url,
    cardHeadline: row.card_headline,
    status: row.status,
    createdAt: row.created_at,
    publishedAt: row.published_at ?? null,
  };
}
