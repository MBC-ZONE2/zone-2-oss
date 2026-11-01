"use client";

// ============================================================================
// components/shell/threads-shell — 3열 문서 셸 (리스킨 파일럿)
//
// 데스크톱(md+): 좌측 고정 내비 레일 + 중앙 단일 피드(≤600px) + (lg+)우측 컨텍스트.
// 모바일: 상단 슬림 헤더 + 중앙 피드 + 하단 탭바(기존 BottomTabBar 재사용).
// /admin/* 은 자체 레이아웃이 있으므로 셸 없이 children 만 렌더한다.
// 내비 정의(NAV_ITEMS)는 기존 nav-config 를 그대로 공유한다.
//
// 「일점 지면」: 종이 바닥·잉크 활자·1px 괘선. 카드·라운드·유리·그림자 없음.
// 레일 메뉴는 아이콘 없이 20px 700 활자, 활성은 좌측 2px 잉크 괘선.
// ============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isNavActive } from "@/components/shell/nav-config";
import { DisplaySettings } from "@/components/a11y/display-settings";
import { BottomTabBar } from "@/components/shell/bottom-tab-bar";

/** 워드마크 — 25px 700 잉크. 슬로건은 15px 보조 잉크 */
function Wordmark() {
  return (
    <Link
      href="/"
      className="flex min-h-11 flex-col justify-center leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
      aria-label="ZONE-2 홈"
    >
      <strong className="text-[25px] font-bold tracking-[-0.02em] text-foreground">
        ZONE-2
      </strong>
      <span className="mt-1 text-[15px] font-medium text-muted-foreground">
        광역·기초 지역 공론
      </span>
    </Link>
  );
}

/** 데스크톱 좌측 내비 레일 */
function DesktopRail() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="주요 메뉴"
      className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-line bg-background py-7 md:flex"
    >
      <div className="px-5 pb-6">
        <Wordmark />
      </div>
      <ul className="flex flex-col">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isNavActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center gap-3 border-l-2 py-2 pl-[18px] pr-5",
                  "text-[20px] font-bold leading-tight text-foreground",
                  "hover:underline hover:underline-offset-4",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground",
                  active ? "border-foreground" : "border-transparent",
                )}
              >
                {/* 아이콘 숨김 — 활자만 */}
                <Icon className="hidden" aria-hidden />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto border-t border-line px-5 pt-3">
        <DisplaySettings />
      </div>
    </nav>
  );
}

/** 데스크톱 우측 컨텍스트 패널 */
function ContextRail() {
  return (
    <aside
      aria-label="지역 공론 빠른 정보"
      className="sticky top-0 hidden h-screen w-[300px] shrink-0 flex-col gap-6 border-l border-line bg-background px-5 py-7 lg:flex"
    >
      {/* 괘선 블록 — 카드 대신 상단 1px 괘선으로 구획 */}
      <section className="border-t border-line pt-3">
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          LOCAL THREADS
        </p>
        <h2 className="mt-1 text-[20px] font-bold leading-tight tracking-[-0.01em] text-foreground">
          광역·기초 공론
        </h2>
        <p className="mt-2 text-[17px] leading-[1.65] text-foreground">
          MBC충북과 옥천신문, 두 시선을 하나의 흐름으로 잇습니다.
        </p>
      </section>
      <nav aria-label="빠른 이동" className="flex flex-col border-t border-line">
        {NAV_ITEMS.filter((n) => n.href !== "/").map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-11 items-center gap-3 border-b border-line text-[17px] font-bold text-foreground hover:underline hover:underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
          >
            <Icon className="hidden" aria-hidden />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}

/** 모바일 상단 슬림 헤더 — 종이 불투명, 하단 1px 괘선 */
function MobileHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-line bg-background px-5 md:hidden">
      <Wordmark />
      <DisplaySettings />
    </header>
  );
}

export function ThreadsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // 관리자 영역은 자체 레이아웃을 사용한다.
  if (pathname?.startsWith("/admin")) {
    return <>{children}</>;
  }

  return (
    <>
      <MobileHeader />
      <div className="mx-auto flex w-full max-w-[1180px] justify-center bg-background">
        <DesktopRail />
        <main className="min-h-screen w-full max-w-[600px] flex-1 border-x border-line pb-24 md:pb-10">
          {children}
        </main>
        <ContextRail />
      </div>
      <BottomTabBar />
    </>
  );
}
