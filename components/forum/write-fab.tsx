"use client";

// ============================================================================
// components/forum/write-fab — 모바일 '글쓰기' 고정 버튼 (잉크 직사각형 52px, 네비 위 88px)
//
// 탭하면 #post-form 으로 스크롤하고 제목 입력에 포커스를 준다. 링크(href=#post-form)
// 라 JS 없이도 동작한다. 데스크탑(≥1100px)은 CSS 로 숨긴다.
// 시범단 #180: 원형 '쓰기' → '올리기'(.opc-submit)와 같은 검정 직사각형 '글쓰기'.
// ============================================================================

export function WriteFab() {
  function jump(e: React.MouseEvent<HTMLAnchorElement>) {
    const form = document.getElementById("post-form");
    if (!form) return; // 기본 앵커 동작
    e.preventDefault();
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    form.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    const title = document.getElementById("forum-title") as HTMLInputElement | null;
    // 스크롤이 끝난 뒤 포커스(스크롤 점프 방지)
    window.setTimeout(() => title?.focus({ preventScroll: true }), reduce ? 0 : 350);
  }
  return (
    <a href="#post-form" className="fo-fab" aria-label="글쓰기" onClick={jump}>
      글쓰기
    </a>
  );
}
