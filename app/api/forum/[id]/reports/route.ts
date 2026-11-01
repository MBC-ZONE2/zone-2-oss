// ============================================================================
// /api/forum/[id]/reports — 게시글 신고 (POST, IP 해시 기준, 사유 enum)
//
// 응답 data = { flagged }. 누적 5회 시 자동 가려짐(flagged=true).
// Next 15: params 는 Promise → await.
// ============================================================================

import { handleReport } from "../../_lib/handlers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** POST /api/forum/[id]/reports — 게시글 신고 */
export async function POST(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  return handleReport("post", id, request);
}
