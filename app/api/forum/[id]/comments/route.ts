// ============================================================================
// /api/forum/[id]/comments — 댓글 작성 (POST)
//
// 익명 작성. 비밀번호/IP 해시 저장 + 모더레이션 결과 반영.
// Next 15: params 는 Promise → await 필요.
// ============================================================================

import {
  createCommentSchema,
  clientIpFrom,
  errors,
  hashIp,
  hashPassword,
  hasRecentWriteFromIp,
  verifyCaptcha,
  CAPTCHA_MESSAGE,
  insertComment,
  ok,
  postExists,
} from "@/lib/forum";
import { moderateText } from "@/lib/moderation";
import { loadOperatorDict } from "@/lib/moderation/operator-dict";
import { createServiceClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** POST /api/forum/[id]/comments  body: { body, nickname?, password } */
export async function POST(request: Request, ctx: RouteContext) {
  const { id: postId } = await ctx.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errors.badJson();
  }

  const parsed = createCommentSchema.safeParse(raw);
  if (!parsed.success) {
    return errors.validation(
      parsed.error.issues[0]?.message ?? "댓글 내용을 확인해 주세요",
    );
  }

  // 자동등록방지(2026-10-19)
  const captcha = await verifyCaptcha(parsed.data.captcha);
  if (!captcha.ok) return errors.validation(CAPTCHA_MESSAGE[captcha.code]);

  try {
    const svc = createServiceClient();
    // 대상 게시글 존재 확인
    const exists = await postExists(svc, postId);
    if (!exists) return errors.notFound("게시글을 찾을 수 없습니다");

    const authorIpHash = await hashIp(clientIpFrom(request.headers));
    if (
      await hasRecentWriteFromIp("forum_comments", authorIpHash, 60)
    ) {
      return errors.rateLimited("댓글은 60초에 한 번 작성할 수 있습니다");
    }

    const passwordHash = await hashPassword(parsed.data.password);
    // 모더레이션 (시드 + 운영 사전)
    const extraDict = await loadOperatorDict();
    const moderation = await moderateText(parsed.data.body, extraDict);

    const comment = await insertComment(svc, {
      postId,
      authorHash: authorIpHash,
      displayName: parsed.data.nickname,
      passwordHash,
      authorIpHash,
      body: parsed.data.body,
      isFlagged: moderation.flagged,
    });

    return ok(comment, 201);
  } catch (error) {
    console.error(`[/api/forum/${postId}/comments POST] 댓글 작성 실패:`, error);
    return errors.internal();
  }
}
