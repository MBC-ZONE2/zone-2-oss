// ============================================================================
// lib/forum/interactions — 좋아요 / 신고 / 소프트 삭제 + 상세 뷰 조립 (F6)
//
// forum_reactions / forum_reports 는 공개 RLS 정책이 없으므로(0004) 모든 접근을
// service_role 로 수행한다(0003 banned_words 패턴). IP 해시는 호출측 책임.
// 신고 5회 누적 자동 가리기(is_flagged 전환)도 여기서 count 후 처리한다.
// ============================================================================

import type {
  ForumComment,
  ForumPost,
  ForumPostDetail,
} from "@/types";
import type { ReportReason } from "./schema";
import { createServiceClient } from "@/lib/supabase/server";
import { getPostWithComments } from "./queries";

/** 좋아요/신고 대상 종류 */
export type ReactionTarget = "post" | "comment";

/** 신고 누적 자동 가리기 임계값 */
export const REPORT_FLAG_THRESHOLD = 5;

/** service 클라이언트 인스턴스 타입 */
type ServiceClient = ReturnType<typeof createServiceClient>;

/** Postgres unique 위반(동시요청 충돌) 여부 */
function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/** 특정 대상의 좋아요 수 */
async function reactionCount(
  svc: ServiceClient,
  target: ReactionTarget,
  targetId: string,
): Promise<number> {
  const { count } = await svc
    .from("forum_reactions")
    .select("id", { count: "exact", head: true })
    .eq("target", target)
    .eq("target_id", targetId);
  return count ?? 0;
}

/** 상호작용 대상의 존재·상태 (없으면 null) — 교차리뷰 반영 */
async function loadTargetState(
  svc: ServiceClient,
  target: ReactionTarget,
  targetId: string,
): Promise<{ deleted: boolean; flagged: boolean } | null> {
  const table = target === "post" ? "forum_posts" : "forum_comments";
  const { data } = await svc
    .from(table)
    .select("id, deleted_at, is_flagged")
    .eq("id", targetId)
    .maybeSingle();
  if (!data) return null;
  return {
    deleted: Boolean(data.deleted_at),
    flagged: Boolean(data.is_flagged),
  };
}

/**
 * 좋아요 토글. 이미 눌렀으면 취소(delete), 아니면 추가(insert).
 * post 는 like_count 컬럼을 동기화한다(comment 는 집계로 계산).
 */
export async function toggleReaction(
  target: ReactionTarget,
  targetId: string,
  ipHash: string,
): Promise<{ liked: boolean; count: number } | null> {
  const svc = createServiceClient();

  // 존재하지 않거나 삭제·가려진 대상에는 좋아요를 만들지 않는다(교차리뷰 반영).
  const state = await loadTargetState(svc, target, targetId);
  if (!state || state.deleted || state.flagged) return null;

  const { data: existing } = await svc
    .from("forum_reactions")
    .select("id")
    .eq("target", target)
    .eq("target_id", targetId)
    .eq("author_hash", ipHash)
    .maybeSingle();

  let liked: boolean;
  if (existing) {
    await svc.from("forum_reactions").delete().eq("id", existing.id);
    liked = false;
  } else {
    const { error } = await svc
      .from("forum_reactions")
      .insert({
        target,
        target_id: targetId,
        author_hash: ipHash,
        ip_hash: ipHash,
      });
    if (error && !isUniqueViolation(error)) throw error;
    liked = true;
  }

  let count: number;
  if (target === "post") {
    // 단일 SQL 문으로 집계+저장을 원자화 — 동시 좋아요 시 낡은 count 가
    // 마지막에 저장되는 race 를 제거한다(교차리뷰 반영, 0004 §6 함수).
    const { data: synced, error: syncErr } = await svc.rpc(
      "sync_forum_post_like_count",
      { target_post: targetId },
    );
    if (syncErr) throw syncErr;
    count = typeof synced === "number" ? synced : await reactionCount(svc, target, targetId);
  } else {
    count = await reactionCount(svc, target, targetId);
  }
  return { liked, count };
}

/**
 * 신고 접수. 1인 1회(unique). 누적 5회 이상이면 대상을 자동 가림(is_flagged).
 * post 는 flag_reason='report' 도 기록(comment 는 flag_reason 컬럼 없음).
 */
export async function submitReport(
  target: ReactionTarget,
  targetId: string,
  ipHash: string,
  reason: ReportReason,
): Promise<{ flagged: boolean } | null> {
  const svc = createServiceClient();

  // 존재하지 않거나 삭제된 대상 신고는 거부(교차리뷰 반영).
  // 이미 가려진 대상은 접수만 하고 flagged 상태를 그대로 반환한다.
  const state = await loadTargetState(svc, target, targetId);
  if (!state || state.deleted) return null;

  const { error: insErr } = await svc
    .from("forum_reports")
    .insert({
      target,
      target_id: targetId,
      reporter_hash: ipHash,
      ip_hash: ipHash,
      reason,
    });
  // 중복 신고(unique)는 접수 성공으로 간주하고 누적만 확인한다.
  if (insErr && !isUniqueViolation(insErr)) throw insErr;

  if (state.flagged) return { flagged: true };

  const { count } = await svc
    .from("forum_reports")
    .select("id", { count: "exact", head: true })
    .eq("target", target)
    .eq("target_id", targetId);

  if ((count ?? 0) < REPORT_FLAG_THRESHOLD) return { flagged: false };

  const table = target === "post" ? "forum_posts" : "forum_comments";
  const patch =
    target === "post"
      ? { is_flagged: true, flag_reason: "report" }
      : { is_flagged: true };
  // update 영향 행을 확인해 실재하는 대상에만 flagged 응답을 낸다.
  const { data: updated, error: updErr } = await svc
    .from(table)
    .update(patch)
    .eq("id", targetId)
    .select("id");
  if (updErr) throw updErr;
  return { flagged: (updated ?? []).length > 0 };
}

/**
 * 소프트 삭제. author_hash 가 일치하는 본인 글만 deleted_at 을 세팅한다.
 * 소유자 불일치/없음이면 false.
 */
export async function softDelete(
  target: ReactionTarget,
  targetId: string,
  authorHash: string,
): Promise<boolean> {
  const svc = createServiceClient();
  const table = target === "post" ? "forum_posts" : "forum_comments";
  const { data: row } = await svc
    .from(table)
    .select("author_hash")
    .eq("id", targetId)
    .maybeSingle();

  if (!row || row.author_hash !== authorHash) return false;

  await svc
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", targetId);
  // 글에 사진이 있었으면 공개 버킷에서도 지운다(삭제한 글의 사진이 URL 로 계속 보이지 않게, 2026-10-19)
  if (target === "post") await removePostImage(svc, targetId);
  return true;
}

/** forum_posts.image_url 의 객체를 'forum' 버킷에서 지우고 컬럼을 비운다. 실패해도 삭제 흐름을 막지 않는다 */
async function removePostImage(svc: ServiceClient, postId: string): Promise<void> {
  try {
    const { data } = await svc.from("forum_posts").select("image_url").eq("id", postId).maybeSingle();
    const url = (data as { image_url?: string | null } | null)?.image_url;
    if (!url) return;
    const marker = "/storage/v1/object/public/forum/";
    const i = url.indexOf(marker);
    if (i === -1) return;
    const path = url.slice(i + marker.length);
    await svc.storage.from("forum").remove([path]);
    await svc.from("forum_posts").update({ image_url: null }).eq("id", postId);
  } catch (e) {
    console.error("[forum] 사진 정리 실패:", e instanceof Error ? e.message : e);
  }
}

/** 댓글별 좋아요 수 집계 (target='comment') */
async function loadCommentLikeCounts(
  svc: ServiceClient,
  commentIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (commentIds.length === 0) return map;
  const { data } = await svc
    .from("forum_reactions")
    .select("target_id")
    .eq("target", "comment")
    .in("target_id", commentIds);
  for (const r of (data ?? []) as { target_id: string }[]) {
    map.set(r.target_id, (map.get(r.target_id) ?? 0) + 1);
  }
  return map;
}

/** 뷰어가 좋아요한 대상 id 목록 (post id + comment id 혼합) */
async function loadViewerLikes(
  svc: ServiceClient,
  viewerHash: string,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data } = await svc
    .from("forum_reactions")
    .select("target_id")
    .eq("author_hash", viewerHash)
    .in("target_id", ids);
  return ((data ?? []) as { target_id: string }[]).map((r) => r.target_id);
}

/** 상세 뷰 데이터 (게시글 + 댓글 + 뷰어별 좋아요/소유 상태) */
export interface ForumPostView {
  post: ForumPost;
  comments: ForumComment[];
  /** 뷰어가 좋아요한 대상 id (post + comment) */
  likedIds: string[];
  /** 뷰어 소유(삭제 가능) 대상 id (post + comment) */
  ownedIds: string[];
}

/**
 * 상세 페이지용 뷰를 조립한다. 댓글 좋아요 수를 집계로 채우고,
 * 로그인한 뷰어면 좋아요/소유 여부를 표시한다.
 */
export async function getPostView(
  postId: string,
  viewerHash: string | null,
): Promise<ForumPostView | null> {
  // service_role 로 조회 — 공개 RLS 가 삭제·가려진 행을 차단하도록 강화되어
  // (0004 §5), 자리표시자 렌더용 메타는 서버에서 읽고 mappers 가 redact 한다.
  const svc = createServiceClient();
  const detail: ForumPostDetail | null = await getPostWithComments(
    svc,
    postId,
  );
  if (!detail) return null;

  const { comments: rawComments, ...post } = detail;
  const commentIds = rawComments.map((c) => c.id);

  const likeCounts = await loadCommentLikeCounts(svc, commentIds);
  const comments = rawComments.map((c) => ({
    ...c,
    likeCount: likeCounts.get(c.id) ?? 0,
  }));

  let likedIds: string[] = [];
  let ownedIds: string[] = [];
  if (viewerHash) {
    likedIds = await loadViewerLikes(svc, viewerHash, [postId, ...commentIds]);
    ownedIds = [post, ...rawComments]
      .filter((x) => x.authorHash === viewerHash)
      .map((x) => x.id);
  }

  return { post, comments, likedIds, ownedIds };
}
