// ============================================================================
// components/forum — 통합 공론장 UI 컴포넌트 배럴
// (crossview-links 는 서버 전용 로더라 배럴에 넣지 않는다 — page.tsx 에서 직접 import)
// ============================================================================

export { PostCard } from "./post-card";
export { PostList } from "./post-list";
export { OpinionComposer } from "./opinion-composer";
export type { OpinionComposerProps, ComposerVariant, ComposerTone } from "./opinion-composer";
export { PostDetail } from "./post-detail";
export { CommentSection } from "./comment-section";
export { CommentItem } from "./comment-item";
export { LikeButton } from "./like-button";
export { ReportDialog } from "./report-dialog";
export { DeleteButton } from "./delete-button";
export { EditButton } from "./edit-button";
export { HiddenNotice } from "./hidden-notice";
export { RelativeTime } from "./relative-time";
export { WriteFab } from "./write-fab";
export { MyInkDot } from "./my-ink-dot";
export { IssueGauge } from "./issue-gauge";
