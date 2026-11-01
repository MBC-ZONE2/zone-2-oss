"use client";
// ============================================================================
// Cover — 홈 덱 0번 「표지」. 인트로 종료 프레임을 픽셀 단위로 물려받아 지면이 된다.
//
// 인트로(concept-video, 무변경)의 마지막 프레임 = 백색 바닥 + 좌상단 5문장
// (left 76/14 · y 138+60i·k · 40px×k 700 · ①~④ rgb145 α.48 · ⑤ rgb22 α.98).
// 이 컴포넌트는 인트로 오버레이 뒤에 미리 마운트돼 같은 프레임을 그려 두고(hold),
// brand-intro 의 "zone2:intro-done"(detail.mode) 을 받아 3상태로 갈라진다.
//
//   play  (자동 완료)  0~900ms 백색이 clip-path circle 로 #fn-play 원으로 수렴(150%→28px)
//                     300~900ms 문장 ①~④ 접힘, ⑤는 y=138 자리의 제호로 굳음
//                     880ms 백색원 글로우 · 900ms 날짜·판·인덱스 띠·첫 크로스뷰 히어로·잉크 점 "찍힘"
//                     1200ms 하단 괘선 아래 넘김 힌트 + 첫 방문 범례
//   quick (건너뛰기)  백색 수렴 450ms 만. 문장 접힘 생략, 지면은 즉시
//   none  (오늘 하루 안보기 · 처음부터 생략 · reduced-motion) 완성 상태 즉시 + 글로우 1회
//
// 네비 탭을 누르면 연출을 끊고 완성 상태로 점프한다. 표지 문장은 aria-hidden,
// 인덱스 띠(40쌍 · 온도 · 8분)는 실제 텍스트(링크)다. 로딩 스켈레톤·시머·등장 페이드 없음 —
// 인쇄물은 움직이지 않는다. 스타일: app/cover.css
//
// 검토의견(홈 1) 반영: "네비게이션보다 콘텐츠가 먼저" — 숫자 3행을 마스트 아래 한 줄 띠로
// 내리고, 그 자리에 오늘 첫 크로스뷰(점묘 사진 + ⋯/▬ 두 줄 헤드라인 + AI 요약 한 문장)를
// 콘텐츠로 올린다. 데이터는 data.crossview[0](app/page.tsx 가 넘긴 실 조회 결과)이다.
// ============================================================================
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  crossviewTitle,
  KIND_LABEL,
  type DeckSlide,
  type ReelsData,
} from "@/lib/reels/deck";
import { splitHeadline, firstSentence } from "@/components/reels/slides";
import PairPhoto from "@/components/reels/pair-photo";
import { pairImageCandidates } from "@/lib/reels/pair-image";
import { MediaIcon } from "@/components/ui/media-icon";
import {
  INTRO_DONE_EVENT,
  isHiddenToday,
  type HandoffMode,
} from "@/components/reels/brand-intro";
import { FunderCredit } from "@/components/ui/funder-credit";
import "@/app/cover.css";
import { region } from "@/config/region";

/** 표지 연출 단계 — 덱(잉크 점 표시 시점)과 CSS([data-phase]) 가 함께 읽는다 */
export type CoverPhase = "hold" | "play" | "print" | "quick" | "done";

export interface CoverProps {
  data: ReelsData;
  /** 표지 다음 슬라이드(deck[1]) — 하단 "다음" 안내의 폴백 라벨 */
  first?: DeckSlide;
  /** 단계 변화 통지(덱이 잉크 점을 900ms 에 찍기 위해 쓴다) */
  onPhase?: (phase: CoverPhase) => void;
}

// ── 인트로 종료 프레임 상수 (IdeaConceptVideo.jsx drawStatements 의 읽기 전용 사본) ──
const STATEMENTS = [
  `${region.outlets.macro.name}과 ${region.outlets.micro.name}이 AI를 만나`,
  "지역을 다시 한번 새롭게",
  "뉴스의 가능성을 더 크게",
  "뉴스 이후를 연결하는",
  "새로운 공론장이 펼쳐지도록",
] as const;
/** 인트로 캔버스와 동일한 폰트 스택 — 글리프가 같아야 이음매가 없다 */
const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const CANVAS_H = 720; // 캔버스 논리 높이(고정). 논리 폭은 창 비율을 따른다
const MIN_AR = 0.45;
const MAX_AR = 2.4;
const K_MIN = 0.62; // 최소 글자 배율 (40px × 0.62 ≈ 25px)
const BULB_R = 54;
/** 문장 한 줄의 CSS px 좌표 (baseline 기준) */
interface StmtLine {
  x: number;
  y: number;
  fontSize: number;
  scaleX: number;
}
interface IntroFrame {
  lines: StmtLine[];
  /**
   * line-height:1 인 span 에서 alphabetic baseline 이 상단으로부터 놓이는 비율.
   * CSS 인라인 박스는 (line-height − (ascent+descent))/2 의 half-leading 을 위아래에
   * 두므로 baseline = fs/2 + (ascent − descent)/2 → 비율 = 0.5 + (a − d)/2.
   * 폰트 메트릭을 못 읽으면 Pretendard 근사값 0.88 을 쓴다.
   */
  baselineRatio: number;
}

/**
 * 인트로 drawStatements 의 배치를 그대로 재계산한다.
 * 캔버스는 높이 720 논리px, 폭 = 720×비율(0.45~2.4 클램프) 이고 object-fit: cover 로
 * 뷰포트를 채운다 → CSS px = 논리px × s (s = 뷰포트 높이 / 720, 극단 비율은 cover 규칙).
 */
function layoutIntroFrame(
  vw: number,
  vh: number,
  measure: ((text: string) => number) | null,
  baselineRatio: number,
): IntroFrame {
  const realAR = vw / Math.max(1, vh);
  const ar = Math.min(MAX_AR, Math.max(MIN_AR, realAR));
  const W = Math.round(CANVAS_H * ar);
  const cropX = realAR < ar ? Math.round((W - CANVAS_H * realAR) / 2) : 0;
  const rightM = Math.round(Math.min(240, Math.max(150, W * 0.19)));
  const thermoX = Math.round((W - rightM) / 10) * 10;
  const discScale = Math.max(0.6, Math.min(1, W / 900));
  // 가장 긴 문장 폭(700 40px). 측정 불가 시 한글 17자 근사(≈ 570px)
  const wmax = measure ? Math.max(...STATEMENTS.map((s) => measure(s))) : 570;

  let left = 76 + cropX;
  let availW = thermoX - BULB_R * discScale - 40 - left;
  let k = Math.min(1, availW / wmax);
  let sx = 1;
  if (k < K_MIN) {
    k = K_MIN;
    left = 14 + cropX;
    availW = W - cropX - 14 - left;
    const fit = availW / (wmax * k);
    if (fit < 1) {
      sx = Math.max(fit, 0.95);
      k = Math.max(0.4, k * (fit / sx));
    }
  }
  const fontPx = Math.round(40 * k);

  // 논리 → CSS px (cover: 큰 쪽 배율, 남는 쪽은 중앙 정렬로 잘림)
  const s = Math.max(vw / W, vh / CANVAS_H);
  const ox = (vw - W * s) / 2;
  const oy = (vh - CANVAS_H * s) / 2;
  const lines = STATEMENTS.map((_, i) => ({
    x: ox + left * s,
    y: oy + (138 + i * 60 * k) * s,
    fontSize: fontPx * s,
    scaleX: sx,
  }));
  return { lines, baselineRatio };
}

/** 캔버스 measureText 기반 측정기 — 인트로와 같은 방식으로 문장 폭·폰트 메트릭을 읽는다 */
function makeMeasurer(): { width: (t: string) => number; baselineRatio: number } | null {
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return null;
    ctx.font = `700 40px ${FONT}`;
    const m = ctx.measureText(STATEMENTS[4]);
    const a = m.fontBoundingBoxAscent;
    const d = m.fontBoundingBoxDescent;
    const ratio =
      Number.isFinite(a) && Number.isFinite(d) && a > 0 ? 0.5 + (a - d) / (2 * 40) : 0.88;
    return { width: (t) => ctx.measureText(t).width, baselineRatio: ratio };
  } catch {
    return null;
  }
}

/** 오늘 날짜 — 표시용 "YYYY. MM. DD 요일" + <time dateTime> 용 로컬 ISO 날짜 */
function today(): { label: string; iso: string } {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const day = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][d.getDay()];
  const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return { label: `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())} ${day}`, iso };
}

const GUIDE_KEY = "zone2.cover.guide.v1";
const GLOW_EVENT = "zone2:fn-glow";
/** 인트로가 이벤트를 끝내 보내지 못했을 때(스크립트 실패 등) 지면을 여는 안전 시한 */
const SAFETY_MS = 120_000;

export default function Cover({ data, first, onPhase }: CoverProps) {
  // SSR 과 첫 클라 렌더는 완성 상태(하이드레이션 일치). 인트로가 예정돼 있으면
  // 레이아웃 이펙트에서 페인트 전에 hold 로 바꾼다.
  const [phase, setPhase] = useState<CoverPhase>("done");
  const [frame, setFrame] = useState<IntroFrame | null>(null);
  const [circle, setCircle] = useState<{ fx: number; fy: number; r0: number } | null>(null);
  const [mastTarget, setMastTarget] = useState<{
    left: number;
    top: number;
    fontSize: number;
    color: string;
  } | null>(null);
  const [date, setDate] = useState<{ label: string; iso: string }>({ label: "", iso: "" });
  // 날짜는 어느 경로(play/quick/none)든 마운트 직후 확정한다(하이드레이션 불일치 방지용 클라이언트 계산).
  useEffect(() => {
    setDate(today());
  }, []);
  const [guide, setGuide] = useState(false);

  const mastRef = useRef<HTMLHeadingElement>(null);
  const timersRef = useRef<number[]>([]);
  const phaseRef = useRef<CoverPhase>("done");
  const pointerRef = useRef<((e: PointerEvent) => void) | null>(null);
  phaseRef.current = phase;

  useEffect(() => {
    onPhase?.(phase);
  }, [phase, onPhase]);

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  }, []);
  const after = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  /** 연출 종료 → 완성 상태. 네비 탭·타임라인 끝·안전 시한 공용 */
  const finish = useCallback(() => {
    clearTimers();
    if (pointerRef.current) {
      document.removeEventListener("pointerdown", pointerRef.current, true);
      pointerRef.current = null;
    }
    setPhase("done");
  }, [clearTimers]);

  /** 핸드오프 시작. fromIntro=false 면(처음부터 생략) 글로우를 표지가 직접 요청한다 */
  const start = useCallback(
    (mode: HandoffMode, fromIntro: boolean) => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (mode === "none" || reduced) {
        finish();
        if (!fromIntro) {
          // 인트로 없이 열린 지면 — 백색원은 이미 ▶에 앉아 있고 글로우만 1회
          window.setTimeout(() => window.dispatchEvent(new CustomEvent(GLOW_EVENT)), 0);
        }
        return;
      }

      // (a) 수렴 원점 = #fn-play 백색원 중심(실측). 없으면 하단 바 위 돌출 원의 기하로 근사
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let fx = vw / 2;
      let fy = vh - 64 + 14;
      const play = document.getElementById("fn-play");
      const r = play?.getBoundingClientRect();
      if (r && r.width > 0) {
        fx = r.left + r.width / 2;
        fy = r.top + r.height / 2;
      }
      // 시작 반지름 = 원점에서 가장 먼 모서리까지(뷰포트 전체를 덮는 150% 상당)
      const r0 = Math.hypot(Math.max(fx, vw - fx), Math.max(fy, vh - fy)) + 8;
      setCircle({ fx, fy, r0 });

      // (c) ⑤ 문장이 굳을 자리 = 지면의 제호(같은 폰트·line-height 1 → 좌상단 일치)
      const mast = mastRef.current;
      if (mast) {
        const mr = mast.getBoundingClientRect();
        const cs = getComputedStyle(mast);
        setMastTarget({
          left: mr.left,
          top: mr.top,
          fontSize: parseFloat(cs.fontSize) || 25,
          color: cs.color || "#1c2130",
        });
      }

      // 네비 탭을 누르면 비행 즉시 종료
      const onPointer = (e: PointerEvent) => {
        const el = e.target as Element | null;
        if (el?.closest?.(".float-nav")) finish();
      };
      pointerRef.current = onPointer;
      document.addEventListener("pointerdown", onPointer, true);

      if (mode === "play") {
        setPhase("play");
        after(880, () => window.dispatchEvent(new CustomEvent(GLOW_EVENT))); // (b)
        after(900, () => setPhase("print")); // (d)
        after(1200, finish); // (e)
      } else {
        setPhase("quick");
        after(430, () => window.dispatchEvent(new CustomEvent(GLOW_EVENT)));
        after(450, finish);
      }
    },
    [after, finish],
  );

  // 초기 분기 — 인트로가 재생될 조건(brand-intro 와 동일)이면 hold, 아니면 none.
  useLayoutEffect(() => {
    let expected = false;
    try {
      // brand-intro 와 같은 조건 — 설정으로 인트로를 끈 배포(공개 리포)는 기다리지 않는다
      expected =
        region.site.intro && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !isHiddenToday();
    } catch {
      expected = false;
    }
    if (!expected) {
      start("none", false);
      return undefined;
    }
    setPhase("hold");
    const onDone = (e: Event) => {
      const mode = ((e as CustomEvent<{ mode?: HandoffMode }>).detail?.mode ??
        "play") as HandoffMode;
      start(mode, true);
    };
    window.addEventListener(INTRO_DONE_EVENT, onDone);
    const safety = window.setTimeout(() => {
      if (phaseRef.current === "hold") start("none", false);
    }, SAFETY_MS);
    return () => {
      window.removeEventListener(INTRO_DONE_EVENT, onDone);
      window.clearTimeout(safety);
    };
    // start 는 안정 콜백(useCallback) — 마운트 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // hold 동안 인트로 종료 프레임 좌표를 계산(폰트 로드 후 재계산, 리사이즈 추종)
  useEffect(() => {
    if (phase !== "hold") return undefined;
    let alive = true;
    const compute = () => {
      if (!alive) return;
      const m = makeMeasurer();
      setFrame(
        layoutIntroFrame(
          window.innerWidth,
          window.innerHeight,
          m ? m.width : null,
          m ? m.baselineRatio : 0.88,
        ),
      );
    };
    compute();
    try {
      document.fonts?.load(`700 40px ${FONT}`).then(compute, () => undefined);
      document.fonts?.ready.then(compute, () => undefined);
    } catch {
      /* noop */
    }
    window.addEventListener("resize", compute);
    return () => {
      alive = false;
      window.removeEventListener("resize", compute);
    };
  }, [phase]);

  // 날짜는 클라 타임존으로 찍는다(서버 시각과의 하이드레이션 불일치 방지)
  useEffect(() => {
    setDate(today());
    try {
      setGuide(window.localStorage.getItem(GUIDE_KEY) !== "1");
    } catch {
      setGuide(false);
    }
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const closeGuide = () => {
    setGuide(false);
    try {
      window.localStorage.setItem(GUIDE_KEY, "1");
    } catch {
      /* noop */
    }
  };

  // 오늘 첫 크로스뷰(히어로) — 두 줄 헤드라인(쉼표 분해) + AI 요약 한 문장(읽는 점 → 기초 → 광역 순)
  const firstCv = data.crossview[0];
  const heroLines = firstCv ? splitHeadline(firstCv.cardHeadline) : [];
  // 히어로 사진 — 옥천신문 원본 → MBC 원본 → AI 카드 이미지 (회의 결정 [3]).
  // 후보 목록을 그대로 넘겨 원본이 403/404 로 깨지면 PairPhoto 가 다음 후보로 내려간다.
  const heroPhotos = pairImageCandidates(firstCv);
  const heroSummary = firstCv
    ? firstSentence(firstCv.readingPoint) ||
      firstSentence(firstCv.summaryMicro) ||
      firstSentence(firstCv.summaryMacro)
    : "";
  const showLayers = phase === "hold" || phase === "play" || phase === "quick";
  const showStmts = phase === "hold" || phase === "play";
  const fallbackFrame: IntroFrame = {
    lines: STATEMENTS.map((_, i) => ({ x: 14, y: 138 + i * 60 * K_MIN, fontSize: 25, scaleX: 1 })),
    baselineRatio: 0.88,
  };
  const f = frame ?? fallbackFrame;

  return (
    <div className="cover" data-phase={phase}>
      {/* 백색 레이어 — hold 에서 뷰포트 전체, play/quick 에서 #fn-play 로 수렴 */}
      {showLayers && (
        <div
          className="cover-white"
          aria-hidden="true"
          style={
            circle
              ? ({
                  "--fx": `${circle.fx}px`,
                  "--fy": `${circle.fy}px`,
                  "--r0": `${circle.r0}px`,
                } as CSSProperties)
              : undefined
          }
        />
      )}

      {/* 인트로 5문장 — 캔버스 좌표 그대로. 장식이므로 aria-hidden */}
      {showStmts && (
        <div className="cover-stmts" aria-hidden="true">
          {STATEMENTS.map((text, i) => {
            const ln = f.lines[i];
            const last = i === STATEMENTS.length - 1;
            const folding = phase === "play" && !last;
            const hardening = phase === "play" && last && mastTarget;
            const style: CSSProperties = hardening
              ? {
                  left: mastTarget.left,
                  top: mastTarget.top,
                  fontSize: mastTarget.fontSize,
                  color: mastTarget.color,
                  opacity: 1,
                  transform: "scaleX(1)",
                }
              : {
                  left: ln.x,
                  // 캔버스 alphabetic baseline y → line-height 1 span 의 top
                  top: ln.y - ln.fontSize * f.baselineRatio,
                  fontSize: ln.fontSize,
                  color: last ? "rgb(22,22,22)" : "rgb(145,145,145)",
                  opacity: folding ? 0 : last ? 0.98 : 0.48,
                  transform: folding ? `scaleX(${ln.scaleX}) scaleY(0)` : `scaleX(${ln.scaleX})`,
                };
            return (
              <span key={text} className={last ? "cover-stmt is-last" : "cover-stmt"} style={style}>
                {text}
              </span>
            );
          })}
        </div>
      )}

      {/* ── 지면 본문 — 0ms 로 "찍힌다" ─────────────────────────────── */}
      <div className="cover-body">
        <h1 className="cover-mast" ref={mastRef}>
          {STATEMENTS[4]}
        </h1>
        <p className="cover-date">
          <time dateTime={date.iso || undefined}>{date.label}</time>
          <span className="cover-edition">오늘 첫 판</span>
        </p>

        {/* 인덱스 띠(크로스뷰 N쌍 · 온도계 뜨거움 N° · 오늘의 충북 N분)는 뺐다 — "콘텐츠 개수 브리핑 제거"(2026-10-19 피드백).
            표지는 날짜·판 → 오늘 첫 크로스뷰로 바로 이어진다. 각 코너는 하단 내비로 간다. */}

        {/* 오늘 첫 크로스뷰 — 콘텐츠가 먼저. 사진(점묘, eager) → 두 줄 헤드라인(같은 굵기) → AI 요약 */}
        {firstCv ? (
          <>
            {heroPhotos.length > 0 && (
              <PairPhoto
                candidates={heroPhotos}
                eager
                heightClass="cover-hero-h"
                className="cover-hero-img"
              />
            )}
            <p className="cover-hero-k">
              오늘 첫 크로스뷰
              <span className="cover-hero-src">
                <MediaIcon kind="broadcast" className="media-ic" />
                {region.outlets.macro.name}
                <span className="src-sep" aria-hidden="true">·</span>
                <MediaIcon kind="paper" className="media-ic" />
                {region.outlets.micro.name}
              </span>
            </p>
            <h2 className="cover-hero-head">
              <Link href={`/crossview/${firstCv.id}`} className="cover-hero-link">
                {heroLines.length >= 2 ? (
                  <>
                    <span className="cover-hero-line">
                      <span className="mk mk-macro" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="cover-hero-text">
                        <span className="sr">{`${region.outlets.macro.tier} ${region.outlets.macro.name}: `}</span>
                        {heroLines[0]}
                      </span>
                    </span>
                    <span className="cover-hero-line">
                      <span className="mk mk-micro" aria-hidden="true">
                        <i />
                      </span>
                      <span className="cover-hero-text">
                        <span className="sr">{`${region.outlets.micro.tier} ${region.outlets.micro.name}: `}</span>
                        {heroLines[1]}
                      </span>
                    </span>
                  </>
                ) : (
                  <span className="cover-hero-line plain">
                    <span className="cover-hero-text">{heroLines[0] || crossviewTitle(firstCv)}</span>
                  </span>
                )}
              </Link>
            </h2>
            {heroSummary && <p className="cover-hero-sum">{heroSummary}</p>}
          </>
        ) : (
          <p className="cover-hero-k">다음 · {first ? KIND_LABEL[first.kind] : "소식"}</p>
        )}
      </div>

      {/* ── 하단 — 괘선 아래 넘김 힌트 + 첫 방문 범례 (1200ms). 첫 크로스뷰는 위 히어로로 흡수 ── */}
      <div className="cover-foot">
        <p className="cover-hint" aria-hidden="true">
          아래로 넘기면 <span className="arr">↓</span>
        </p>
        <FunderCredit className="cover-funder" />
        {guide && (
          <p className="cover-guide">
            <span className="cover-guide-m macro" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              <MediaIcon kind="broadcast" className="media-ic" />
              방송 · {region.outlets.macro.name}
            </span>
            <span className="cover-guide-m micro" aria-hidden="true" />
            <span>
              <MediaIcon kind="paper" className="media-ic" />
              지면 · {region.outlets.micro.name}
            </span>
            <button type="button" className="cover-guide-x" onClick={closeGuide} aria-label="안내 닫기">
              ×
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
