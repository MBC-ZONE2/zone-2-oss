// ============================================================================
// components/shell/app-header — 상단 앱 헤더 (마스트헤드)
//
// 「일점 지면」: 종이(불투명, 유리 없음) 위 제호 "ZONE-2" 25px 700 잉크 + 슬로건
// 15px 보조 잉크 한 줄. 하단은 1px 괘선. 우측은 화면 표시 설정(큰글씨·고대비).
// 제호/슬로건은 고정 크기라 큰글씨 모드에서도 헤더 높이(56px)가 흔들리지 않아
// sticky 오프셋(3.5rem)을 그대로 유지한다. 모든 터치타깃 ≥44×44px.
// 좌측 기준선: 20px(<640) / 76px(≥640) — 문서 페이지 기준선과 동일.
// ============================================================================

import Link from "next/link";
import { DisplaySettings } from "@/components/a11y/display-settings";

/** 상단 헤더 (마스트헤드) */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-5 sm:px-[76px]">
        <Link
          href="/"
          aria-label="ZONE-2 홈 — 광역과 기초, 두 시선으로 보는 지역 공론"
          className="flex min-h-11 items-baseline gap-3 leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
        >
          <span className="text-[25px] font-bold tracking-[-0.02em] text-foreground">
            ZONE-2
          </span>
          <span className="hidden max-w-[40vw] truncate text-[15px] font-medium text-muted-foreground sm:inline">
            광역과 기초, 두 시선으로 보는 지역 공론
          </span>
        </Link>
        <DisplaySettings />
      </div>
    </header>
  );
}
