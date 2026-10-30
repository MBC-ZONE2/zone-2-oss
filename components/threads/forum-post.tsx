// ============================================================================
// components/threads/forum-post — 홈 피드 공론장 포스트
//
// 크로스뷰 사이에 섞여 흐르는 주민 목소리(공론장) 아이템. 실 forum_posts 데이터.
// 익명(authorHash)·실명(displayName) 모두 대응. 공론장 목록과 같은 괘선 행 문법
// (앞 점 = 공감 크기 4단 · 제목 20px · "이름 · 날짜 · 공론장") — 아바타·필 없음.
// 스타일: app/forum.css (.fo-row*)
// ============================================================================

import Link from "next/link";
import type { ForumPost } from "@/types";
import { formatDate } from "@/components/crossview/format";
import { dotSize } from "@/components/forum/dot-size";
import "@/app/forum.css";

export function ForumFeedPost({ post }: { post: ForumPost }) {
  const author = post.displayName?.trim() || "익명 주민";
  const when = formatDate(post.createdAt);
  const detail = `/forum/${post.id}`;
  // 여론광장 크롤은 title==body 인 경우가 있어 중복 노출을 피한다.
  const showTitle =
    post.title?.trim() && post.title.trim() !== post.body.trim();

  return (
    <article className="forum fo-row">
      <span
        className="fo-dot"
        data-size={dotSize(post.likeCount)}
        role="img"
        aria-label={`공감 ${post.likeCount}`}
      />
      <Link href={detail} className="fo-row-link">
        {showTitle ? <h3 className="fo-title">{post.title}</h3> : null}
        <p className="fo-body" style={{ margin: 0, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {post.body}
        </p>
        <p className="fo-meta">
          <span>{author}</span>
          {when ? (
            <>
              <span aria-hidden>·</span>
              <time dateTime={post.createdAt}>{when}</time>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span>공론장</span>
        </p>
      </Link>
      <div className="fo-row-foot">
        <Link href={detail} className="fo-textlink fo-xlink">
          공론장에서 이어보기 <span aria-hidden>→</span>
        </Link>
      </div>
    </article>
  );
}
