// ============================================================================
// /api/forum/[id] — 게시글 상세(GET) / 비밀번호 기반 수정(PATCH)·삭제(DELETE)
//
// 응답 data = ForumPostDetail (ForumPost + comments[]).
// Next 15: params 는 Promise → await 필요.
// ============================================================================

import {
  editPostSchema,
  errors,
  fetchPasswordHash,
  getPostView,
  ok,
  updatePost,
  verifyPassword,
} from "@/lib/forum";
import { handleDelete } from "../_lib/handlers";
import { clientIpFrom } from "@/lib/forum/secret";
import { canAttemptPassword, clearPasswordFailures, recordPasswordFailure } from "@/lib/forum/attempts";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/forum/[id] — 게시글 + 댓글(오래된 순).
 * getPostView 로 페이지와 동일 경로 조회 — 댓글 likeCount 집계 일치
 * (교차리뷰 반영), 가려진 글은 mappers 가 redact 한 자리표시자 데이터.
 */
export async function GET(_request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const view = await getPostView(id, null);
    if (!view) return errors.notFound("게시글을 찾을 수 없습니다");
    return ok({ ...view.post, comments: view.comments });
  } catch (error) {
    console.error(`[/api/forum/${id} GET] 상세 조회 실패:`, error);
    return errors.internal();
  }
}

/** PATCH /api/forum/[id] — 비밀번호 확인 후 게시글 수정 */
export async function PATCH(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errors.badJson();
  }

  const parsed = editPostSchema.safeParse(raw);
  if (!parsed.success) {
    return errors.validation(
      parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요",
    );
  }

  try {
    // 비밀번호 추측 제한 — 대상 글 + IP 조합 10분 5회(lib/forum/attempts)
    const ip = clientIpFrom(request.headers);
    if (!canAttemptPassword(id, ip)) return errors.rateLimited("비밀번호를 여러 번 틀려 잠시 막았습니다. 10분 뒤 다시 시도해 주세요");
    const storedHash = await fetchPasswordHash("forum_posts", id);
    const matches = await verifyPassword(parsed.data.password, storedHash);
    if (!matches) {
      recordPasswordFailure(id, ip);
      return errors.forbidden();
    }
    clearPasswordFailures(id, ip);

    const post = await updatePost(id, {
      title: parsed.data.title,
      body: parsed.data.body,
    });
    if (!post) return errors.notFound("게시글을 찾을 수 없습니다");
    return ok(post);
  } catch (error) {
    console.error(`[/api/forum/${id} PATCH] 게시글 수정 실패:`, error);
    return errors.internal();
  }
}

/** DELETE /api/forum/[id] — 비밀번호 확인 후 게시글 소프트 삭제 */
export async function DELETE(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  return handleDelete("post", id, request);
}
