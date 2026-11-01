"use client";
// 홈 — 릴스식 세로 스냅 덱. 스크롤 한 번 = 항목 하나.
// 실앱 셸(ThreadsShell)의 중앙 컬럼 안에서 독립 스크롤 컨테이너로 동작한다.
// 데이터는 서버(app/page.tsx)에서 실 Supabase 조회 결과를 props 로 주입받는다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildDeck,
  countCrossviewSlides,
  KIND_LABEL,
  tempForItem,
  type DeckKind,
  type ReelsData,
} from "@/lib/reels/deck";
import Cover, { type CoverPhase } from "@/components/home/cover";
import InkDot, { type InkBand } from "./ink-dot";
import { scrollBehavior } from "@/lib/ui/motion";
import { region } from "@/config/region";
import {
  PodcastSlide,
  TemperatureSlide,
  CrossviewSlide,
  CrossviewCardsSlide,
  NoticesSlide,
  ForumSlide,
  EndSlide,
} from "./slides";

/**
 * 슬라이드 종류 → 세계(바닥). 콘텐츠 종류가 바뀌면 바닥이 뒤집혀 "다른 내용"임을 즉시 알린다.
 *   paper: cover · crossview · crossview-cards · notices(종이 + 상단 주황 마감 띠)
 *   dark : podcast(검정 #000) · temperature · forum · end(검은 세계 #0b0d12)
 * 슬라이드는 data-kind 로 자기 세계를 CSS 변수로 갖고, 덱 루트는 현재 슬라이드의 세계를
 * data-world="paper|dark" 로 올려 topbar·잉크 점이 함께 반전된다(app/reels.css).
 */
export type World = "paper" | "dark";
export function worldOf(kind: DeckKind): World {
  return kind === "podcast" || kind === "temperature" || kind === "forum" || kind === "end"
    ? "dark"
    : "paper";
}

/** 키 이벤트가 입력·조작 요소(또는 그 안)에서 났는가 — 그 안의 ↑↓ 는 덱 페이징에 쓰지 않는다 */
const INTERACTIVE_SEL = "input, textarea, select, button, a, [contenteditable]:not([contenteditable='false'])";
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(INTERACTIVE_SEL) !== null;
}


/** 앞쪽 몇 장만 즉시 그리고, 나머지는 뷰포트에 가까워질 때 마운트한다(홈 HTML·DOM 절감 — 속도 개선 2026-09-08).
 *  자리(section.slide)는 항상 있어 스냅·인덱스가 유지되고, 내용만 늦게 들어온다. */
const EAGER_SLIDES = 6;
function LazyMount({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (typeof IntersectionObserver === "undefined") { setShow(true); return; }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { setShow(true); io.disconnect(); } },
      { rootMargin: "150% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return show ? <>{children}</> : <div ref={ref} className="slide-pending" aria-hidden="true" />;
}

export default function ReelsDeck({ data }: { data: ReelsData }) {
  const deck = useMemo(() => buildDeck(data), [data]);
  const [idx, setIdx] = useState(0);
  const deckRef = useRef<HTMLDivElement>(null);
  // 표지 연출 단계 — 백색 수렴이 끝나는 900ms(print) 전에는 잉크 점을 찍지 않는다
  const [coverPhase, setCoverPhase] = useState<CoverPhase>("done");
  const onCoverPhase = useCallback((p: CoverPhase) => setCoverPhase(p), []);

  // 현재 보이는 슬라이드 추적 (IntersectionObserver)
  useEffect(() => {
    const root = deckRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return undefined;
    const slides = Array.from(root.querySelectorAll<HTMLElement>("[data-slide]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setIdx(Number((e.target as HTMLElement).dataset.slide));
        }
      },
      { root, threshold: 0.6 },
    );
    slides.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [deck.length]);

  // 키보드 ↑↓ 페이징
  //   · 입력 필드(textarea·input·select·button·a·contenteditable) 안의 ↑↓ 는 커서 이동이 우선 — 건드리지 않는다
  //   · IME 조합 중(isComposing)도 무시
  //   · 데스크톱(≥1100px)에서는 덱이 CSS(.only-mobile)로만 숨겨진 채 마운트되어 있으므로,
  //     실제로 그려지고 있을 때(getClientRects 가 비어 있지 않을 때)만 처리한다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (e.isComposing || e.defaultPrevented) return;
      if (isInteractiveTarget(e.target)) return;
      const root = deckRef.current;
      if (!root || root.getClientRects().length === 0) return;
      e.preventDefault();
      const next = Math.min(
        Math.max(idx + (e.key === "ArrowDown" ? 1 : -1), 0),
        deck.length - 1,
      );
      // reduced-motion 이면 찍힘 이동(핸들러 안에서 matchMedia 를 읽는다)
      root
        .querySelector<HTMLElement>(`[data-slide="${next}"]`)
        ?.scrollIntoView({ behavior: scrollBehavior() });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, deck.length]);

  const current = deck[idx] || deck[0];

  const progress = deck.length > 1 ? (idx + 1) / deck.length : 1;

  // 우측 레일 잉크 점 — 크로스뷰 슬라이드면 매칭된 사안의 온도 밴드, 아니면 회색 24px
  let dotBand: InkBand | null = null;
  let dotTemp: number | null = null;
  if (current && (current.kind === "crossview" || current.kind === "crossview-cards")) {
    const m = tempForItem(current.item, data.temperature);
    if (m) {
      dotBand = m.band.label as InkBand;
      dotTemp = m.row.temperature;
    }
  }
  // 온도가 없는 슬라이드(표지·팟캐·공고·공론장·끝, 매칭 없는 사안)에서는 점을 감춘다 —
  // 뜻 없는 회색 원만 남아 "이게 뭐냐"는 지적(2026-09-08). 온도가 있을 때만 "65°" 라벨과 함께 찍힌다.
  const dotHidden = (idx === 0 && (coverPhase === "hold" || coverPhase === "play")) || dotBand === null;

  // 현재 슬라이드의 세계 — 덱 루트(data-world)와 html 루트(html[data-world])에 올린다.
  // html 쪽은 덱 밖 요소(네비 등)가 읽을 수 있도록 미러링만 하고, 언마운트 시 지운다.
  const world: World = current ? worldOf(current.kind) : "paper";
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.world = world;
    return () => {
      delete root.dataset.world;
    };
  }, [world]);

  return (
    <div
      className="reels-viewport"
      data-world={world}
      style={{ "--rl-progress": progress } as React.CSSProperties}
    >
      {/* 표지(0번)에서는 진행 바를 숨긴다(visibility — 높이는 유지) */}
      <header className={idx === 0 ? "reels-topbar is-cover" : "reels-topbar"} id="reels-top">
        <span className="topbar-kind">{current ? KIND_LABEL[current.kind] : ""}</span>
        {/* 상단 가운데 ZONE-2 로고(대표 지시 2026-10-21) — 표지에서도 보인다. 검은 세계에서는 CSS 가 밝은 판으로 바꾼다 */}
        <span className="topbar-logo" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/zone2-black.png" alt="" width={600} height={119} className="topbar-logo-img topbar-logo-img--paper" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/zone2-ondark.png" alt="" width={600} height={119} className="topbar-logo-img topbar-logo-img--dark" />
        </span>
        <span className="progress">
          {idx + 1} / {deck.length}
        </span>
        <span className="topbar-line" aria-hidden="true" />
      </header>

      <main className="deck" ref={deckRef} aria-label={`${region.site.name} 피드`}>
        {deck.map((slide, i) => (
          <section
            className="slide"
            data-slide={i}
            data-kind={slide.kind}
            data-world={worldOf(slide.kind)}
            data-in={i === idx ? "true" : "false"}
            key={i}
            aria-label={`${i + 1}번째: ${KIND_LABEL[slide.kind]}`}
          >
            {slide.kind === "cover" && (
              <Cover data={data} first={deck[1]} onPhase={onCoverPhase} />
            )}
            {slide.kind === "podcast" && <PodcastSlide ep={slide.ep} />}
            {slide.kind === "temperature" && (
              <TemperatureSlide
                items={data.temperature}
                computedAt={data.temperatureComputedAt}
              />
            )}
            {slide.kind === "crossview" && (
              i < EAGER_SLIDES ? (
                <CrossviewSlide item={slide.item} temperature={data.temperature} />
              ) : (
                <LazyMount><CrossviewSlide item={slide.item} temperature={data.temperature} /></LazyMount>
              )
            )}
            {slide.kind === "crossview-cards" && (
              i < EAGER_SLIDES ? (
                <CrossviewCardsSlide item={slide.item} temperature={data.temperature} />
              ) : (
                <LazyMount><CrossviewCardsSlide item={slide.item} temperature={data.temperature} /></LazyMount>
              )
            )}
            {slide.kind === "notices" && <NoticesSlide notices={data.notices} deadlines={data.deadlines} />}
            {slide.kind === "forum" && <ForumSlide posts={data.forum} />}
            {slide.kind === "end" && (
              <EndSlide
                computedAt={data.temperatureComputedAt}
                ep={data.episodes[0]}
                crossviewShown={countCrossviewSlides(deck)}
                crossviewTotal={data.crossviewTotal}
              />
            )}
          </section>
        ))}
      </main>

      {/* 슬라이드 이동 낭독 — "3번째, 크로스뷰" */}
      <p className="sr-only" aria-live="polite">
        {current ? `${idx + 1}번째, ${KIND_LABEL[current.kind]}` : ""}
      </p>
      <InkDot
        index={idx}
        total={deck.length}
        band={dotBand}
        temperature={dotTemp}
        hidden={dotHidden}
      />
    </div>
  );
}
