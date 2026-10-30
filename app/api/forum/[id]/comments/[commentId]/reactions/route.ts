// ============================================================================
// /api/forum/[id]/comments/[commentId]/reactions — 댓글 좋아요 토글 (POST)
//
// 응답 data = { liked, count }. Next 15: params 는 Promise → await.
// ============================================================================

import { handleReaction } from "../../../../_lib/handlers";

interface RouteContext {
  params: Promise<{ id: string; commentId: string }>;
}

/** POST /api/forum/[id]/comments/[commentId]/reactions — 댓글 좋아요 토글 */
export async function POST(request: Request, ctx: RouteContext) {
  const { commentId } = await ctx.params;
  return handleReaction("comment", commentId, request);
}
