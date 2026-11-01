// ============================================================================
// /api/forum/[id]/comments/[commentId] — 비밀번호 기반 댓글 수정(PATCH)·삭제(DELETE)
//
// Next 15: params 는 Promise → await.
// ============================================================================

import { handleDelete } from "../../../_lib/handlers";
import { ok, errors } from "@/lib/forum/api";
import { editPostSchema } from "@/lib/forum/schema";
import { fetchPasswordHash, updateComment } from "@/lib/forum";
import { clientIpFrom, verifyPassword } from "@/lib/forum/secret";
import { canAttemptPassword, clearPasswordFailures, recordPasswordFailure } from "@/lib/forum/attempts";

interface RouteContext {
  params: Promise<{ id: string; commentId: string }>;
}

/** DELETE /api/forum/[id]/comments/[commentId] — 비밀번호 확인 후 소프트 삭제 */
export async function DELETE(request: Request, ctx: RouteContext) {
  const { commentId } = await ctx.params;
  return handleDelete("comment", commentId, request);
}

/** PATCH /api/forum/[id]/comments/[commentId] — 비밀번호 확인 후 댓글 수정 */
export async function PATCH(request: Request, ctx: RouteContext) {
  const { commentId } = await ctx.params;

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
    // 비밀번호 추측 제한 — 댓글 수정도 글과 같은 10분 5회(codex 리뷰: 누락돼 있었음)
    const ip = clientIpFrom(request.headers);
    if (!canAttemptPassword(commentId, ip)) return errors.rateLimited("비밀번호를 여러 번 틀려 잠시 막았습니다. 10분 뒤 다시 시도해 주세요");
    const storedHash = await fetchPasswordHash("forum_comments", commentId);
    const matches = await verifyPassword(parsed.data.password, storedHash);
    if (!matches) {
      recordPasswordFailure(commentId, ip);
      return errors.forbidden();
    }
    clearPasswordFailures(commentId, ip);

    const comment = await updateComment(commentId, { body: parsed.data.body });
    if (!comment) return errors.notFound("댓글을 찾을 수 없습니다");
    return ok(comment);
  } catch (error) {
    console.error(`[/api/forum/comment/${commentId} PATCH] 댓글 수정 실패:`, error);
    return errors.internal();
  }
}
