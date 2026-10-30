// ============================================================================
// /api/forum/[id]/comments/[commentId]/reports — 댓글 신고 (POST, 사유 enum)
//
// 응답 data = { flagged }. 누적 5회 시 자동 가려짐. Next 15: params → await.
// ============================================================================

import { handleReport } from "../../../../_lib/handlers";

interface RouteContext {
  params: Promise<{ id: string; commentId: string }>;
}

/** POST /api/forum/[id]/comments/[commentId]/reports — 댓글 신고 */
export async function POST(request: Request, ctx: RouteContext) {
  const { commentId } = await ctx.params;
  return handleReport("comment", commentId, request);
}
