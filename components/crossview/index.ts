// ============================================================================
// components/crossview — 크로스뷰 UI 컴포넌트 (「일점 지면」 목록·상세)
// ============================================================================

// 목록
export { CrossviewCard, CrossviewRow } from "./crossview-card";
export { CrossviewPublisher } from "./publisher-byline";
export { CrossviewList } from "./crossview-list";
export { CrossviewFilter } from "./crossview-filter";
export {
  CrossviewCardSkeleton,
  CrossviewListSkeleton,
} from "./crossview-skeleton";

// 상세
export { ArticlePanel } from "./article-panel";
export { LensView } from "./lens-view";
export { AiSummary } from "./ai-summary";
export { ShareButton } from "./share-button";
export { CardCarousel } from "./card-carousel";
export { ForumPreview } from "./forum-preview";
export { KeywordText } from "./keyword-text";
export { Marker, OUTLET, TIER, type MarkerSide } from "./marker";

// 포맷·텍스트 헬퍼(순수 함수)
export {
  sourceLabel,
  tierLabel,
  formatDate,
  formatScore,
  confidencePercent,
} from "./format";
export {
  splitHeadline,
  firstSentence,
  excerpt,
  keywordIntersection,
  segmentByKeywords,
  type TextSegment,
} from "./text";
