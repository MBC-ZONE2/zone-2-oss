// ============================================================================
// lib/forum/mappers — DB row(snake_case) → 앱 타입(camelCase) 변환
//
// 담당: 통합 공론장(그룹 D).
// 공통 타입(ForumPost/ForumComment)은 types/index.ts 의 계약을 사용한다.
// DB row 형태는 이 모듈 안에서만 쓰므로 여기에 로컬 정의한다(types 는 수정 금지).
// ============================================================================

import type { ForumComment, ForumPost } from "@/types";

/** forum_posts 테이블 row (snake_case) */
export interface ForumPostRow {
  id: string;
  article_id: string | null;
  author_hash: string | null;
  display_name: string | null;
  title: string | null;
  body: string;
  image_url?: string | null;
  like_count: number | null;
  is_flagged: boolean | null;
  flag_reason: string | null;
  deleted_at: string | null;
  created_at: string;
}

/** forum_comments 테이블 row (snake_case) */
export interface ForumCommentRow {
  id: string;
  post_id: string | null;
  author_hash: string | null;
  display_name: string | null;
  body: string;
  is_flagged: boolean | null;
  deleted_at: string | null;
  created_at: string;
}

/**
 * 가려진(플래그)·삭제된 글의 본문을 서버에서 비웁니다(원문 비노출 정책).
 * UI 는 isFlagged / deletedAt 로 자리표시자를 렌더한다.
 */
function redactBody(
  body: string,
  isFlagged: boolean,
  deletedAt: string | null,
): string {
  return isFlagged || deletedAt ? "" : body;
}

/** post row → ForumPost (가려짐/삭제 시 제목·본문 비노출) */
export function mapPost(row: ForumPostRow, commentCount = 0): ForumPost {
  const isFlagged = row.is_flagged ?? false;
  const hidden = isFlagged || Boolean(row.deleted_at);
  return {
    id: row.id,
    articleId: row.article_id,
    authorHash: row.author_hash,
    displayName: hidden ? null : row.display_name,
    title: hidden ? null : row.title,
    body: redactBody(row.body, isFlagged, row.deleted_at),
    imageUrl: hidden ? null : (row.image_url ?? null),
    likeCount: row.like_count ?? 0,
    commentCount,
    isFlagged,
    flagReason: row.flag_reason,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}

/** comment row → ForumComment. likeCount 는 호출측에서 reactions 집계로 주입. */
export function mapComment(row: ForumCommentRow, likeCount = 0): ForumComment {
  const isFlagged = row.is_flagged ?? false;
  const hidden = isFlagged || Boolean(row.deleted_at);
  return {
    id: row.id,
    postId: row.post_id,
    authorHash: row.author_hash,
    displayName: hidden ? null : row.display_name,
    body: redactBody(row.body, isFlagged, row.deleted_at),
    likeCount,
    isFlagged,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}
