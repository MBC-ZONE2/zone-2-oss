"use client";

// ============================================================================
// components/forum/related-posts — 상세 우 레일 "다른 최신 건의" 목록
//
// 현재 글을 뺀 최신 글 최대 5건. 한 항목 = 제목 1줄(말줄임) + 날짜 15px,
// 1px 괘선 행, 탭 타깃 44px. DOM 은 댓글 뒤(모바일 순서), 데스크탑은 grid 로
// 우 레일(눈금 아래)에 앉힌다 — app/forum.css .fo-related.
// 빈 배열이면 렌더하지 않는다(레일 숨김 여부는 PostDetail 이 판단).
// ============================================================================

import Link from "next/link";
import type { ForumPost } from "@/types";
import { RelativeTime } from "./relative-time";

/** 본문 앞 48자 — 제목 없는 글의 목록 표기 */
function excerpt(body: string, max = 48): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function RelatedPosts({ posts }: { posts: ForumPost[] }) {
  if (posts.length === 0) return null;
  return (
    <aside className="fo-related" aria-labelledby="forum-related-heading">
      <h2 id="forum-related-heading">다른 최신 글</h2>
      <ul>
        {posts.map((p) => (
          <li key={p.id}>
            <Link href={`/forum/${p.id}`}>
              {/* 목록은 제목 없이 본문 앞머리(2026-10-19) — 예전 글의 제목은 상세에서만 */}
              <span className="fo-related-title">{excerpt(p.body)}</span>
              <span className="fo-related-date">
                <RelativeTime iso={p.createdAt} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
