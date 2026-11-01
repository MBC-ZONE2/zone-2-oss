"use client";

// ============================================================================
// components/forum/post-detail — 게시글 상세 (본문 + 액션 + 댓글)
//
// 사안 헤더(연결 크로스뷰 있을 때: ⋯/▬ 두 줄 헤드라인 + "↔ 크로스뷰로") →
// 제목 28px 700 → "이름 · 날짜" → 본문 17px/1.7 → 액션 줄 한 줄 15px
// (좌: 공감(빈 링→채운 점) · 댓글 수 / 우: 신고·수정·삭제, 넘치면 우측만 다음 줄) →
// 댓글 인용괘선 목록 → 댓글 폼(이름·비번 2열 — app/forum.css) → "다른 최신 건의" 5건.
// 데스크탑(≥1100px)은 grid 로 눈금·최신 건의를 우 레일에 앉힌다; 둘 다 없으면
// .fo-detail--norail 로 레일을 접고 본문 열을 가운데에 둔다.
// [결정 6] 글은 제목 26px 800 · 본문 18px, 댓글은 16px + 왼쪽 44px 들여쓰기(app/forum.css).
// 시그니처: 공감을 누르면 점이 켜지고(200ms) 상단 '이 사안 온도' 눈금(있을 때)이
// 한 칸 흔들리며 "반영 예정(15분)" 이 붙는다. 내 글이면 제목 옆에 잉크 점.
// 삭제/가려진 글은 자리표시자. 게시글 삭제 성공 시 router.refresh.
// ============================================================================

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { ForumPost } from "@/types";
import type { ForumPostView } from "@/lib/forum/interactions";
import { authorDisplayLabel } from "@/lib/forum/hash";
import { RelativeTime } from "./relative-time";
import { LikeButton } from "./like-button";
import { ReportDialog } from "./report-dialog";
import { EditButton } from "./edit-button";
import { DeleteButton } from "./delete-button";
import { HiddenNotice } from "./hidden-notice";
import { CommentSection } from "./comment-section";
import { MyInkDot } from "./my-ink-dot";
import { IssueGauge } from "./issue-gauge";
import { RelatedPosts } from "./related-posts";
import type { IssueTemp } from "./issue-temp";
import { crossviewHref, type PairByArticle } from "./crossview-links";
import type { IssueHead } from "@/lib/forum/queries";
import { IssueHeadline } from "./issue-group";
import "@/app/forum.css";

/** 본문 앞 60자 — 제목 없는 글의 낭독기용 h1 */
function excerpt(body: string, max = 60): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function PostDetail({
  view,
  issue = null,
  pairByArticle,
  issueHead = null,
  related = [],
}: {
  view: ForumPostView;
  /** 키워드 매칭된 공론 온도 사안 — 있을 때만 상단 눈금 */
  issue?: IssueTemp | null;
  /** 연결 기사 → 크로스뷰 페어 id */
  pairByArticle?: PairByArticle;
  /** 연결 크로스뷰 사안 헤드(getIssueHeadsForArticles) — 있을 때만 상단 마커 두 줄 */
  issueHead?: IssueHead | null;
  /** 우 레일 "다른 최신 건의"(현재 글 제외, 최대 5건) — 빈 배열이면 생략 */
  related?: ForumPost[];
}) {
  const router = useRouter();
  const [post, setPost] = useState(view.post);
  const { comments, likedIds } = view;
  const [commentCount, setCommentCount] = useState(comments.length);
  // 공감 시그니처 — nudge 카운터(눈금 흔들림) + 반영 예정 표기
  const [nudge, setNudge] = useState(0);
  const [pendingTemp, setPendingTemp] = useState(false);

  const deleted = Boolean(post.deletedAt);
  const hidden = deleted || post.isFlagged;
  const liked = likedIds.includes(post.id);
  // 크로스뷰 링크 — 사안 헤드가 있으면 그 페어로, 없으면 페어 id 맵(없으면 목록)으로
  const xhref = issueHead
    ? `/crossview/${issueHead.pairId}`
    : crossviewHref(post.articleId, pairByArticle);

  function markDeleted() {
    setPost((current) => ({
      ...current,
      title: null,
      body: "",
      deletedAt: new Date().toISOString(),
    }));
    router.refresh();
  }

  const onLikeToggled = useCallback((nextLiked: boolean) => {
    if (nextLiked) {
      setNudge((n) => n + 1);
      setPendingTemp(true);
    }
  }, []);

  const label = authorDisplayLabel(post.authorHash, post.displayName);
  // 레일에 앉힐 게 하나도 없으면 데스크탑에서 레일을 접는다(본문 가운데 정렬 폴백)
  const noRail = !issue && related.length === 0;

  return (
    <main className={noRail ? "forum forum-page fo-detail fo-detail--norail" : "forum forum-page fo-detail"}>
      <Link href="/forum" className="fo-back">
        <span aria-hidden>←</span> 공론장
      </Link>

      {issue ? (
        <IssueGauge issue={issue} nudgeKey={nudge} pending={pendingTemp} />
      ) : null}

      <article>
        <header>
          {!hidden && (issueHead || xhref) ? (
            <div className="fo-detail-issue">
              {issueHead ? <IssueHeadline head={issueHead} as="p" /> : null}
              {xhref ? (
                <Link href={xhref} className="fo-textlink fo-xlink">
                  <span aria-hidden>↔</span> 크로스뷰로
                </Link>
              ) : null}
            </div>
          ) : null}
          {/* 제목 없는 글(사안 댓글)은 "(제목 없음)" 을 찍지 않는다 — 본문이 곧 글이다.
              문서 구조(h1)는 낭독기용으로만 남기고 화면에서는 본문이 첫 줄이 된다 */}
          {!hidden && !post.title?.trim() ? (
            <h1 className="sr-only">{excerpt(post.body)}</h1>
          ) : (
            <h1 className="fo-h1">
              {hidden ? (deleted ? "삭제된 글" : "가려진 글") : post.title?.trim()}
              {!hidden ? <MyInkDot postId={post.id} /> : null}
            </h1>
          )}
          <p className="fo-meta fo-byline">
            {!hidden && (
              <>
                <span>{label}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <RelativeTime iso={post.createdAt} />
          </p>
        </header>

        {hidden ? (
          <div className="fo-body">
            <HiddenNotice kind={deleted ? "deleted" : "flagged"} target="글" />
          </div>
        ) : (
          <div className={`fo-body${post.title?.trim() ? "" : " fo-body--lead"}`}>
            {post.body}
            {!post.title?.trim() ? <MyInkDot postId={post.id} /> : null}
          </div>
        )}
        {!hidden && post.imageUrl ? (
          <figure className="fo-figure">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.imageUrl} alt="글에 첨부된 사진" loading="lazy" decoding="async" />
          </figure>
        ) : null}

        {!hidden && (
          <div className="fo-actbar">
            {/* 좌: 공감 · 댓글 수 */}
            <div className="fo-act-l">
              <LikeButton
                postId={post.id}
                initialCount={post.likeCount}
                initialLiked={liked}
                onToggled={onLikeToggled}
              />
              <a href="#forum-comments-heading" className="fo-stat">
                댓글 {commentCount}
              </a>
            </div>
            {/* 우: 신고 · 수정 · 삭제 — 넘치면 이 그룹만 다음 줄 */}
            <div className="fo-act-r">
              <ReportDialog postId={post.id} targetLabel="게시글" />
              <EditButton
                postId={post.id}
                targetLabel="게시글"
                initialTitle={post.title}
                initialBody={post.body}
                allowTitle={!post.articleId}
                onEdited={(updated) => setPost(updated as ForumPost)}
              />
              <DeleteButton
                postId={post.id}
                targetLabel="게시글"
                onDeleted={markDeleted}
              />
            </div>
          </div>
        )}
      </article>

      <CommentSection
        postId={post.id}
        initialComments={comments}
        likedIds={likedIds}
        onCountChange={setCommentCount}
      />

      <RelatedPosts posts={related} />
    </main>
  );
}
