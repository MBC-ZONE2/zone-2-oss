"use client";

// ============================================================================
// components/a11y/display-settings — 화면 표시 설정 (큰글씨 · 고대비)
//
// 접근성 1급 요건(고령 이용자 대응). localStorage 에 영구 저장하고
// document.documentElement 에 data 속성으로 반영한다.
//   - zone2-font-size: "normal" | "large" → html[data-font-size]
//   - zone2-contrast : "normal" | "high"  → html[data-contrast]
//
// FOUC/hydration 불일치는 app/layout.tsx head 의 인라인 스크립트가
// 하이드레이션 이전에 저장값을 선반영하여 방지한다. 이 훅은 마운트 시
// DOM(=스크립트가 이미 적용한 값)을 읽어 UI 상태와 동기화한다.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const FONT_KEY = "zone2-font-size";
const CONTRAST_KEY = "zone2-contrast";

/** 현재 html 요소에 특정 data 속성이 켜져 있는지 확인 */
function isAttrOn(name: string, onValue: string): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute(name) === onValue;
}

/** localStorage 안전 기록 (프라이빗 모드/차단 대비) */
function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장 실패는 무시 — 세션 내 동작은 유지된다.
  }
}

/** 큰글씨/고대비 상태 + 토글 핸들러 훅 */
export function useDisplaySettings() {
  const [large, setLarge] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  // 마운트 시 인라인 스크립트가 적용한 DOM 상태로 동기화
  useEffect(() => {
    setLarge(isAttrOn("data-font-size", "large"));
    setHighContrast(isAttrOn("data-contrast", "high"));
  }, []);

  const toggleLarge = useCallback(() => {
    setLarge((prev) => {
      const next = !prev;
      const value = next ? "large" : "normal";
      document.documentElement.setAttribute("data-font-size", value);
      persist(FONT_KEY, value);
      return next;
    });
  }, []);

  const toggleContrast = useCallback(() => {
    setHighContrast((prev) => {
      const next = !prev;
      const value = next ? "high" : "normal";
      document.documentElement.setAttribute("data-contrast", value);
      persist(CONTRAST_KEY, value);
      return next;
    });
  }, []);

  return { large, highContrast, toggleLarge, toggleContrast };
}

/** 토글 버튼 공통 스타일 — 터치타깃 ≥44×44px */
const TOGGLE_BASE = cn(
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2.5",
  "text-sm font-semibold transition-colors",
  "hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
);

/** 큰글씨 토글 버튼 (레이블 "가") */
function FontSizeToggle({
  pressed,
  onToggle,
}: {
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={pressed ? "큰 글씨 모드 끄기" : "큰 글씨 모드 켜기"}
      onClick={onToggle}
      className={cn(
        TOGGLE_BASE,
        pressed
          ? "bg-action text-brand-foreground hover:bg-action-hover"
          : "text-foreground",
      )}
    >
      <span aria-hidden className="text-body leading-none">
        가
      </span>
      <span aria-hidden className="text-xs leading-none">
        +
      </span>
    </button>
  );
}

/** 고대비 토글 버튼 (반원 대비 아이콘) */
function ContrastToggle({
  pressed,
  onToggle,
}: {
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={pressed ? "고대비 모드 끄기" : "고대비 모드 켜기"}
      onClick={onToggle}
      className={cn(
        TOGGLE_BASE,
        pressed
          ? "bg-action text-brand-foreground hover:bg-action-hover"
          : "text-foreground",
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18a9 9 0 0 0 0-18Z" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}

/** 헤더용 표시 설정 묶음 (큰글씨 + 고대비) */
export function DisplaySettings({ className }: { className?: string }) {
  const { large, highContrast, toggleLarge, toggleContrast } =
    useDisplaySettings();

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      role="group"
      aria-label="화면 표시 설정"
    >
      <FontSizeToggle pressed={large} onToggle={toggleLarge} />
      <ContrastToggle pressed={highContrast} onToggle={toggleContrast} />
    </div>
  );
}
