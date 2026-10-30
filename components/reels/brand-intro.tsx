"use client";
// ============================================================================
// BrandIntro — 홈 진입 시 ZONE-2 컨셉 영상(디자인팀 제작) 한 사이클을 재생한다.
//
// 컨셉 영상은 이 인트로 레이어에서만 마운트한다. 사용자가 건너뛰거나
// "오늘 하루 안보기"를 선택할 수 있고, 한 사이클이 끝나면 자동으로 홈을 연다.
// prefers-reduced-motion 사용자는 기존 정책대로 인트로를 생략한다.
// ============================================================================
import dynamic from "next/dynamic";
import { region } from "@/config/region";
import { useCallback, useEffect, useRef, useState } from "react";

const ConceptVideo = dynamic(() => import("./concept-video/IdeaConceptVideo"), {
  ssr: false,
  // 청크가 오기 전 잠깐 — 글자 대신 인트로와 같은 검은 화면에 백색점 하나가 숨 쉰다(스크린리더에는 상태만)
  loading: () => (
    <div className="concept-overlay-loading" role="status" aria-label="인트로 준비 중">
      <span className="concept-overlay-dot" aria-hidden="true" />
    </div>
  ),
});

// "오늘 하루 안보기"를 누른 날짜(local YYYY-MM-DD)를 저장한다. 이 값이 오늘과
// 같은 동안에만 인트로를 생략하고, 그 외에는 매 방문마다 재생한다.
export const HIDE_TODAY_KEY = "zone2.intro.hideDate.v1";

/**
 * 인트로 → 홈 표지 핸드오프 모드. close() 가 언마운트 직전에 html[data-handoff] 로
 * 기록하고 window "zone2:intro-done" 이벤트(detail.mode)로 알린다.
 *   play  = 한 사이클 자동 완료 → 표지가 1.2초 전체 타임라인 재생
 *   quick = 건너뛰기(Escape 포함) → 백색 수렴 450ms 만
 *   none  = 오늘 하루 안보기 · 처음부터 생략(오늘 숨김·reduced-motion) → 완성 상태 즉시
 */
export type HandoffMode = "play" | "quick" | "none";
export const INTRO_DONE_EVENT = "zone2:intro-done";

function markHandoff(mode: HandoffMode) {
  document.documentElement.setAttribute("data-handoff", mode);
}

/** 로컬 타임존 기준 오늘 날짜 문자열(YYYY-MM-DD). */
export function localDateStr(): string {
  return new Date().toLocaleDateString("en-CA");
}

/** "오늘 하루 안보기"가 오늘에 대해 활성인지 확인한다. */
export function isHiddenToday(): boolean {
  try {
    return window.localStorage.getItem(HIDE_TODAY_KEY) === localDateStr();
  } catch {
    return false;
  }
}

export default function BrandIntro() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const skipRef = useRef<HTMLButtonElement>(null);

  // 인트로를 닫는다. 플래그는 저장하지 않아 다음 방문에는 다시 재생한다.
  // 450ms 페이드 뒤 언마운트 직전에 핸드오프 모드를 기록·통지한다(표지가 이어받음).
  const close = useCallback((mode: HandoffMode = "play") => {
    if (closingRef.current) return;
    closingRef.current = true;
    setLeaving(true);
    document.documentElement.removeAttribute("data-intro-pending");
    closeTimerRef.current = window.setTimeout(() => {
      markHandoff(mode);
      window.dispatchEvent(new CustomEvent(INTRO_DONE_EVENT, { detail: { mode } }));
      setShow(false);
    }, 450);
  }, []);

  // 오늘 날짜를 저장해 당일만 인트로를 생략한다.
  const hideToday = useCallback(() => {
    try {
      window.localStorage.setItem(HIDE_TODAY_KEY, localDateStr());
    } catch {
      /* noop */
    }
    close("none");
  }, [close]);

  // 오늘 하루 숨김 또는 모션 최소화가 아니면 모든 화면에서 인트로를 재생한다.
  useEffect(() => {
    const clearCover = () =>
      document.documentElement.removeAttribute("data-intro-pending");

    try {
      // 설정으로 끈 경우(공개 리포는 컨셉 영상 코드가 없어 intro=false) · 오늘 숨김 · reduced-motion → 생략
      if (!region.site.intro || isHiddenToday() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        clearCover();
        markHandoff("none"); // 인트로 없음 → 표지는 완성 상태로 시작
        return;
      }
      setShow(true);
    } catch {
      clearCover();
      markHandoff("none");
    }
  }, []);

  // 재생 중에는 배경 스크롤을 잠그고 Escape로 건너뛸 수 있게 한다.
  useEffect(() => {
    if (!show) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => skipRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close("quick");
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [show, close]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  if (!show) return null;

  return (
    <div
      className={`zone-intro concept-overlay${leaving ? " is-leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="ZONE-2 컨셉 영상 인트로"
    >
      <ConceptVideo playing onComplete={() => close("play")} />
      <div className="zi-top-actions">
        <button type="button" className="zi-hide-today" onClick={hideToday}>
          오늘 하루 안보기
        </button>
        <button ref={skipRef} type="button" className="zi-skip" onClick={() => close("quick")}>
          건너뛰기
        </button>
      </div>
    </div>
  );
}
