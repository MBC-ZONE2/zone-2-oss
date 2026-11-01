// ============================================================================
// lib/ingest/normalize — 원본(Raw) → DB row(snake_case) 정규화
//
// docs/04 articles/comments 스키마에 맞춰 어댑터 산출물을 변환한다.
// 애플리케이션 경계는 camelCase(types/index.ts)지만, DB upsert payload 는
// 컬럼명(snake_case)을 그대로 써야 하므로 여기서 row 타입을 자체 정의한다.
// ============================================================================

import type { MediaSource } from "@/types";
import type {
  MediaSourceAdapter,
  MediaTier,
  RawArticle,
  RawComment,
} from "@/lib/adapters/types";
import { hashAuthor } from "./hash";
import { cleanBody, cleanTitle } from "./text";
import { redactPii } from "./redact";

// ---------------------------------------------------------------------------
// DB upsert row 타입 (snake_case) — types/index.ts 는 camelCase 라 별도 정의
// ---------------------------------------------------------------------------

/** articles 테이블 upsert payload */
export interface ArticleRow {
  source: MediaSource;
  kind: "news" | "youtube" | "forum_opinion";
  external_id: string;
  url: string | null;
  title: string;
  body: string | null;
  category: string | null;
  keywords: string[] | null;
  published_at: string | null;
  embedding: number[] | null;
  raw: unknown;
}

/** comments 테이블 upsert payload (article_id 는 적재 후 연결) */
export interface CommentRow {
  source: MediaSource;
  article_id: string | null;
  external_id: string;
  body: string;
  author_hash: string | null;
  like_count: number;
  published_at: string | null;
}

// ---------------------------------------------------------------------------
// 어댑터 → media_source enum 매핑
//
// docs/04: media_source enum 은 'mbc_cb'(광역) | 'okinews'(기초) 만 허용.
// 어댑터 id('demo' 등)가 enum 과 다를 수 있으므로 매핑한다.
//   - id 가 이미 유효 enum 이면 그대로 사용
//   - 아니면 tier 로 매핑(macro→mbc_cb, micro→okinews) — DemoAdapter 적재용
// ---------------------------------------------------------------------------

const VALID_SOURCES: readonly MediaSource[] = ["mbc_cb", "okinews"];

function isMediaSource(id: string): id is MediaSource {
  return (VALID_SOURCES as readonly string[]).includes(id);
}

/** 어댑터를 유효한 media_source 값으로 해석한다 */
export function resolveSource(adapter: {
  id: string;
  tier: MediaTier;
}): MediaSource {
  if (isMediaSource(adapter.id)) return adapter.id;
  return adapter.tier === "macro" ? "mbc_cb" : "okinews";
}

// ---------------------------------------------------------------------------
// 정규화 함수
// ---------------------------------------------------------------------------

/**
 * ISO 문자열을 UTC ISO-8601 로 정규화한다. 파싱 불가 시 null.
 */
function normalizeTimestamp(value: string | undefined | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** RawArticle → ArticleRow (임베딩은 이후 단계에서 채움) */
export function normalizeArticle(
  raw: RawArticle,
  source: MediaSource,
): ArticleRow {
  return {
    source,
    // 어댑터가 kind 를 명시하지 않으면 기본 'news' (docs/04 default).
    // 유튜브 영상 어댑터는 'youtube' 를 넘긴다.
    kind: raw.kind ?? "news",
    external_id: raw.externalId,
    url: raw.url || null,
    // 제목·본문 정리(lib/ingest/text) — 엔티티 복원·MBC `R)` 표식 제거. 모든 어댑터가 이 함수를 지난다(#189 B)
    title: cleanTitle(raw.title, { stripReportMark: source === "mbc_cb" }),
    body: raw.body ? cleanBody(raw.body) || null : null,
    category: raw.category ?? null,
    keywords: raw.keywords && raw.keywords.length > 0 ? raw.keywords : null,
    published_at: normalizeTimestamp(raw.publishedAt),
    embedding: null,
    // 원본 페이로드 보존: 어댑터가 raw 를 안 넘기면 원 객체를 통째로 저장
    raw: raw.raw ?? raw,
  };
}

/**
 * RawComment → CommentRow.
 * author 는 즉시 해시화하여 원본을 저장하지 않는다(docs/04).
 * body 는 수집 시점에 개인정보를 마스킹한다(deliverables/04 §5) —
 * 모든 어댑터가 이 함수를 지나므로 여기가 단일 관문이다.
 * article_id 는 기사 적재 후 매핑되므로 여기선 null.
 */
export function normalizeComment(
  raw: RawComment,
  source: MediaSource,
): CommentRow {
  return {
    source,
    article_id: null,
    external_id: raw.externalId,
    body: redactPii(raw.body),
    author_hash: hashAuthor(raw.authorRaw),
    like_count: typeof raw.likeCount === "number" ? raw.likeCount : 0,
    published_at: normalizeTimestamp(raw.publishedAt),
  };
}

/** 정규화에 필요한 어댑터 최소 형태 (테스트 편의) */
export type SourceAdapterLike = Pick<MediaSourceAdapter, "id" | "tier">;
