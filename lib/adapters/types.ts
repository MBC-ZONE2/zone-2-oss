// ============================================================================
// 매체 어댑터 인터페이스 (Core 확장점)
//
// 출처: docs/06-API명세.md §1
// Core 는 특정 매체를 모른다. 어댑터를 주입받아 수집한다.
// 실제 어댑터(MbcAdapter·OkinewsAdapter)는 Deploy 단계에서 등록한다.
// ============================================================================

/** 매체 등급 — 광역 / 기초 */
export type MediaTier = "macro" | "micro";

/** 콘텐츠 종류 — docs/04 articles.kind */
export type ArticleKind = "news" | "youtube" | "forum_opinion";

/** 수집된 원본 기사 (정규화 전) */
export interface RawArticle {
  externalId: string;
  url: string;
  title: string;
  body: string;
  category?: string;
  keywords?: string[];
  /** ISO-8601 */
  publishedAt: string;
  /** 미지정 시 'news' (기사가 기본) — 영상은 'youtube' 를 명시한다 */
  kind?: ArticleKind;
  raw?: unknown;
}

/** 수집된 원본 댓글 (정규화 전) */
export interface RawComment {
  externalId: string;
  /** 원본 기사/영상 식별자 */
  articleRef: string;
  body: string;
  /** 어댑터가 넘기되, Core 가 즉시 해시화한다 */
  authorRaw?: string;
  likeCount?: number;
  /** ISO-8601 */
  publishedAt: string;
}

/** 매체 소스 어댑터 */
export interface MediaSourceAdapter {
  /** 'mbc_cb' | 'okinews' | 'demo' */
  id: string;
  tier: MediaTier;
  fetchArticles(since: Date): Promise<RawArticle[]>;
  fetchComments(articleRef: string): Promise<RawComment[]>;
}
