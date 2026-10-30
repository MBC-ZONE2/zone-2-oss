// ============================================================================
// components/forum/client-api — 브라우저에서 /api/forum 호출하는 fetch 헬퍼
//
// 응답 규약 { data, error } 를 풀어서 throw/return 한다.
// 목록의 nextCursor 는 X-Next-Cursor 헤더로 전달된다.
// 목록은 ?issueHeads=1 로 요청해 그 페이지 기사들의 크로스뷰 사안 헤드도 함께 받는다.
// ============================================================================

import type {
  ApiResponse,
  ForumComment,
  ForumPost,
} from "@/types";
import type { ReportReason } from "@/lib/forum/schema";
import type { IssueHeadByArticle } from "@/lib/forum/queries";

/** API 에러를 메시지와 함께 던지기 위한 에러 */
export class ForumApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ForumApiError";
    this.code = code;
    this.status = status;
  }
}

async function parse<T>(res: Response): Promise<T> {
  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ForumApiError(
      "BAD_RESPONSE",
      "서버 응답을 해석할 수 없습니다",
      res.status,
    );
  }
  if (!json || json.error) {
    const code = json?.error?.code ?? "UNKNOWN";
    const message = json?.error?.message ?? "알 수 없는 오류가 발생했습니다";
    throw new ForumApiError(code, message, res.status);
  }
  return json.data;
}

/** 게시글 목록 페이지 (cursor + 이 페이지 기사들의 사안 헤드 매핑) */
export interface PostsPage {
  posts: ForumPost[];
  nextCursor: string | null;
  /** article_id → 크로스뷰 사안 헤드(이 페이지 글 기준, 매핑 없으면 빈 객체) */
  issueHeads: IssueHeadByArticle;
}

/** 목록 더 불러오기 — 사안 헤드를 함께 받아 목록이 새 기사도 사안 그룹에 묶을 수 있게 한다 */
export async function fetchPosts(
  cursor?: string,
  limit = 20,
): Promise<PostsPage> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(limit));
  params.set("issueHeads", "1");

  const res = await fetch(`/api/forum?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  const data = await parse<{ posts: ForumPost[]; issueHeads: IssueHeadByArticle }>(res);
  const nextCursor = res.headers.get("X-Next-Cursor");
  return {
    posts: data.posts ?? [],
    nextCursor,
    issueHeads: data.issueHeads ?? {},
  };
}

/** 게시글 상세 + 댓글(오래된 순) — 목록 행 안에서 댓글을 펼칠 때 */
export async function fetchPostDetail(postId: string): Promise<ForumPost & { comments: ForumComment[] }> {
  const res = await fetch(`/api/forum/${postId}`, { method: "GET", cache: "no-store" });
  return parse<ForumPost & { comments: ForumComment[] }>(res);
}

/** 자동등록방지 문제 받기 — { token, question: "3 + 4" } */
export async function fetchCaptcha(): Promise<{ token: string; question: string }> {
  const res = await fetch("/api/forum/captcha", { method: "GET", cache: "no-store" });
  return parse<{ token: string; question: string }>(res);
}

/** 사진 1장 업로드 — 서버가 줄여(1600px·WebP) 저장한 공개 URL */
export async function uploadForumImage(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/forum/image", { method: "POST", body: form });
  return parse<{ url: string }>(res);
}

/** 자동등록방지 답 — 작성 요청에 동봉 */
export interface CaptchaAnswer {
  token: string;
  answer: string;
}

/** 게시글 작성 */
export async function createPost(input: {
  title: string | null;
  body: string;
  articleId?: string | null;
  nickname?: string | null;
  password: string;
  imageUrl?: string | null;
  captcha: CaptchaAnswer;
  /** honeypot — 항상 "" */
  website?: string;
}): Promise<ForumPost> {
  const res = await fetch("/api/forum", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parse<ForumPost>(res);
}

/** 댓글 작성 */
export async function createComment(
  postId: string,
  input: {
    body: string;
    nickname?: string | null;
    password: string;
    captcha: CaptchaAnswer;
    website?: string;
  },
): Promise<ForumComment> {
  const res = await fetch(`/api/forum/${postId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parse<ForumComment>(res);
}

/** 게시글 수정 */
export async function updatePost(
  postId: string,
  input: { title: string | null; body: string; password: string },
): Promise<ForumPost> {
  const res = await fetch(`/api/forum/${postId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parse<ForumPost>(res);
}

/** 댓글 수정 */
export async function updateComment(
  postId: string,
  commentId: string,
  input: { body: string; password: string },
): Promise<ForumComment> {
  const res = await fetch(`/api/forum/${postId}/comments/${commentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parse<ForumComment>(res);
}

// --- 좋아요 / 신고 / 삭제 (게시글·댓글 공용) --------------------------------

/** 좋아요 토글 응답 */
export interface ReactionResult {
  liked: boolean;
  count: number;
}

/** 게시글 좋아요 토글 */
export async function togglePostReaction(
  postId: string,
): Promise<ReactionResult> {
  const res = await fetch(`/api/forum/${postId}/reactions`, { method: "POST" });
  return parse<ReactionResult>(res);
}

/** 댓글 좋아요 토글 */
export async function toggleCommentReaction(
  postId: string,
  commentId: string,
): Promise<ReactionResult> {
  const res = await fetch(
    `/api/forum/${postId}/comments/${commentId}/reactions`,
    { method: "POST" },
  );
  return parse<ReactionResult>(res);
}

/** 게시글 신고 */
export async function reportPost(
  postId: string,
  reason: ReportReason,
): Promise<{ flagged: boolean }> {
  const res = await fetch(`/api/forum/${postId}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  return parse<{ flagged: boolean }>(res);
}

/** 댓글 신고 */
export async function reportComment(
  postId: string,
  commentId: string,
  reason: ReportReason,
): Promise<{ flagged: boolean }> {
  const res = await fetch(`/api/forum/${postId}/comments/${commentId}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  return parse<{ flagged: boolean }>(res);
}

/** 게시글 소프트 삭제 */
export async function deletePost(
  postId: string,
  password: string,
): Promise<void> {
  const res = await fetch(`/api/forum/${postId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  await parse<{ id: string; deleted: boolean }>(res);
}

/** 댓글 소프트 삭제 */
export async function deleteComment(
  postId: string,
  commentId: string,
  password: string,
): Promise<void> {
  const res = await fetch(`/api/forum/${postId}/comments/${commentId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  await parse<{ id: string; deleted: boolean }>(res);
}
