"use client";

// ============================================================================
// components/forum/row-comments — 목록 행 안에서 펼치는 댓글 스레드 + 작성기 (대표 피드백 2026-10-20)
//
// 행 아래 줄의 "댓글 N" 을 누르면 상세로 가지 않고 그 자리에 댓글 목록(오래된 순)과 작성기가 열린다.
// 처음 열 때 GET /api/forum/:id 로 댓글을 받고, 작성하면 목록 끝에 붙이며 부모에 수를 알린다.
// 상세와 같은 CommentItem·OpinionComposer(variant="comment") 를 쓴다 — 공감·신고·수정·삭제 동일.
// ============================================================================

import { useEffect, useState } from "react";
import type { ForumComment } from "@/types";
import { fetchPostDetail, ForumApiError } from "./client-api";
import { CommentItem } from "./comment-item";
import { OpinionComposer } from "./opinion-composer";

export function RowComments({
  postId,
  onCountChange,
}: {
  postId: string;
  onCountChange: (count: number) => void;
}) {
  const [comments, setComments] = useState<ForumComment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPostDetail(postId)
      .then((d) => {
        if (!alive) return;
        setComments(d.comments);
        onCountChange(d.comments.filter((c) => !c.deletedAt && !c.isFlagged).length);
      })
      .catch((e) => {
        if (alive) setError(e instanceof ForumApiError ? e.message : "댓글을 불러오지 못했습니다.");
      });
    return () => {
      alive = false;
    };
    // 처음 열릴 때 1회
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const visible = (list: ForumComment[]) => list.filter((c) => !c.deletedAt && !c.isFlagged).length;

  function append(created: ForumComment) {
    setComments((prev) => {
      const next = prev && prev.some((c) => c.id === created.id) ? prev : [...(prev ?? []), created];
      onCountChange(visible(next));
      return next;
    });
  }
  function replace(updated: ForumComment) {
    setComments((prev) => (prev ? prev.map((c) => (c.id === updated.id ? updated : c)) : prev));
  }
  function markDeleted(id: string) {
    setComments((prev) => {
      if (!prev) return prev;
      const next = prev.map((c) => (c.id === id ? { ...c, deletedAt: new Date().toISOString(), body: "" } : c));
      onCountChange(visible(next));
      return next;
    });
  }

  return (
    <div className="fo-row-comments" id={`comments-${postId}`}>
      {error ? (
        <p className="fo-err" role="alert">{error}</p>
      ) : comments === null ? (
        <p className="fo-hint">댓글 불러오는 중…</p>
      ) : comments.length === 0 ? (
        <p className="fo-hint">아직 댓글이 없습니다. 첫 댓글을 남겨 주세요.</p>
      ) : (
        <ul className="fo-comments">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              postId={postId}
              comment={c}
              liked={false}
              onEdited={replace}
              onDeleted={() => markDeleted(c.id)}
            />
          ))}
        </ul>
      )}
      <OpinionComposer variant="comment" postId={postId} onCreated={append} className="opc-inrow" />
    </div>
  );
}
