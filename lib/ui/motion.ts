// ============================================================================
// lib/ui/motion — 모션 선호 헬퍼 (클라이언트 전용)
//
// prefers-reduced-motion: reduce 사용자에게는 JS 스크롤(scrollTo / scrollIntoView)의
// behavior "smooth" 를 "auto"(찍힘)로 낮춘다. globals.css 의 reduce 블록은 CSS
// scroll-behavior 만 정지시키고 ScrollOptions.behavior 에는 미치지 않아서 따로 필요하다.
// matchMedia 는 호출 시점(이벤트 핸들러 안)에 읽는다 — 렌더 중 window 접근 금지.
// ============================================================================

/** 모션 최소화 선호인가 — SSR·matchMedia 없는 환경은 false */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 스크롤 behavior — 모션 허용이면 "smooth", 최소화면 "auto" */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
