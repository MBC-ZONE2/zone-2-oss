// ============================================================================
// /api/forum/[id]/reactions — 게시글 좋아요 토글 (POST, IP 해시 기준)
//
// 응답 data = { liked, count }. Next 15: params 는 Promise → await.
// ============================================================================

import { handleReaction } from "../../_lib/handlers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** POST /api/forum/[id]/reactions — 좋아요 토글 */
export async function POST(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  return handleReaction("post", id, request);
}
