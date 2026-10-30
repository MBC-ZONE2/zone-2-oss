"use client";
// ============================================================================
// components/reels/card-story — 크로스뷰 4페이지 카드 스토리 (홈 덱 · 상세 공용)
//
// Figma 「크로스뷰 (2페이지)」·기획안 "4페이지 카드 스토리":
//   ① 표지: 사진 52%(PairPhoto=점묘 DotImage+출처; 사진은 pairImage — 옥천신문 원본 우선,
//      원본이면 캡션 자리에 13px "사진 · 옥천신문" 출처. 로딩이 깨지면 다음 후보로 내려간다)
//      + 종이 블록에 card_headline 두 줄(⋯/▬, 같은 굵기)
//      + 'AI가 정리' 인라인 스탬프 + reading_point 한 문단(17px, 말줄임 없이 전체 — 검토 의견:
//      "AI 요약이 맨 뒷장이라 동선이 길다"). 문단이 길면 표지 활자 블록만 세로 스크롤.
//   ② 광역: ⋯ "광역 · MBC충북" — card_data.slides[kind=macro] 제목 22px + 본문 17px
//   ③ 기초: ▬ "기초 · 옥천신문" — kind=micro
//   ④ 댓글: "이 사안에 의견 남기기" 머리 활자 + "공론장에서 이어 보기 →" + OpinionComposer
//      + 맨 아래 "댓글 보기·남기기 →"(상세=댓글 화면) + 원문 2링크. 세로 스크롤 허용.
// 이동은 가로 스냅 스크롤(터치 스와이프)·키보드 ←→·좌우 40px 탭 영역·하단 "◂ 이전 · 다음 ▸".
//   하단 버튼은 첫/마지막 페이지에서 disabled 대신 aria-disabled — 포커스가 버튼에 남고 클릭·키만 무시.
// 보이지 않는 3개 페이지는 inert — 링크·폼이 탭 순서·접근성 트리에서 빠지고, 전환 뒤 포커스가
// 숨은 페이지에 남아 있으면 .cs-pages 로 옮긴다. 댓글 수는 낙관적 +1 뒤 서버 값(props)이 오면 정산.
// 상단 도트 4개: 현재 페이지 = 18px 잉크 막대, 나머지 6px 점. 전환은 찍힘(스냅뿐).
//
// 「옆으로 넘길 줄 모르는 독자」 안내 장치(40~60대):
//   · 표지 하단 큰 안내 "옆으로 넘기면 광역·기초 시선이 이어집니다 →"(17px 700)
//   · 우측 가장자리 24px 반투명 잉크 띠(› 글리프) — 마지막 페이지 전까지 상시
//   · 도트 옆 "1/4 · 옆으로 넘기기"
//   · 첫 진입 1.2초 뒤 24px 밀었다 돌아오는 넛지 1회(reduced-motion 시 생략)
//   한 번이라도 넘겨 본 사용자는 localStorage "zone2.story.swiped.v1" 로 기억 →
//   이후 문구·넛지 생략(띠·하단 버튼은 유지).
// 스타일: app/story.css(.cstory). 데이터는 전부 props 로 주입(fetch 없음).
// ============================================================================

import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CrossviewPairWithArticles, CardSlide } from "@/lib/matching";
import { cardSlidesOf, crossviewTitle } from "@/lib/reels/deck";
import { splitHeadline } from "@/components/crossview/text";
import { OpinionComposer } from "@/components/forum/opinion-composer";
import PairPhoto from "./pair-photo";
import { pairImageCandidates } from "@/lib/reels/pair-image";
import { MediaIcon } from "@/components/ui/media-icon";
import "@/app/story.css";
import { region } from "@/config/region";

/** 스토리가 읽는 최소 페어 형태 — 상세 페이지처럼 card_data 만 있는 곳도 마운트할 수 있게 */
export type StoryPair = Pick<CrossviewPairWithArticles, "id" | "cardData"> &
  Partial<Pick<CrossviewPairWithArticles, "cardHeadline" | "cardImageUrl" | "readingPoint" | "macro" | "micro">>;

export const STORY_PAGES = 4;
const PAGE_LABEL = [
  "표지",
  `${region.outlets.macro.tier} · ${region.outlets.macro.name}`,
  `${region.outlets.micro.tier} · ${region.outlets.micro.name}`,
  "의견 남기기",
] as const;

/** "한 번 넘겨 봤다" 기억 키 — 값 "1" */
const SWIPED_KEY = "zone2.story.swiped.v1";
/** 첫 진입 넛지: 대기 ms · 밀어 보는 거리 px · 되돌리기까지 ms */
const NUDGE_DELAY = 1200;
const NUDGE_PX = 24;
const NUDGE_BACK = 380;

/** localStorage 읽기 — 사생활 모드·차단 환경에서는 조용히 false */
function readSwiped(): boolean {
  try {
    return window.localStorage.getItem(SWIPED_KEY) === "1";
  } catch {
    return false;
  }
}
function writeSwiped(): void {
  try {
    window.localStorage.setItem(SWIPED_KEY, "1");
  } catch {
    /* 저장 실패는 무시 — 이번 세션 안에서는 state 로 기억한다 */
  }
}

/** 광역 ⋯ 도트 3개 / 기초 ▬ 괘선 토막 — 마커 색은 이 6px 도형에만 (장식) */
function Marker({ side }: { side: "macro" | "micro" }) {
  return side === "macro" ? (
    <span className="mk mk-macro" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  ) : (
    <span className="mk mk-micro" aria-hidden="true">
      <i />
    </span>
  );
}

/** slides 에서 종류별 컷을 뽑는다 — kind 가 비어 있는 구형 데이터는 자리(순서)로 폴백 */
function pickSlides(slides: CardSlide[]): {
  cover?: CardSlide;
  macro?: CardSlide;
  micro?: CardSlide;
  point?: CardSlide;
} {
  const byKind = (k: CardSlide["kind"]) => slides.find((s) => s?.kind === k);
  return {
    cover: byKind("cover") ?? slides[0],
    macro: byKind("macro") ?? slides[1],
    micro: byKind("micro") ?? slides[2],
    point: byKind("point") ?? slides[3],
  };
}

/** 이 페어가 4페이지 스토리로 그려질 수 있는가 (card_data.slides ≥ 3장) */
export function canStory(pair: StoryPair): boolean {
  return cardSlidesOf(pair as CrossviewPairWithArticles).length >= 3;
}

/** 키 이벤트가 입력 필드 안에서 났는가 — 작성기 안의 ←→ 는 페이지 이동에 쓰지 않는다 */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** 원문 본문에서 핵심 문장 n개 — 카드 요약과 겹치는 문장은 빼고, 너무 짧거나 긴 문장은 건너뛴다 */
function keySentences(body: string | null | undefined, exclude: string, n = 3): string[] {
  if (!body) return [];
  const text = body.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  const seen = new Set<string>();
  // lookbehind 정규식은 iOS 16.4 미만 사파리에서 파싱 오류(청크 전체가 죽는다) — 종결부호 뒤 공백을 표식으로 바꿔 나눈다
  for (const raw of text.replace(/([.!?。다])\s+/g, "$1\u0001").split("\u0001")) {
    const t = raw.trim().replace(/^[-–—•·]\s*/, "");
    if (t.length < 14 || t.length > 110) continue;
    // 유튜브 설명 상용구(제보 안내·URL·편성 시간·구독)는 기사 문장이 아니다
    if (/https?:\/\/|@|제보|구독|채널|\d{2}:\d{2}|^\*|^#/.test(t)) continue;
    const key = t.slice(0, 20);
    // 카드 요약이 이 문장을 그대로 담고 있을 때만 제외(요약은 보통 다시 쓴 문장이라 부분 일치로 빼면 다 사라진다)
    if (seen.has(key) || (exclude && exclude.includes(t))) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

/** 본문의 #해시태그(유튜브 설명) 또는 keywords — 최대 n개, 중복 제거 */
function tagsOf(article: { body?: string | null; keywords?: string[] | null } | null | undefined, n = 8): string[] {
  if (!article) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (t: string) => {
    const k = t.replace(/^#/, "").trim();
    if (k.length < 2 || k.length > 12 || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };
  for (const m of (article.body ?? "").matchAll(/#([^\s#]{2,12})/g)) push(m[1]);
  for (const k of article.keywords ?? []) push(k);
  return out.slice(0, n);
}

/** "9/22" — 렌더 안전한 문자열 파싱(로컬 타임존 무관) */
function shortMd(iso: string | null | undefined): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${Number(m[2])}/${Number(m[3])}` : null;
}

export default function CardStory({
  pair,
  height = "fill",
  detailHref,
  eagerCover = false,
  pages = 4,
  className = "",
  articleId,
  commentCount,
  forumHref,
}: {
  pair: StoryPair;
  /** "fill" = 홈 덱(슬라이드 가용 높이) / 숫자 = 고정 px(상세 420) */
  height?: "fill" | number;
  /** ④ 페이지의 "댓글 보기·남기기 →" 목적지(크로스뷰 상세 = 댓글 화면). 상세 페이지처럼 이미 그 자리면 생략 */
  detailHref?: string;
  className?: string;
  /** 표지 사진을 즉시 로드(상세 페이지용). 홈 덱은 슬라이드 40장이 동시에 마운트되므로 기본 lazy */
  eagerCover?: boolean;
  /** 3 = 표지·광역·기초만(상세 페이지: 댓글 타일이 따로 있어 ④ 댓글 페이지를 뺀다. 표지의 AI 요약은 유지) */
  pages?: 3 | 4;
  /** ④ 한 줄 작성기가 글을 연결할 기사 id. 생략하면 pair.micro → pair.macro 순으로 유도, 둘 다 없으면 작성기 생략 */
  articleId?: string | null;
  /** 이 사안에 달린 댓글 수 — 있으면 "이 사안 댓글 N개 · 공론장에서 이어 보기 →" */
  commentCount?: number;
  /** 공론장 링크. 생략하면 /forum#issue-<pairId>(공론장 사안 그룹 앵커) */
  forumHref?: string;
}) {
  const pageCount: number = pages;
  const full = pair as CrossviewPairWithArticles;
  const slides = cardSlidesOf(full);
  const { cover, macro, micro, point } = pickSlides(slides);

  // 헤드라인 — card_headline 두 줄 → 없으면 표지 컷 제목 → crossviewTitle
  const lines = splitHeadline(pair.cardHeadline);
  const fallbackHead = cover?.title || crossviewTitle(full);
  const summary = String(pair.readingPoint || point?.body || cover?.body || "").trim();
  const macroUrl = pair.macro?.url || null;
  const microUrl = pair.micro?.url || null;
  // 표지 사진 — 옥천신문 원본 → MBC 원본 → AI 카드 이미지 (회의 결정 [3]).
  // hasPhoto 는 "후보가 하나라도 있나" — 전부 로딩에 실패하면 PairPhoto 가 스스로 비운다.
  const photos = pairImageCandidates(pair);
  const hasPhoto = photos.length > 0;

  // 공론장 연결 — 기사 id 는 기초(옥천신문) 우선(상세 페이지 commentArticleId 와 같은 규칙)
  const composerArticleId =
    articleId === undefined ? (pair.micro?.id ?? pair.macro?.id ?? null) : articleId;
  const forumLink = forumHref ?? (pair.id ? `/forum#issue-${pair.id}` : "/forum");

  const pagesRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const statusId = useId();

  // 표지 활자 블록(.cs-cover-txt)이 실제로 넘칠 때만 키보드 스크롤 대상(tabIndex=0)으로 만든다.
  // 넘치지 않는 블록에 tabIndex 를 두면 탭 정지만 하나 늘어난다. 높이·내용 변화는 ResizeObserver 로 추적.
  const coverTxtRef = useRef<HTMLDivElement>(null);
  const [coverScrolls, setCoverScrolls] = useState(false);

  // 안내 상태 — null = 아직 localStorage 를 읽기 전(SSR·첫 페인트). true = 넘겨 본 사용자
  const [swiped, setSwiped] = useState<boolean | null>(null);
  const swipedRef = useRef(false);
  // 이 스토리 안에서 방금 올린 글 수 — "공론장에 올렸습니다 → 보러 가기" 안내용(정산해도 유지)
  const [posted, setPosted] = useState(0);
  // 댓글 수 낙관적 증가분 — OpinionComposer 가 router.refresh() 로 서버 commentCount 를 새로 가져오면
  // (props 변경) 0 으로 정산한다. 그러지 않으면 서버 N+1 에 다시 +1 이 붙어 N+2 로 보인다.
  const [pending, setPending] = useState(0);
  useEffect(() => {
    setPending(0);
  }, [commentCount]);

  useEffect(() => {
    const v = readSwiped();
    swipedRef.current = v;
    setSwiped(v);
  }, []);

  /** 한 번이라도 페이지를 넘겼다 — 문구·넛지 생략 상태로 */
  const markSwiped = useCallback(() => {
    if (swipedRef.current) return;
    swipedRef.current = true;
    setSwiped(true);
    writeSwiped();
  }, []);

  // pages 가 바뀌면(3↔4) 현재 페이지를 유효 범위로 보정
  useEffect(() => {
    setIdx((cur) => Math.min(cur, pageCount - 1));
  }, [pageCount]);

  /** n 페이지로 찍힘 이동(스무스 없음 — 전환은 스냅뿐) */
  const go = useCallback((n: number) => {
    const el = pagesRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(pageCount - 1, n));
    el.scrollTo({ left: next * el.clientWidth, behavior: "auto" });
    setIdx(next);
  }, [pageCount]);

  /** 스크롤 위치 → 현재 페이지(스와이프·스냅 결과 추적) */
  const onScroll = useCallback(() => {
    const el = pagesRef.current;
    if (!el || el.clientWidth === 0) return;
    const n = Math.max(0, Math.min(pageCount - 1, Math.round(el.scrollLeft / el.clientWidth)));
    setIdx((cur) => (cur === n ? cur : n));
  }, [pageCount]);

  // 표지를 벗어나면(스와이프·탭·키보드·버튼 어느 쪽이든) "넘겨 봤다"로 기억
  useEffect(() => {
    if (idx > 0) markSwiped();
  }, [idx, markSwiped]);

  // 첫 진입 넛지 — 1.2초 뒤 24px 밀었다 되돌린다(1회). 넘겨 본 사용자·reduced-motion 은 생략
  useEffect(() => {
    if (swiped !== false) return undefined;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }
    const el = pagesRef.current; // 정리 함수에서도 같은 노드를 쓰도록 여기서 잡아 둔다
    if (!el) return undefined;
    let back: number | undefined;
    let restore: number | undefined;
    const t = window.setTimeout(() => {
      if (swipedRef.current || el.scrollLeft > 0) return;
      // 스냅이 중간 위치를 거부하지 않도록 잠깐 끈다
      el.style.scrollSnapType = "none";
      el.scrollTo({ left: NUDGE_PX, behavior: "smooth" });
      back = window.setTimeout(() => {
        el.scrollTo({ left: 0, behavior: "smooth" });
        // 되돌아간 뒤 스냅 복원(인라인 값 제거 → CSS 규칙으로)
        restore = window.setTimeout(() => {
          el.style.scrollSnapType = "";
        }, NUDGE_BACK);
      }, NUDGE_BACK);
    }, NUDGE_DELAY);
    return () => {
      window.clearTimeout(t);
      if (back !== undefined) window.clearTimeout(back);
      if (restore !== undefined) window.clearTimeout(restore);
      el.style.scrollSnapType = "";
    };
  }, [swiped]);

  useEffect(() => {
    const el = coverTxtRef.current;
    if (!el) return undefined;
    const check = () => setCoverScrolls(el.scrollHeight > el.clientHeight + 1);
    check();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    // 자식(요약 문단) 높이 변화도 잡는다 — 블록 자체 크기는 그대로인데 내용만 길어질 수 있다
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [summary, swiped]); // swiped → show-hint 패딩(48px)이 바뀌면 다시 잰다

  // 회전·리사이즈 뒤 현재 페이지 좌측에 다시 맞춘다(스냅 어긋남 방지)
  // 옵저버는 마운트 때 한 번만 — idx 마다 다시 걸면 첫 콜백이 스와이프 도중 페이지를 튕긴다.
  const idxRef = useRef(idx);
  idxRef.current = idx;
  useEffect(() => {
    const el = pagesRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    let lastW = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === lastW) return; // 폭이 실제로 바뀐 경우에만
      lastW = el.clientWidth;
      el.scrollTo({ left: idxRef.current * el.clientWidth, behavior: "auto" });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 페이지 전환(◂이전·다음▸·스와이프·키보드) 뒤 포커스가 숨은(inert) 페이지에 남아 있으면
  // 스크롤 컨테이너로 옮긴다. inert 가 적용되기 전(페인트 전)에 처리해야 브라우저가 body 로 던지지 않는다.
  useLayoutEffect(() => {
    const el = pagesRef.current;
    if (!el) return;
    const active = document.activeElement;
    if (!active || active === el || !el.contains(active)) return;
    const cur = el.querySelector(`[data-page="${idx}"]`);
    if (cur && cur.contains(active)) return;
    el.focus({ preventScroll: true });
  }, [idx]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isEditable(e.target)) return; // 작성기 안에서는 커서 이동이 우선
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(idx + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(idx - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(pageCount - 1);
    }
  };

  const isFirst = idx === 0;
  const isLast = idx === pageCount - 1;
  const showHint = swiped === false; // 아직 넘겨 본 적 없는 사용자에게만 큰 문구
  const rootCls = [
    "cstory",
    height === "fill" ? "fill" : "",
    showHint ? "show-hint" : "",
    isLast ? "is-last" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const style = typeof height === "number" ? ({ height: `${height}px` } as React.CSSProperties) : undefined;
  const title = lines.length ? lines.join(", ") : fallbackHead;
  const totalComments = commentCount === undefined ? undefined : commentCount + pending;

  return (
    <div
      className={rootCls}
      style={style}
      role="group"
      aria-roledescription="카드 스토리"
      aria-label={`${title} — ${pageCount}페이지`}
      aria-describedby={statusId}
    >
      {/* 상단 도트 — 현재 페이지 = 18px 잉크 막대. 시각 표기이므로 장식 처리, 수치는 우측 활자 */}
      <div className="cs-dots">
        {Array.from({ length: pageCount }, (_, i) => (
          <span className={i === idx ? "cs-dot is-on" : "cs-dot"} key={i} aria-hidden="true" />
        ))}
        <span className="cs-dots-n" aria-hidden="true">
          {idx + 1}/{pageCount}
          {showHint ? " · 옆으로 넘기기" : ""}
        </span>
      </div>

      <div
        className="cs-pages"
        ref={pagesRef}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        aria-label="← → 로 페이지 이동"
      >
        {/* ① 표지 */}
        <section className="cs-page cs-cover" role="group" aria-label={`1/${pageCount} ${PAGE_LABEL[0]}`} data-page={0} inert={idx !== 0}>
          {hasPhoto ? (
            <PairPhoto
              candidates={photos}
              heightClass="cs-photo"
              eager={eagerCover}
              creditStyle={{ padding: "0 var(--cs-gutter)", flex: "0 0 auto" }}
            />
          ) : null}
          <div
            ref={coverTxtRef}
            className={hasPhoto ? "cs-cover-txt" : "cs-cover-txt no-photo"}
            /* 넘칠 때만 포커스 가능 + 이름 — 스크린리더가 "AI 요약, 스크롤" 그룹으로 읽는다 */
            tabIndex={coverScrolls ? 0 : undefined}
            role={coverScrolls ? "group" : undefined}
            aria-label={coverScrolls ? "AI 요약, 스크롤" : undefined}
          >
            {!hasPhoto && <hr className="cs-rule" />}
            {lines.length >= 2 ? (
              <h3 className="cs-head">
                <span className="cs-line macro">
                  <Marker side="macro" />
                  <span className="cs-text">
                    <span className="sr-only">{`${region.outlets.macro.tier} ${region.outlets.macro.name}: `}</span>
                    {lines[0]}
                  </span>
                </span>
                <span className="cs-line micro">
                  <Marker side="micro" />
                  <span className="cs-text">
                    <span className="sr-only">{`${region.outlets.micro.tier} ${region.outlets.micro.name}: `}</span>
                    {lines[1]}
                  </span>
                </span>
              </h3>
            ) : (
              <h3 className="cs-head">
                <span className="cs-line plain">
                  <span className="cs-text">{lines[0] || fallbackHead}</span>
                </span>
              </h3>
            )}
            {/* AI 요약 — 첫 장에서 바로 읽힌다. 인라인 분홍 스탬프가 AI 산출임을 밝힌다 */}
            {summary ? (
              <p className="cs-summary">
                <span className="cs-stamp">AI가 정리</span> {summary}
              </p>
            ) : null}
            {!hasPhoto && <hr className="cs-rule" />}
          </div>
          {/* 표지 하단 큰 안내 — 아직 한 번도 넘겨 보지 않은 사용자에게만 */}
          {showHint ? (
            <p className="cs-hint">
              옆으로 넘기면 광역·기초 시선이 이어집니다 <span aria-hidden="true">→</span>
            </p>
          ) : null}
        </section>

        {/* ② 광역 ⋯ */}
        <section className="cs-page cs-lens" role="group" aria-label={`2/${pageCount} ${PAGE_LABEL[1]}`} data-page={1} inert={idx !== 1}>
          <div className="cs-lens-in">
            <p className="cs-eyebrow">
              <Marker side="macro" />
              <MediaIcon kind="broadcast" className="cs-mi" />
              <span>{macro?.sourceLabel ? `광역 · ${macro.sourceLabel}` : PAGE_LABEL[1]}</span>
            </p>
            {macro?.title ? <h4 className="cs-title">{macro.title}</h4> : null}
            {macro?.body ? <p className="cs-body">{macro.body}</p> : null}
            <LensFill article={pair.macro} cardBody={macro?.body} />
          </div>
        </section>

        {/* ③ 기초 ▬ */}
        <section className="cs-page cs-lens" role="group" aria-label={`3/${pageCount} ${PAGE_LABEL[2]}`} data-page={2} inert={idx !== 2}>
          <div className="cs-lens-in">
            <p className="cs-eyebrow">
              <Marker side="micro" />
              <MediaIcon kind="paper" className="cs-mi" />
              <span>{micro?.sourceLabel ? `기초 · ${micro.sourceLabel}` : PAGE_LABEL[2]}</span>
            </p>
            {micro?.title ? <h4 className="cs-title">{micro.title}</h4> : null}
            {micro?.body ? <p className="cs-body">{micro.body}</p> : null}
            <LensFill article={pair.micro} cardBody={micro?.body} />
          </div>
        </section>

        {/* ④ 댓글 — 머리 활자 + 공론장 링크 + 작성기, 맨 아래 링크 행. 세로 스크롤 허용 */}
        {pageCount === 4 ? (
        <section className="cs-page cs-wrap" role="group" aria-label={`4/${pageCount} ${PAGE_LABEL[3]}`} data-page={3} inert={idx !== 3}>
          {/* 댓글 진입 — 머리 활자 + 공론장 링크를 작성기보다 먼저 보여 준다.
              기사 id 가 있을 때만 작성기(종이 톤). 검증·API 는 그대로 */}
          <div className="cs-talk">
            <p className="cs-talk-k">이 사안에 의견 남기기</p>
            <Link className="cs-forum" href={forumLink}>
              {totalComments !== undefined
                ? `이 사안 댓글 ${totalComments}개 · 공론장에서 이어 보기 →`
                : "공론장에서 이어 보기 →"}
            </Link>
            {composerArticleId ? (
              <>
                <OpinionComposer
                  variant="issue"
                  tone="paper"
                  articleId={composerArticleId}
                  onCreated={() => {
                    setPosted((n) => n + 1);
                    setPending((n) => n + 1);
                  }}
                />
                {posted > 0 ? (
                  <p className="cs-posted" role="status">
                    공론장에 올렸습니다 <span aria-hidden="true">→</span>{" "}
                    <Link href={forumLink}>보러 가기</Link>
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          {/* 링크 행은 맨 아래(margin-top:auto) — 상세 이동 + 원문 2링크 */}
          <nav className="cs-links" aria-label="크로스뷰 링크">
            {detailHref ? (
              <Link className="cs-more" href={detailHref}>
                댓글 보기·남기기 →
              </Link>
            ) : null}
            {(macroUrl || microUrl) && (
              <span className="cs-src">
                {macroUrl && (
                  <a href={macroUrl} target="_blank" rel="noopener noreferrer nofollow">
                    <Marker side="macro" />
                    광역 원문
                  </a>
                )}
                {microUrl && (
                  <a href={microUrl} target="_blank" rel="noopener noreferrer nofollow">
                    <Marker side="micro" />
                    기초 원문
                  </a>
                )}
              </span>
            )}
          </nav>
        </section>
        ) : null}
      </div>

      {/* 하단 진행 안내 — 스와이프를 모르는 사용자용 버튼. 모든 페이지에 44px 행.
          끝 페이지에서는 disabled 가 아니라 aria-disabled — disabled 로 바뀌면 포커스가 body 로
          떨어지므로, 버튼은 포커스 가능하게 두고 클릭(Enter/Space 포함)만 무시한다 */}
      <div className="cs-nav">
        <button
          type="button"
          className="cs-nav-btn"
          onClick={() => {
            if (isFirst) return;
            go(idx - 1);
          }}
          aria-disabled={isFirst ? "true" : undefined}
        >
          <span aria-hidden="true">◂ </span>이전
        </button>
        <span className="cs-nav-sep" aria-hidden="true">
          ·
        </span>
        <button
          type="button"
          className="cs-nav-btn"
          onClick={() => {
            if (isLast) return;
            go(idx + 1);
          }}
          aria-disabled={isLast ? "true" : undefined}
        >
          다음<span aria-hidden="true"> ▸</span>
        </button>
      </div>

      {/* 좌우 40px 탭 영역 — 포인터 전용(키보드는 ←→). 탭 순서·접근성 트리에서는 뺀다.
          마지막 페이지에서는 작성기 입력·등록 원을 가리지 않도록 숨긴다(하단 버튼으로 이동). */}
      <button
        type="button"
        className="cs-tap prev"
        tabIndex={-1}
        aria-hidden="true"
        hidden={isFirst || (pageCount === 4 && isLast)} /* ④ 작성기 보호는 4페이지 모드에서만 */
        onClick={() => go(idx - 1)}
      />
      <button
        type="button"
        className="cs-tap next"
        tabIndex={-1}
        aria-hidden="true"
        hidden={isLast}
        onClick={() => go(idx + 1)}
      />
      {/* 우측 반투명 잉크 띠 24px — "여기가 넘기는 방향" 상시 표시(마지막 페이지 제외). 누르면 다음 */}
      <button
        type="button"
        className="cs-band"
        tabIndex={-1}
        aria-hidden="true"
        hidden={isLast}
        onClick={() => go(idx + 1)}
      >
        ›
      </button>

      <span id={statusId} className="sr-only" role="status" aria-live="polite">
        {idx + 1}/{pageCount} {PAGE_LABEL[idx]}
      </span>
    </div>
  );
}

/** ②·③ 하단 채움 — 원문 핵심 문장(점선 구분) + 맨 아래 날짜·원문 보기. 본문이 없으면 링크만 */
function LensFill({
  article,
  cardBody,
}: {
  article: StoryPair["macro"] | undefined;
  cardBody: string | undefined;
}) {
  if (!article) return null;
  const lines = keySentences(article.body, cardBody ?? "", 4);
  // 문장이 없는 방송 원문(유튜브 설명)은 해시태그를 키워드 줄로 — 빈 아래쪽을 뜻 있는 것으로 채운다
  const tags = lines.length === 0 ? tagsOf(article) : [];
  const md = shortMd(article.publishedAt);
  return (
    <>
      {lines.length > 0 ? (
        <ul className="cs-keys" aria-label="원문 핵심 문장">
          {lines.map((t) => (
            <li key={t.slice(0, 24)}>
              {/* 줄 제한은 안쪽 span 에 — li 에 걸면 padding-bottom 영역으로 3번째 줄 윗부분이 비쳐 "잘린 글자"가 보인다(2026-10-26) */}
              <span className="cs-key-t">{t}</span>
            </li>
          ))}
        </ul>
      ) : tags.length > 0 ? (
        <p className="cs-tags" aria-label="관련 키워드">
          {tags.map((t) => (
            <span key={t}>#{t}</span>
          ))}
        </p>
      ) : null}
      <p className="cs-lens-foot">
        {md ? <time dateTime={article.publishedAt ?? undefined}>{md} 보도</time> : <span />}
        {article.url ? (
          <a href={article.url} target="_blank" rel="noopener noreferrer nofollow">
            원문 보기 <span aria-hidden="true">↗</span>
          </a>
        ) : null}
      </p>
    </>
  );
}
