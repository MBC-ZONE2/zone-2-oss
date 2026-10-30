// ============================================================================
// /api/forum/_lib/handlers — 좋아요 / 신고 / 삭제 공용 핸들러 (게시글·댓글 공통)
//
// target('post'|'comment') 만 다르고 로직은 동일하므로 여기로 모은다.
// 각 라우트 파일은 target/targetId 만 넘겨 얇게 유지한다. 응답 { data, error }.
// ============================================================================

import {
  clientIpFrom,
  deleteSchema,
  errors,
  fetchPasswordHash,
  hashIp,
  ok,
  reportSchema,
  softDeleteComment,
  softDeletePost,
  submitReport,
  toggleReaction,
  verifyPassword,
  type ReactionTarget,
} from "@/lib/forum";
import { canAttemptPassword, clearPasswordFailures, recordPasswordFailure } from "@/lib/forum/attempts";

/** 좋아요 토글 (IP 해시 기준 대상별 1회) */
export async function handleReaction(
  target: ReactionTarget,
  targetId: string,
  request: Request,
) {
  try {
    const ipHash = await hashIp(clientIpFrom(request.headers));
    if (!ipHash) return errors.validation("클라이언트 IP를 확인할 수 없습니다");

    const result = await toggleReaction(target, targetId, ipHash);
    // null = 대상 없음/삭제/가려짐 — 좋아요 생성 거부(교차리뷰 반영)
    if (!result) return errors.notFound("대상을 찾을 수 없습니다");
    return ok(result);
  } catch (error) {
    console.error(`[forum reaction ${target}/${targetId}] 실패:`, error);
    return errors.internal();
  }
}

/** 신고 접수 (IP 해시 기준 대상별 1회, 사유 enum) */
export async function handleReport(
  target: ReactionTarget,
  targetId: string,
  request: Request,
) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errors.badJson();
  }

  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) {
    return errors.validation(
      parsed.error.issues[0]?.message ?? "신고 사유를 확인해 주세요",
    );
  }

  try {
    const ipHash = await hashIp(clientIpFrom(request.headers));
    if (!ipHash) return errors.validation("클라이언트 IP를 확인할 수 없습니다");

    const result = await submitReport(
      target,
      targetId,
      ipHash,
      parsed.data.reason,
    );
    // null = 대상 없음/삭제 — 유령 대상 신고 누적 방지(교차리뷰 반영)
    if (!result) return errors.notFound("대상을 찾을 수 없습니다");
    return ok(result);
  } catch (error) {
    console.error(`[forum report ${target}/${targetId}] 실패:`, error);
    return errors.internal();
  }
}

/** 글/댓글 소프트 삭제 (작성 시 설정한 비밀번호 확인) */
export async function handleDelete(
  target: ReactionTarget,
  targetId: string,
  request: Request,
) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errors.badJson();
  }

  const parsed = deleteSchema.safeParse(raw);
  if (!parsed.success) {
    return errors.validation(
      parsed.error.issues[0]?.message ?? "비밀번호를 확인해 주세요",
    );
  }

  try {
    const table = target === "post" ? "forum_posts" : "forum_comments";
    // 비밀번호 추측 제한 — 대상 + IP 조합 10분 5회(lib/forum/attempts)
    const ip = clientIpFrom(request.headers);
    if (!canAttemptPassword(targetId, ip)) return errors.rateLimited("비밀번호를 여러 번 틀려 잠시 막았습니다. 10분 뒤 다시 시도해 주세요");
    const storedHash = await fetchPasswordHash(table, targetId);
    const matches = await verifyPassword(parsed.data.password, storedHash);
    if (!matches) {
      recordPasswordFailure(targetId, ip);
      return errors.forbidden();
    }
    clearPasswordFailures(targetId, ip);

    const deleted =
      target === "post"
        ? await softDeletePost(targetId)
        : await softDeleteComment(targetId);
    if (!deleted) {
      return errors.notFound("삭제할 글을 찾을 수 없습니다");
    }
    return ok({ id: targetId, deleted: true });
  } catch (error) {
    console.error(`[forum delete ${target}/${targetId}] 실패:`, error);
    return errors.internal();
  }
}
