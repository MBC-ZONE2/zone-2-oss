"use client";

// ============================================================================
// components/forum/like-button — 공감 토글 (낙관적 업데이트)
//
// 클릭 즉시 UI 반영 후 IP 기반 API 호출, 실패 시 롤백.
// 게시글(commentId 없음)·댓글 공용. 서버 응답 count 로 최종 동기화.
// 시각: 빈 하트(윤곽) → 잉크로 채운 하트(200ms, app/forum.css .fo-like-heart). 글자는 숫자만, 낭독은 "공감 (N)".
// onToggled 는 상세가 '이 사안 온도' 눈금을 흔들기 위해 듣는 선택 콜백이다.
// ============================================================================

import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import {
  ForumApiError,
  toggleCommentReaction,
  togglePostReaction,
} from "./client-api";

interface LikeButtonProps {
  postId: string;
  /** 댓글 좋아요면 지정, 게시글이면 생략 */
  commentId?: string;
  initialCount: number;
  initialLiked: boolean;
  /** 삭제·가려진 대상이면 비활성 */
  disabled?: boolean;
  /** 댓글용 작은 링(16px) */
  size?: "md" | "sm";
  /** 토글 직후(낙관적 반영 시점) 통지 — 상세의 온도 눈금 흔들림용 */
  onToggled?: (liked: boolean) => void;
}

export function LikeButton({
  postId,
  commentId,
  initialCount,
  initialLiked,
  disabled = false,
  size = "md",
  onToggled,
}: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;

    // 낙관적 업데이트
    const prev = { liked, count };
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((c) => c + (nextLiked ? 1 : -1));
    setPending(true);
    onToggled?.(nextLiked);

    try {
      const result = commentId
        ? await toggleCommentReaction(postId, commentId)
        : await togglePostReaction(postId);
      setLiked(result.liked);
      setCount(result.count);
    } catch (err) {
      setLiked(prev.liked);
      setCount(prev.count);
      toast(
        err instanceof ForumApiError
          ? err.message
          : "공감 처리 중 오류가 발생했습니다.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={liked}
      aria-label={liked ? `공감 취소 (${count})` : `공감 (${count})`}
      className={size === "sm" ? "fo-like sm" : "fo-like"}
    >
      {/* 하트 — 빈 윤곽(미공감) → 잉크로 채움(공감). 대표 지시 2026-10-19: 링 대신 하트 */}
      <svg className="fo-like-heart" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 21s-6.7-4.3-9.3-8.1C.6 9.8 1.6 5.6 5.1 4.3c2.2-.8 4.6 0 6.1 1.9l.8 1 .8-1c1.5-1.9 3.9-2.7 6.1-1.9 3.5 1.3 4.5 5.5 2.4 8.6C18.7 16.7 12 21 12 21z" />
      </svg>
      <span aria-hidden>{count}</span>
    </button>
  );
}
