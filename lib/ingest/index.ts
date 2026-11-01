// ============================================================================
// lib/ingest — 데이터 수집 파이프라인 (배럴)
//
// docs/07 Phase 1: 어댑터 수집 → 정규화 → 임베딩 → articles/comments 적재.
// /api/cron/ingest 가 runIngest() 를 호출한다.
// ============================================================================

export { runIngest } from "./ingest";
export type {
  RunIngestOptions,
  IngestResult,
  AdapterIngestResult,
} from "./ingest";

export {
  normalizeArticle,
  normalizeComment,
  resolveSource,
} from "./normalize";
export type { ArticleRow, CommentRow } from "./normalize";

export { hashAuthor } from "./hash";
export { embedArticles } from "./embed-articles";
export type { EmbedArticlesResult } from "./embed-articles";
