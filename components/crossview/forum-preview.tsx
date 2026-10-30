"use client";

// ============================================================================
// components/crossview/forum-preview — 공론장 미리보기 = 검은 타일 "댓글 N" (FR-CD-08)
//
// Figma "크로스뷰 — 댓글 전체": 검은 세계(#0b0d12) 타일 하나에
//   ① 아이브로우 "댓글 N · 이 사안에 남긴 말"
//   ② <OpinionComposer variant="issue" tone="dark"> — 큰 입력창 + 이름·비번 2열 + '올리기'
//   ③ 의견 목록(서버가 준 최대 30건 전부): 아바타 원(이름 앞 2자, 흰 24px) + 이름 15px
//      + 본문 17px(2줄 clamp) + 상대시각 12px + 좋아요 숫자(표시만). 1px 흰 괘선.
//      30건 이상이면 "공론장에서 더 보기 →".
// 작성 성공 시 목록 맨 위에 즉시 붙인다(낙관적). router.refresh 로 서버 목록이
// 뒤따라오면 id 로 중복 제거. 연결된 글이 없으면 빈 링(점선 원) + "첫 의견 남기기".
// 클라이언트 컴포넌트(낙관적 목록 상태) — 데이터는 상세 페이지가 조회해 주입한다.
// 스타일: app/crossview.css(.cvp-forum)
// ============================================================================

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { ForumPost } from "@/types";
import { shortAuthorLabel } from "@/lib/forum/hash";
import { RelativeTime } from "@/components/forum/relative-time";
import { OpinionComposer } from "@/components/forum/opinion-composer";

/** 이 수 이상이면 서버 조회 상한(page.tsx FORUM_FETCH_LIMIT)에 닿은 것 → 공론장으로 안내 */
const MORE_THRESHOLD = 30;

/** 아바타 원에 넣을 이름 앞 2자(공백 제거). 익명-해시는 "익명" */
function initials(name: string): string {
  const compact = name.replace(/\s+/g, "");
  return Array.from(compact).slice(0, 2).join("") || "익명";
}

/** 의견 한 행 — 아바타 원 · 이름 · 본문(2줄) · 상대시각 · 좋아요 숫자 */
function PostRow({ post }: { post: ForumPost }) {
  const author = post.displayName?.trim() || shortAuthorLabel(post.authorHash);
  // 본문 우선(한 줄 의견). 본문이 비었으면(가려진 글) 제목으로 폴백.
  const text = post.body?.trim() || post.title?.trim() || "";
  return (
    <li className="cvp-forum-row">
      <Link href={`/forum/${post.id}`}>
        <span className="cvp-forum-avatar" aria-hidden>
          {initials(author)}
        </span>
        <span className="cvp-forum-name">{author}</span>
        <span className="cvp-forum-body">{text}</span>
        <span className="cvp-forum-meta">
          <RelativeTime iso={post.createdAt} />
          {post.likeCount > 0 ? (
            <span aria-label={`공감 ${post.likeCount}`}>
              <span aria-hidden>○</span> {post.likeCount}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

/** 연결 공론장 미리보기 섹션 */
export function ForumPreview({
  posts,
  total,
  articleId = null,
}: {
  posts: ForumPost[];
  /** 연결된 글 총수(모르면 posts.length) */
  total?: number;
  /** 작성기가 글을 연결할 기사 id — 없으면 작성기를 숨긴다 */
  articleId?: string | null;
}) {
  // 이 브라우저에서 방금 작성한 글(낙관적). 서버 목록에 같은 id 가 오면 제외한다.
  const [added, setAdded] = useState<ForumPost[]>([]);

  const handleCreated = useCallback((post: ForumPost) => {
    setAdded((prev) => (prev.some((p) => p.id === post.id) ? prev : [post, ...prev]));
  }, []);

  const rows = useMemo(() => {
    const serverIds = new Set(posts.map((p) => p.id));
    const pending = added.filter((p) => !serverIds.has(p.id));
    return [...pending, ...posts];
  }, [added, posts]);

  const serverTotal = typeof total === "number" ? total : posts.length;
  const count = serverTotal + (rows.length - posts.length);
  const hasMore = rows.length >= MORE_THRESHOLD;

  return (
    <section aria-labelledby="forum-preview-title" className="cvp-forum">
      <div className="cvp-forum-tile">
        {/* ① 아이브로우 — 숫자는 tabular, 살아 있는 값 */}
        <h2 id="forum-preview-title" className="cvp-forum-eyebrow">
          <span className="cvp-forum-count">
            댓글 <b aria-live="polite">{count}</b>
          </span>
          <span aria-hidden>·</span>
          <span>이 사안에 남긴 말</span>
        </h2>

        {/* ② 의견 작성기 — 통일 작성기(검은 타일 톤) */}
        {articleId ? (
          <OpinionComposer
            variant="issue"
            tone="dark"
            articleId={articleId}
            onCreated={handleCreated}
          />
        ) : null}

        {/* ③ 의견 목록 */}
        {rows.length === 0 ? (
          <p className="cvp-forum-empty">
            첫 의견 남기기 — 위 입력창에 바로 쓸 수 있습니다.
          </p>
        ) : (
          <ul className="cvp-forum-list">
            {rows.map((post) => (
              <PostRow key={post.id} post={post} />
            ))}
          </ul>
        )}

        {hasMore ? (
          <Link href="/forum" className="cvp-forum-more">
            공론장에서 더 보기 <span aria-hidden>→</span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
