"use client";

// ============================================================================
// components/shell/section-nav — 헤더 아래 가로 섹션 내비 바 (md+ 전용)
//
// 신문 지면의 '섹션 바'처럼 헤더(제호) 아래 가로로 섹션을 나열한다. 좌측 사이드바
// 를 대체한다. 활성 섹션은 괘선 언더라인(2px 잉크)으로 표시하고 aria-current 를
// 준다. 홈은 제호(헤더)가 담당하므로 섹션 바에서는 제외하고, 우측 끝에 관리자
// 소형 링크를 둔다. 바 하단은 1px 괘선으로 본문과 구분한다.
// 모바일(md 미만)은 하단 탭바가 담당하므로 이 바는 숨긴다.
// 「일점 지면」: 종이 불투명, 활자 17px 700, 트랜지션 없음(찍힘).
// ============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isNavActive } from "@/components/shell/nav-config";

// 섹션 바 항목 — 홈은 제호가 담당하므로 제외(크로스뷰·온도계·팟캐스트·공론장)
const SECTION_ITEMS = NAV_ITEMS.filter((item) => item.href !== "/");

/** 데스크탑 가로 섹션 내비 바 */
export function SectionNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="섹션"
      // 비-sticky(정상 흐름): 오프라인 배너(sticky top-14)와의 오프셋 충돌을 피한다.
      // 헤더는 sticky 유지, 섹션 바는 스크롤 시 헤더 아래로 지나간다.
      className="hidden border-b border-line bg-background md:block"
    >
      <div className="mx-auto flex max-w-7xl items-stretch justify-between px-5 sm:px-[76px]">
        <ul className="flex items-stretch gap-7">
          {SECTION_ITEMS.map(({ href, label }) => {
            const active = isNavActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-11 items-center text-[17px] font-bold tracking-[-0.01em]",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                  {active ? (
                    // 활성 표시 — 바 하단 괘선 위에 얹히는 2px 잉크 언더라인
                    <span
                      aria-hidden
                      className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>

        <Link
          href="/admin"
          aria-current={isNavActive(pathname, "/admin") ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center text-[15px] font-medium",
            "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground",
            isNavActive(pathname, "/admin")
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          관리자
        </Link>
      </div>
    </nav>
  );
}
