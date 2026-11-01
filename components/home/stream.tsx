// ============================================================================
// components/home/stream — 1면 스트림(우 1/3): 3개 하위 섹션(32px 여백 구분)
//
//   1) 지금 공론장에선 — 공론장 최신 4건(제목 링크 + 공감 수, 중립 잉크 dot)
//   2) 오늘의 충북    — 팟캐스트 최신 1건(온에어 줄: 네이비 재생 버튼 + 검수 라벨)
//   3) 두 시선 더 보기 — 크로스뷰 2~4번째 페어(readingPoint 한 줄 링크 + 신뢰도%)
//
// 하위 섹션 사이는 괘선 대신 여백(32px)으로 구분하고, hairline 은 리스트 행에만 남긴다.
//
// 인라인 플레이어는 상세(/podcast)로 위임한다(온에어 카드는 링크). 서버 컴포넌트.
// ============================================================================

import Link from "next/link";
import type { CrossviewPairWithArticles } from "@/lib/matching";
import type { Episode, ForumPost } from "@/types";
import { AIVerifiedLabel } from "@/components/ui/ai-verified-label";
import {
  confidencePercent,
  formatDuration,
  formatMonthDay,
  truncate,
} from "./format";

interface StreamProps {
  posts: ForumPost[];
  podcast: Episode | null;
  morePairs: CrossviewPairWithArticles[];
}

/** 하위 섹션 제목(소형캡 h2) */
function StreamHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2
      id={id}
      className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
    >
      {children}
    </h2>
  );
}

/** 1) 지금 공론장에선 — 최신 게시글 목록 */
function ForumStream({ posts }: { posts: ForumPost[] }) {
  return (
    <section
      aria-labelledby="stream-forum"
      className="z2-card flex flex-col gap-3 p-4"
    >
      <StreamHeading id="stream-forum">지금 공론장에선</StreamHeading>
      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          아직 올라온 글이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col">
          {posts.map((post) => (
            <li key={post.id} className="border-t border-line first:border-t-0">
              <Link
                href={`/forum/${post.id}`}
                className="group flex items-start justify-between gap-3 py-2 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action"
              >
                <span className="line-clamp-2 flex-1 text-sm font-medium leading-snug text-foreground group-hover:text-action">
                  {post.title?.trim() || truncate(post.body, 40)}
                </span>
                <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full bg-foreground/40"
                  />
                  {post.likeCount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 2) 오늘의 충북 — 온에어 카드(재생 버튼 + 검수 라벨 + 메타) */
function PodcastStream({ podcast }: { podcast: Episode | null }) {
  const dateText = podcast
    ? (formatMonthDay(podcast.publishedAt) ?? formatMonthDay(podcast.scheduledFor))
    : null;
  const durationText = podcast ? formatDuration(podcast.durationSec) : null;
  const verified = podcast?.status === "published";

  return (
    <section
      aria-labelledby="stream-podcast"
      className="z2-card z2-card-lift flex flex-col gap-3 p-4"
    >
      <StreamHeading id="stream-podcast">오늘의 충북</StreamHeading>
      {!podcast ? (
        <p className="text-sm text-muted-foreground">
          공개된 에피소드가 없습니다.
        </p>
      ) : (
        <Link
          href="/podcast"
          className="group -mx-2 flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <AIVerifiedLabel
              verified={verified}
              verifiedAt={podcast.publishedAt ?? undefined}
              size="sm"
            />
            <span className="line-clamp-2 font-display text-sm font-semibold leading-snug text-foreground">
              {podcast.title?.trim() || "제목 준비 중"}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {dateText ? <span>{dateText}</span> : null}
              {dateText && durationText ? <span aria-hidden>·</span> : null}
              {durationText ? (
                <span className="font-mono tabular-nums">{durationText}</span>
              ) : null}
            </span>
          </div>
        </Link>
      )}
    </section>
  );
}

/** 3) 두 시선 더 보기 — 보조 크로스뷰 페어 한 줄 링크 */
function MoreCrossviewStream({
  pairs,
}: {
  pairs: CrossviewPairWithArticles[];
}) {
  if (pairs.length === 0) return null;
  return (
    <section
      aria-labelledby="stream-more"
      className="z2-card flex flex-col gap-3 p-4"
    >
      <StreamHeading id="stream-more">두 시선 더 보기</StreamHeading>
      <ul className="flex flex-col">
        {pairs.map((pair) => {
          const confidence = confidencePercent(pair.matchScore);
          return (
            <li key={pair.id} className="border-t border-line first:border-t-0">
              <Link
                href={`/crossview/${pair.id}`}
                className="group flex items-start justify-between gap-3 py-2 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action"
              >
                <span className="line-clamp-2 flex-1 text-sm font-medium leading-snug text-foreground group-hover:text-action">
                  {pair.readingPoint?.trim() || "같은 사안, 두 개의 시선"}
                </span>
                {confidence != null ? (
                  <span className="mt-0.5 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {confidence}%
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 1면 스트림(우 1/3) */
export function Stream({ posts, podcast, morePairs }: StreamProps) {
  return (
    <div className="flex flex-col gap-8">
      <ForumStream posts={posts} />
      <PodcastStream podcast={podcast} />
      <MoreCrossviewStream pairs={morePairs} />
    </div>
  );
}
