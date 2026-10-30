// ============================================================================
// lib/forum — 통합 공론장 코어 배럴 (그룹 D)
//
// 게시판 CRUD + 모더레이션 연동의 서버 사이드 로직.
// UI/라우트는 여기서 필요한 것만 import 한다.
// ============================================================================

export { hashAuthor, shortAuthorLabel, authorDisplayLabel } from "./hash";
export {
  createPostSchema,
  createCommentSchema,
  editPostSchema,
  deleteSchema,
  listQuerySchema,
  reportSchema,
  REPORT_REASONS,
  FORUM_LIMITS,
} from "./schema";
export type {
  CreatePostInput,
  CreatePostParsed,
  CreateCommentInput,
  CreateCommentParsed,
  ListQueryParsed,
  ReportInput,
  ReportReason,
} from "./schema";
export {
  listPosts,
  getPostWithComments,
  insertPost,
  insertComment,
  postExists,
  fetchPasswordHash,
  hasRecentWriteFromIp,
  updatePost,
  updateComment,
  softDeletePost,
  softDeleteComment,
} from "./queries";
export type {
  ListPostsResult,
  InsertPostInput,
  InsertCommentInput,
  PasswordTable,
} from "./queries";
export {
  hashPassword,
  verifyPassword,
  hashIp,
  clientIpFrom,
  validatePassword,
} from "./secret";
export {
  mapPost,
  mapComment,
  type ForumPostRow,
  type ForumCommentRow,
} from "./mappers";
export { issueCaptcha, verifyCaptcha, CAPTCHA_MESSAGE, type CaptchaChallenge, type CaptchaVerdict } from "./captcha";
export { isForumImageUrl, forumImagePublicPrefix, FORUM_IMAGE_MAX_BYTES } from "./image";
export { sweepOrphanForumImages, type SweepResult } from "./image-sweep";
export {
  ok,
  fail,
  errors,
  requireUser,
  extractNickname,
  type AuthContext,
} from "./api";
export {
  toggleReaction,
  submitReport,
  softDelete,
  getPostView,
  REPORT_FLAG_THRESHOLD,
  type ReactionTarget,
  type ForumPostView,
} from "./interactions";
