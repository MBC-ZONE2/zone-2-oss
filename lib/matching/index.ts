// ============================================================================
// lib/matching — 크로스뷰 매칭 엔진 (그룹 A)
//
// deliverables/01 크로스뷰 기능 정의서 §4 처리 로직 구현.
//   - engine:     매칭 파이프라인 (후보→재랭킹→요약→카드→저장)
//   - candidates: pgvector 코사인 Top-N + 발행일/키워드 필터
//   - card:       카드뉴스(card_data) 구성
//   - queries:    approved 페어 조회 (공개 API용)
//   - mappers:    DB row(snake_case) → 도메인 타입(camelCase)
// ============================================================================

export { runMatching } from "./engine";
export { findCandidates, oppositeSource, isNonStoryArticle } from "./candidates";
export { storyKey, sameStory, collapseSameStoryCandidates, filterStoryDuplicates } from "./story";
export { buildCardData, sourceLabel } from "./card";
export type { CardSlide, CrossviewCardPayload } from "./card";
export {
  listApprovedPairs,
  getApprovedPair,
} from "./queries";
export type {
  CrossviewListResult,
  CrossviewPairWithArticles,
} from "./queries";
export {
  DEFAULT_MATCH_OPTIONS,
} from "./types";
export type {
  MatchOptions,
  MatchCandidate,
  MatchResult,
  MatchRunSummary,
} from "./types";
export {
  toArticle,
  toCrossviewPair,
} from "./mappers";
export type {
  ArticleRow,
  CrossviewPairRow,
} from "./mappers";
