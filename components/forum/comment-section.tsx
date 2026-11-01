"use client";

// ============================================================================
// components/forum/comment-section — 댓글 목록(정렬 토글) + 작성기
//
// 정렬: 최신순 / 공감순(클라이언트 정렬). 공감·신고·수정·삭제는 각 CommentItem 이
// 담당한다. 댓글 작성은 <OpinionComposer variant="comment"> 하나(이름 선택 + 비번,
// createComment 그대로). 성공하면 onCreated 로 받은 댓글을 목록 끝에 붙인다.
// 시각: 인용괘선 목록 + 통일 작성기(app/composer.css). 목록·정렬·수정/삭제 로직 불변.
// onCountChange 는 상세 액션바의 "댓글 N" 을 맞추기 위한 선택 콜백.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ForumComment } from "@/types";
import { CommentItem } from "./comment-item";
import { OpinionComposer } from "./opinion-composer";

type SortKey = "recent" | "top";

interface CommentSectionProps {
  postId: string;
  initialComments: ForumComment[];
  /** 뷰어가 좋아요한 댓글 id */
  likedIds: string[];
  /** 댓글 수 변화 통지(상세 액션바 표시용) */
  onCountChange?: (count: number) => void;
}

/** 정렬 텍스트 탭 */
function SortTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

export function CommentSection({
  postId,
  initialComments,
  likedIds,
  onCountChange,
}: CommentSectionProps) {
  const [comments, setComments] = useState<ForumComment[]>(initialComments);
  const likedSet = useMemo(() => new Set(likedIds), [likedIds]);
  const [sort, setSort] = useState<SortKey>("recent");

  useEffect(() => {
    onCountChange?.(comments.length);
  }, [comments.length, onCountChange]);

  const sorted = useMemo(() => {
    const list = [...comments];
    list.sort((a, b) => {
      if (sort === "top" && a.likeCount !== b.likeCount) {
        return b.likeCount - a.likeCount;
      }
      return b.createdAt.localeCompare(a.createdAt); // 최신순
    });
    return list;
  }, [comments, sort]);

  function markDeleted(commentId: string) {
    const now = new Date().toISOString();
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId ? { ...c, deletedAt: now, body: "" } : c,
      ),
    );
  }

  function replaceComment(updated: ForumComment) {
    setComments((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c)),
    );
  }

  /** 작성기가 넘겨준 새 댓글(게시됨)을 목록 끝에 붙인다 */
  const appendComment = useCallback((created: ForumComment) => {
    setComments((prev) => (prev.some((c) => c.id === created.id) ? prev : [...prev, created]));
  }, []);

  return (
    <section aria-labelledby="forum-comments-heading">
      <div className="fo-comments-head">
        <h2 id="forum-comments-heading">
          댓글 <span>{comments.length}</span>
        </h2>
        <div className="fo-sort" role="group" aria-label="댓글 정렬">
          <SortTab active={sort === "recent"} onClick={() => setSort("recent")}>
            최신순
          </SortTab>
          <span className="sep" aria-hidden>
            |
          </span>
          <SortTab active={sort === "top"} onClick={() => setSort("top")}>
            공감순
          </SortTab>
        </div>
      </div>

      {comments.length === 0 ? (
        <div className="fo-empty">
          <p>첫 의견 남기기</p>
          <small>아직 댓글이 없습니다. 아래에 첫 의견을 남겨 주세요.</small>
        </div>
      ) : (
        <ul className="fo-comments">
          {sorted.map((comment) => (
            <CommentItem
              key={comment.id}
              postId={postId}
              comment={comment}
              liked={likedSet.has(comment.id)}
              onEdited={replaceComment}
              onDeleted={() => markDeleted(comment.id)}
            />
          ))}
        </ul>
      )}

      <OpinionComposer variant="comment" postId={postId} onCreated={appendComment} />
    </section>
  );
}
