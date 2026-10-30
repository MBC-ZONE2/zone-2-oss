// ============================================================================
// components/shell/nav-config — 셸 내비게이션 정의 (5대 메뉴 + 아이콘)
//
// 하단 탭바(모바일)와 사이드바(데스크탑)가 공유한다. 외부 아이콘 라이브러리
// 추가 금지 → 인라인 SVG 로 정의한다. 아이콘은 currentColor 를 상속한다.
// ============================================================================

import type { ComponentType, SVGProps } from "react";

export interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const iconBase: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

/** 홈 */
function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  );
}

/** 크로스뷰 — 좌우 두 시선 */
function CrossviewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconBase} {...props}>
      <rect x="3" y="4" width="7.5" height="16" rx="1.5" />
      <rect x="13.5" y="4" width="7.5" height="16" rx="1.5" />
      <path d="M12 4v16" strokeDasharray="2 2" />
    </svg>
  );
}

/** 온도계 */
function TemperatureIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0Z" />
      <path d="M12 9v6.5" />
    </svg>
  );
}

/** 팟캐스트 — 마이크 */
function PodcastIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconBase} {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4M9 21h6" />
    </svg>
  );
}

/** 공론장 — 대화 */
function ForumIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M4 5h13a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

/** 공고 — 게시판/서류 */
export function NoticeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M8.5 12h7M8.5 16h5" />
    </svg>
  );
}

/** 팟캐스트 재생 — 하단 네비 중앙 액션 버튼용 삼각형 */
export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 셸 메뉴 (데스크탑 사이드바 — 전체 목적지) */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "홈", Icon: HomeIcon },
  { href: "/crossview", label: "크로스뷰", Icon: CrossviewIcon },
  { href: "/notices", label: "공고", Icon: NoticeIcon },
  { href: "/temperature", label: "온도계", Icon: TemperatureIcon },
  { href: "/podcast", label: "팟캐스트", Icon: PodcastIcon },
  { href: "/forum", label: "공론장", Icon: ForumIcon },
] as const;

/** 모바일 하단 네비 — Figma 4탭(홈·공고·[중앙 ▶]·공론장). 중앙은 팟캐 액션. */
export const MOBILE_NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "홈", Icon: HomeIcon },
  { href: "/notices", label: "공고", Icon: NoticeIcon },
  { href: "/forum", label: "공론장", Icon: ForumIcon },
] as const;

/** 현재 경로가 해당 메뉴에 속하는지 (홈은 정확 일치, 나머지는 prefix) */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
