// ============================================================================
// components/site-nav — 상단 네비게이션
//
// 라우트는 각 기능 담당이 생성한다. 여기서는 링크(href)만 정의한다.
// 「일점 지면」: 종이 불투명(유리·반투명 없음), 하단 1px 괘선, 제호 25px 700,
// 메뉴 17px 700 활자(라운드·배경 없음, hover 밑줄). 탭 타깃 44px.
// ============================================================================

import Link from "next/link";

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/", label: "홈" },
  { href: "/crossview", label: "크로스뷰" },
  { href: "/temperature", label: "온도계" },
  { href: "/podcast", label: "팟캐스트" },
  { href: "/forum", label: "공론장" },
];

/** 사이트 상단 네비게이션 바 */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-background">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5 sm:px-[76px]">
        <Link
          href="/"
          className="text-[25px] font-bold tracking-[-0.02em] text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
        >
          ZONE-2
        </Link>
        <ul className="flex items-center gap-1 sm:gap-2">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="inline-flex min-h-11 items-center px-3 text-[17px] font-bold text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
