"use client";

// ============================================================================
// components/ui/sonner — 토스트 (sonner 기반, F1 토큰 매핑)
//
// 접수/오류/삭제 안내 등 F6 신규 UI 의 토스트에 사용한다.
// 색은 CSS 변수(surface/foreground/line)로 매핑해 라이트·고대비 모두 대응.
// ============================================================================

import { Toaster as SonnerToaster } from "sonner";

/** 앱 전역 토스트 컨테이너 (루트 레이아웃에 1회 마운트) */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      toastOptions={{
        style: {
          background: "var(--surface)",
          color: "var(--foreground)",
          border: "1px solid var(--line)",
        },
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--line)",
        } as React.CSSProperties
      }
    />
  );
}

export { toast } from "sonner";
