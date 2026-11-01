"use client";

// ============================================================================
// components/forum/comment-item — 댓글 1건 (공감·신고·수정·삭제 + 자리표시자)
//
// 인용괘선(좌측 1px) 한 칸. 가려짐/삭제 댓글은 점선 괘선 + 자리표시자, 액션 숨김.
// (forum_comments 에 parent 관계가 없어 대댓글 들여쓰기는 없다.)
// [결정 6] 상세(.fo-detail)에서 이 .fo-comment 는 왼쪽 44px 들여쓰기 + 본문 16px + 옅은
// 인용 괘선으로 글 본문(18px, 들여쓰기 0)과 단이 갈린다 — 규칙은 app/forum.css, 마크업은 그대로.
// ============================================================================

import type { ForumComment } from "@/types";
import { authorDisplayLabel } from "@/lib/forum/hash";
import { RelativeTime } from "./relative-time";
import { LikeButton } from "./like-button";
import { ReportDialog } from "./report-dialog";
import { EditButton } from "./edit-button";
import { DeleteButton } from "./delete-button";
import { HiddenNotice } from "./hidden-notice";

interface CommentItemProps {
  postId: string;
  comment: ForumComment;
  liked: boolean;
  onEdited: (comment: ForumComment) => void;
  onDeleted: () => void;
}

export function CommentItem({
  postId,
  comment,
  liked,
  onEdited,
  onDeleted,
}: CommentItemProps) {
  const deleted = Boolean(comment.deletedAt);
  const hidden = deleted || comment.isFlagged;
  const label = authorDisplayLabel(comment.authorHash, comment.displayName);

  return (
    <li className={hidden ? "fo-comment is-hidden" : "fo-comment"}>
      <p className="fo-meta">
        {!hidden && (
          <>
            <span>{label}</span>
            <span aria-hidden>·</span>
          </>
        )}
        <RelativeTime iso={comment.createdAt} />
      </p>

      {hidden ? (
        <HiddenNotice kind={deleted ? "deleted" : "flagged"} target="댓글" />
      ) : (
        <p className="fo-comment-body">{comment.body}</p>
      )}

      {!hidden && (
        <div className="fo-comment-foot">
          <LikeButton
            postId={postId}
            commentId={comment.id}
            initialCount={comment.likeCount}
            initialLiked={liked}
            size="sm"
          />
          <ReportDialog postId={postId} commentId={comment.id} targetLabel="댓글" />
          <EditButton
            postId={postId}
            commentId={comment.id}
            targetLabel="댓글"
            initialBody={comment.body}
            onEdited={(updated) => onEdited(updated as ForumComment)}
          />
          <DeleteButton
            postId={postId}
            commentId={comment.id}
            targetLabel="댓글"
            onDeleted={onDeleted}
          />
        </div>
      )}
    </li>
  );
}
