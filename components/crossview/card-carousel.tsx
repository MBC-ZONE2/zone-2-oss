// ============================================================================
// components/crossview/card-carousel — 상세의 카드뉴스 섹션
//
// card_data.slides ≥ 3장이면 홈 덱과 같은 4페이지 카드 스토리(<CardStory>, 높이 420px)
// 를 쓰고, 그 아래 "N번째 카드 이미지 저장" 링크를 한 줄로 유지한다(기능 불변:
// /api/crossview/[id]/card/[i] PNG). 3장 미만이면 기존 가로 레일(종이 타일) 그대로.
// 레일 이동은 네이티브 스크롤 + 잉크 원 버튼 + ←→. prefers-reduced-motion 시
// smooth 스크롤은 찍힘("auto")으로 낮춘다(lib/ui/motion.scrollBehavior).
// 스타일: app/crossview.css(.cvp-rail) · app/story.css(.cstory)
// ============================================================================

"use client";

import { useCallback, useRef, useState } from "react";
import { region } from "@/config/region";
import type { CrossviewCardData } from "@/types";
import CardStory, { type StoryPair } from "@/components/reels/card-story";
import { Marker } from "./marker";
import { scrollBehavior } from "@/lib/ui/motion";

/** card_data.slides 요소 (open shape → 안전 파싱) */
interface Slide {
  kind: string;
  title: string;
  body: string;
  sourceLabel?: string;
}

/** card_data(unknown)에서 슬라이드 배열을 안전하게 추출 */
function parseSlides(cardData: CrossviewCardData | null): Slide[] {
  if (!cardData || typeof cardData !== "object") return [];
  const slides = (cardData as { slides?: unknown }).slides;
  if (!Array.isArray(slides)) return [];
  return slides
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      kind: typeof s.kind === "string" ? s.kind : "point",
      title: typeof s.title === "string" ? s.title : "",
      body: typeof s.body === "string" ? s.body : "",
      sourceLabel: typeof s.sourceLabel === "string" ? s.sourceLabel : undefined,
    }))
    .filter((s) => s.title || s.body);
}

/** 컷 종류 → 아이브로우 활자 */
function kindLabel(slide: Slide): string {
  if (slide.sourceLabel) return slide.sourceLabel;
  if (slide.kind === "cover") return "표지";
  if (slide.kind === "macro") return `${region.outlets.macro.tier} · ${region.outlets.macro.name}`;
  if (slide.kind === "micro") return `${region.outlets.micro.tier} · ${region.outlets.micro.name}`;
  return "읽는 점";
}

/** 원문 링크 한 쌍(호환용 — 현재 상세 페이지는 원문 링크를 별도 섹션으로 찍는다) */
interface SourceLink {
  label: string;
  outlet: string;
  url: string;
}

export function CardCarousel({
  cardData,
  pairId,
  pair,
  articleId,
  commentCount,
  forumHref,
}: {
  cardData: CrossviewCardData | null;
  /** 이미지 저장 라우트(/api/crossview/[id]/card/[index]) 구성용 */
  pairId?: string;
  /** (호환용, 미사용) */
  sources?: SourceLink[];
  /** 있으면 스토리 표지·원문 링크에 쓴다(card_headline·card_image_url·reading_point·macro/micro). 없어도 card_data 만으로 그린다 */
  pair?: Partial<StoryPair>;
  /** ④ 페이지 한 줄 작성기가 글을 연결할 기사 id — 생략하면 pair.micro → macro 로 유도(CardStory) */
  articleId?: string | null;
  /** 이 사안 댓글 수 — 있으면 "이 사안 댓글 N개 · 공론장에서 이어 보기 →" */
  commentCount?: number;
  /** 공론장 링크(생략 시 /forum#issue-<pairId>) */
  forumHref?: string;
}) {
  const slides = parseSlides(cardData);
  const railRef = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const total = slides.length;

  // ≥3컷 — 홈 덱과 같은 4페이지 카드 스토리(420px) + 저장 링크 한 줄
  const storyPair: StoryPair | null =
    total >= 3 ? { ...pair, id: pair?.id ?? pairId ?? "", cardData } : null;

  /** n번째 타일로 스크롤(스냅 정렬 기준 = 타일 좌측) */
  const go = useCallback(
    (n: number) => {
      const rail = railRef.current;
      if (!rail) return;
      const next = Math.max(0, Math.min(total - 1, n));
      const tile = rail.children[next] as HTMLElement | undefined;
      // reduced-motion 이면 찍힘 이동
      if (tile) rail.scrollTo({ left: tile.offsetLeft, behavior: scrollBehavior() });
      setIndex(next);
    },
    [total],
  );

  /** 스크롤 위치로 현재 컷 추적 */
  const onScroll = () => {
    const rail = railRef.current;
    if (!rail || total === 0) return;
    const tiles = Array.from(rail.children) as HTMLElement[];
    let best = 0;
    let bestDist = Infinity;
    tiles.forEach((t, i) => {
      const d = Math.abs(t.offsetLeft - rail.scrollLeft);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best !== index) setIndex(best);
  };

  if (total === 0) return null;

  if (storyPair) {
    return (
      <section aria-label="카드뉴스" className="cvp-rail-wrap">
        <div className="cvp-rail-head">
          <h2>카드뉴스</h2>
          <span>SNS 공유용 {total}컷 · 3페이지</span>
        </div>
        <CardStory
          pair={storyPair}
          height={420}
          eagerCover
          pages={3}
          articleId={articleId}
          commentCount={commentCount}
          forumHref={forumHref}
        />
        {/* 카드 이미지 저장 링크는 뺐다 — 필요하면 사진 우클릭 저장(사용자 지시) */}
      </section>
    );
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
  };

  return (
    <section aria-roledescription="캐러셀" aria-label="카드뉴스" className="cvp-rail-wrap">
      <div className="cvp-rail-head">
        <h2>카드뉴스</h2>
        <span>SNS 공유용 {total}컷</span>
      </div>

      <ul
        ref={railRef}
        className="cvp-rail"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={onScroll}
        aria-label="카드뉴스 컷 목록"
      >
        {slides.map((slide, i) => (
          <li
            key={`${slide.kind}-${i}`}
            className={`cvp-tile ${slide.kind}`}
            role="group"
            aria-roledescription="슬라이드"
            aria-label={`${i + 1}번째 카드, 전체 ${total}개`}
          >
            <span className="cvp-tile-k">
              {slide.kind === "macro" ? <Marker side="macro" /> : null}
              {slide.kind === "micro" ? <Marker side="micro" /> : null}
              {kindLabel(slide)}
            </span>
            {slide.title ? <h3>{slide.title}</h3> : null}
            {slide.body ? <p>{slide.body}</p> : null}
          </li>
        ))}
      </ul>

      {total > 1 ? (
        <div className="cvp-rail-nav">
          {/* disabled 대신 aria-disabled — 끝 카드에서 포커스가 body 로 떨어지지 않게 */}
          <button
            type="button"
            onClick={() => {
              if (index === 0) return;
              go(index - 1);
            }}
            aria-disabled={index === 0 ? "true" : undefined}
            aria-label="이전 카드"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => {
              if (index === total - 1) return;
              go(index + 1);
            }}
            aria-disabled={index === total - 1 ? "true" : undefined}
            aria-label="다음 카드"
          >
            ›
          </button>
          <span>
            {index + 1} / {total}
          </span>
        </div>
      ) : null}

      <span className="sr-only" role="status" aria-live="polite">
        전체 {total}개 중 {index + 1}번째 카드
      </span>
    </section>
  );
}
