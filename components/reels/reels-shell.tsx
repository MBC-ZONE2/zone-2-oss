"use client";
// ============================================================================
// components/reels/reels-shell — 릴스 전용 풀스크린 셸 (앱 전역)
//
// 베타(mbcok.com)식 풀스크린 릴스 경험: 데스크톱 좌측 SideNav + 모바일 하단
// FloatingNav 만 전역에 깔고, 콘텐츠는 라우트별로 렌더한다.
//   - 홈("/"): 릴스 덱을 좌우 패널 없이 풀블리드로 렌더(자식 그대로).
//   - 그 외(crossview/forum/podcast/temperature/login 등): 중앙 정렬 문서 컬럼
//     (.reels-page) 안에 기존 콘텐츠를 렌더 — 내비만 릴스로 교체된다.
//   - /admin/*: 자체 레이아웃을 쓰므로 셸 없이 children 만 렌더.
// 전역 오디오(PlayerProvider)는 라우트 분기 바깥, 최상단에 한 번만 마운트한다 —
// 페이지를 옮겨도(관리자 포함) 단일 <audio> 가 살아 있어 재생이 끊기지 않는다.
// 하단 float-nav 바로 위 「지금 읽는 단락」 띠(NowLineBand, components/player/now-line)도
// 여기서 마운트 — 회차가 걸려 있고 회차 화면이 아닐 때만 그려진다(모바일 전용, 데스크탑은
// SideNav 도크 아래 NowLineDock).
// ============================================================================

import { usePathname } from "next/navigation";
import { PlayerProvider } from "@/components/player/player-provider";
import { NowLineBand } from "@/components/player/now-line";
import { SideNav, FloatingNav } from "./nav";
import { SiteFooter } from "@/components/site-footer";
import { InstallGuide } from "@/components/pwa/install-guide";
import { MobileTop } from "@/components/shell/mobile-top";

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  // 관리자 영역은 자체 레이아웃을 사용한다.
  if (pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  const isHome = pathname === "/";

  return (
    <div className={isHome ? "reels-root reels-home" : "reels-root"}>
      <SideNav />
      {/* 지금 읽는 단락 띠 — FloatingNav 보다 먼저 두어 백색원(위로 14px 돌출)이 띠 위에 그려진다 */}
      <NowLineBand />
      <FloatingNav />
      {/* 홈 화면 설치 안내 띠·시트(폰, 홈 화면 앱이 아닐 때만) */}
      <InstallGuide />
      {/* 홈 아닌 화면은 본문 열 끝에 푸터(2026-10-21). 공론장은 떠 있는 글쓰기 버튼 자리만큼 아래 여백을 더한다(has-fab) */}
      {isHome ? (
        children
      ) : (
        <div className={pathname === "/forum" ? "reels-page has-fab" : "reels-page"}>
          {/* 모바일 상단 가운데 로고(2026-10-21) — 데스크탑은 레일 로고가 있어 CSS 로 숨긴다 */}
          <MobileTop tone={pathname.startsWith("/temperature") ? "dark" : "paper"} />
          {children}
          {/* 온도계는 검은 세계(app/temperature.css .tw) — 종이색 띠 모양으로 */}
          <SiteFooter tone={pathname.startsWith("/temperature") ? "dark" : "paper"} />
        </div>
      )}
    </div>
  );
}

export function ReelsShell({ children }: { children: React.ReactNode }) {
  return (
    <PlayerProvider>
      <ShellInner>{children}</ShellInner>
    </PlayerProvider>
  );
}
