// ============================================================================
// lib/forum/schema — 입력 검증 스키마 (Zod)
//
// 담당: 통합 공론장(그룹 D). API 라우트와 클라이언트 폼이 공유한다.
// DB(forum_posts): title nullable, body NOT NULL. 댓글(forum_comments): body NOT NULL.
// ============================================================================

import { z } from "zod";

export const FORUM_LIMITS = {
  titleMax: 120,
  bodyMin: 5,
  bodyMax: 5000,
  commentMin: 1,
  // 댓글 200자 (프론트 PRD). 게시글 본문(bodyMax)은 토론글 성격상 5,000자 유지.
  commentMax: 200,
} as const;

/** 신고 사유 (0004 forum_reports.reason enum 과 일치) */
export const REPORT_REASONS = ["abuse", "spam", "misinfo", "etc"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** 신고 입력 */
export const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS),
});
export type ReportInput = z.infer<typeof reportSchema>;

/** 게시글 작성 입력 */
/** 익명 작성 공통 필드 — 표시이름(선택) + 수정/삭제용 비밀번호(4자+, 필수). */
const nicknameField = z
  .string()
  .trim()
  .max(20, "이름은 20자 이하여야 합니다")
  // 클라이언트가 스키마로 먼저 정규화한 값(null)을 그대로 보내도 받는다.
  .nullish()
  .transform((v) => (v && v.length > 0 ? v : null));
const passwordField = z
  .string()
  .min(4, "비밀번호는 4자 이상이어야 합니다")
  .max(128, "비밀번호가 너무 깁니다");

/** 자동등록방지 — GET /api/forum/captcha 가 준 토큰 + 사용자가 쓴 답(검증은 서버 lib/forum/captcha) */
export const captchaField = z.object({
  token: z.string().min(1, "자동등록방지 확인이 필요합니다"),
  answer: z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().min(1, "자동등록방지 답을 입력해 주세요")),
});
/** 숨은 칸(honeypot) — 사람은 비워 두고 봇은 채운다. 값이 있으면 거절 */
const honeypotField = z.string().max(0, "자동 등록으로 판단되어 거절됐습니다").optional();

export const createPostSchema = z.object({
  // 사진 1장(선택) — /api/forum/image 가 돌려준 우리 버킷 URL 만(서버가 접두 검사)
  imageUrl: z.string().url().max(500).nullish().transform((v) => v || null),
  captcha: captchaField,
  website: honeypotField,
  // 제목은 선택. 빈 문자열/공백은 null 로 정규화.
  title: z
    .string()
    .trim()
    .max(FORUM_LIMITS.titleMax, `제목은 ${FORUM_LIMITS.titleMax}자 이하여야 합니다`)
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null)),
  body: z
    .string()
    .trim()
    .min(FORUM_LIMITS.bodyMin, `내용은 ${FORUM_LIMITS.bodyMin}자 이상이어야 합니다`)
    .max(FORUM_LIMITS.bodyMax, `내용은 ${FORUM_LIMITS.bodyMax}자 이하여야 합니다`),
  // 특정 기사에 연결된 의견글일 때 (선택)
  articleId: z.string().uuid("올바른 기사 id 가 아닙니다").nullable().optional(),
  // 익명 작성: 표시이름(선택) + 비밀번호(수정/삭제용, 필수)
  nickname: nicknameField,
  password: passwordField,
});

/** 수정/삭제 요청 — 비밀번호 검증용. */
export const editPostSchema = z.object({
  title: z
    .string()
    .trim()
    .max(FORUM_LIMITS.titleMax, `제목은 ${FORUM_LIMITS.titleMax}자 이하여야 합니다`)
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null)),
  body: z
    .string()
    .trim()
    .min(FORUM_LIMITS.bodyMin, `내용은 ${FORUM_LIMITS.bodyMin}자 이상이어야 합니다`)
    .max(FORUM_LIMITS.bodyMax, `내용은 ${FORUM_LIMITS.bodyMax}자 이하여야 합니다`),
  password: passwordField,
});
export const deleteSchema = z.object({ password: passwordField });

export type CreatePostInput = z.input<typeof createPostSchema>;
export type CreatePostParsed = z.output<typeof createPostSchema>;

/** 댓글 작성 입력 — 익명(표시이름 선택 + 비번 필수) */
export const createCommentSchema = z.object({
  captcha: captchaField,
  website: honeypotField,
  body: z
    .string()
    .trim()
    .min(FORUM_LIMITS.commentMin, "댓글 내용을 입력해 주세요")
    .max(
      FORUM_LIMITS.commentMax,
      `댓글은 ${FORUM_LIMITS.commentMax}자 이하여야 합니다`,
    ),
  nickname: nicknameField,
  password: passwordField,
});

export type CreateCommentInput = z.input<typeof createCommentSchema>;
export type CreateCommentParsed = z.output<typeof createCommentSchema>;

/** 목록 쿼리(cursor 페이지네이션) */
export const listQuerySchema = z.object({
  cursor: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListQueryParsed = z.output<typeof listQuerySchema>;
