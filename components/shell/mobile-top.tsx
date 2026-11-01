// ============================================================================
// components/shell/mobile-top — 모바일(<1100) 상단 가운데 ZONE-2 로고 띠 (대표 지시 2026-10-21)
//
// 홈은 릴스 topbar(reels-deck .reels-topbar)가 같은 자리에 로고를 놓고, 홈 아닌 화면은 ReelsShell 이
// 본문 열(.reels-page) 맨 위에 이 띠를 둔다 — 높이 49px 로 홈 topbar 와 같다. 로고는 홈 링크.
// 종이 위 검정 로고, 검은 세계(/temperature)는 zone2-ondark.png. 데스크탑은 레일에 로고가 있어 숨긴다.
// 서버 컴포넌트. 스타일 app/reels.css(.m-top*).
// ============================================================================

import Link from "next/link";
import { region } from "@/config/region";

export function MobileTop({ tone = "paper" }: { tone?: "paper" | "dark" }) {
  return (
    <div className={`m-top m-top--${tone}`}>
      <Link href="/" className="m-top-link" aria-label={`${region.site.name} 홈`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tone === "dark" ? "/logos/zone2-ondark.png" : "/logos/zone2-black.png"} alt={region.site.name} width={600} height={119} className="m-top-logo" />
      </Link>
    </div>
  );
}
