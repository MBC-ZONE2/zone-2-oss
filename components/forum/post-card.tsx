"use client";

// ============================================================================
// components/forum/post-card — 공론장 목록 괘선 행 (사안 그룹 안의 한 줄)
//
// 앞 점(공감 수 4단: 0 = 빈 링 · 1~4 = 12px · 5~19 = 16px · 20+ = 24px) →
// 본문 17px 500 세 줄(제목 없이 본문이 바로 — Threads·X 처럼, 2026-10-19 피드백. 작성기에서 제목 칸도 뺐다)
// → "이름 · 날짜" 15px → 우측 공감 버튼(목록에서 바로 공감, 2026-10-19 — 상세와 같은 LikeButton 작은 링).
// "↔ 크로스뷰" 링크는 행이 아니라 사안 그룹 헤더(issue-group)가 맡는다.
// 내 글(localStorage)이면 제목 옆에 잉크 점. 목록은 가려짐/삭제 글을 제외하므로
// 본문이 항상 존재한다. 로직·API 불변.
// ============================================================================

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import type { ForumPost } from "@/types";
// 클라이언트 렌더 경계 — 순수 hash 모듈에서 직접 import.
import { authorDisplayLabel } from "@/lib/forum/hash";
import { RelativeTime } from "./relative-time";
import { EditButton } from "./edit-button";
import { DeleteButton } from "./delete-button";
import { MyInkDot } from "./my-ink-dot";
import { dotSize } from "./dot-size";
import { LikeButton } from "./like-button";
import { RowComments } from "./row-comments";

interface PostCardProps {
  post: ForumPost;
  onEdited: (post: ForumPost) => void;
  onDeleted: () => void;
}

/** 목록 괘선 행 — 제목 영역 클릭 시 상세로 이동 */
export function PostCard({ post, onEdited, onDeleted }: PostCardProps) {
  const label = authorDisplayLabel(post.authorHash, post.displayName);
  const size = dotSize(post.likeCount);
  // 긴 글 — 8줄까지는 그대로, 넘치면 "더보기"로 그 자리에서 펼친다(상세로 가지 않음, 2026-10-19 피드백).
  // 넘침 여부는 실제 렌더 높이로 판정(줄 수·폰 폭·큰 글자 모드에 따라 달라서 글자 수로는 못 센다).
  const textRef = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // 댓글 — "댓글 N" 을 누르면 그 자리에서 스레드·작성기를 편다(대표 피드백 2026-10-20)
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount ?? 0);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [post.body, expanded]);
  return (
    <article className="fo-row" id={`post-${post.id}`}>
      <span
        className="fo-dot"
        data-size={size}
        role="img"
        aria-label={`공감 ${post.likeCount}`}
      />
      <Link href={`/forum/${post.id}`} className="fo-row-link">
        {/* 자유 건의 행의 아이브로우 "건의" 는 뺐다(2026-10-19 대표 피드백) — 탭이 이미 구분한다 */}
        {/* 제목 없이 본문이 바로(Threads·X 식, 2026-10-19 피드백) — 예전 글의 제목은 상세에서만 보인다 */}
        <p ref={textRef} className={expanded ? "fo-text is-open" : "fo-text"}>
          {post.body}
          <MyInkDot postId={post.id} />
        </p>
        {post.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="fo-row-img" src={post.imageUrl} alt="" loading="lazy" decoding="async" />
        ) : null}
        <p className="fo-meta">
          <span>{label}</span>
          <span aria-hidden>·</span>
          <RelativeTime iso={post.createdAt} />
        </p>
      </Link>
      {/* 아래 줄: 하트(공감) · 더보기 · 수정 · 삭제 — 오른쪽 열을 없애 본문이 행 폭을 다 쓴다(대표 피드백 2026-10-19).
          LikeButton 은 상세와 같은 것(IP 기준 토글). 링크(행) 밖이라 눌러도 상세로 가지 않는다 */}
      <div className="fo-row-foot">
        <LikeButton postId={post.id} initialCount={post.likeCount} initialLiked={false} size="sm" />
        <button
          type="button"
          className="fo-cmt"
          aria-expanded={commentsOpen}
          aria-controls={`comments-${post.id}`}
          aria-label={commentsOpen ? `댓글 닫기 (${commentCount})` : `댓글 ${commentCount}개 보기·쓰기`}
          onClick={() => setCommentsOpen((v) => !v)}
        >
          <svg className="fo-cmt-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.6 3.6c-.6.5-1.4 0-1.4-.7V5.5z" />
          </svg>
          <span aria-hidden>{commentCount}</span>
        </button>
        {(overflows || expanded) && (
          <button
            type="button"
            className="fo-textbtn fo-expand"
            aria-expanded={expanded}
            aria-controls={`post-${post.id}`}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "접기" : "더보기"}
          </button>
        )}
        <EditButton
          postId={post.id}
          targetLabel="게시글"
          initialTitle={post.title}
          initialBody={post.body}
          allowTitle={!post.articleId}
          onEdited={(updated) => onEdited(updated as ForumPost)}
        />
        <DeleteButton
          postId={post.id}
          targetLabel="게시글"
          onDeleted={onDeleted}
        />
      </div>
      {commentsOpen && <RowComments postId={post.id} onCountChange={setCommentCount} />}
    </article>
  );
}
