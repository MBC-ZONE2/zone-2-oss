"use client";

// ============================================================================
// components/shell/bottom-tab-bar — 모바일 하단 탭바 (md 미만 전용)
//
// 「일점 지면」 검은 세계 바: #0b0d12, 높이 64px + safe-area, 유리(blur)·반투명 없음.
// 활자만(아이콘 숨김) 15px 백색, 활성 탭은 상단 2px 백색 선 + aria-current="page".
// 탭 터치타깃 ≥72×64px. NAV_ITEMS 순서·경로는 그대로(로직 무변경).
// ============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isNavActive } from "@/components/shell/nav-config";

/** 모바일 하단 탭바 */
export function BottomTabBar() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#1c2130] bg-[#0b0d12] md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isNavActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-16 min-h-16 flex-col items-center justify-center px-1",
                  "text-[15px] font-medium whitespace-nowrap",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#f4f5f7]",
                  active ? "text-[#f4f5f7]" : "text-[#f4f5f7]/60",
                )}
              >
                {active ? (
                  // 활성 — 상단 2px 백색 선(배경 없음)
                  <span
                    aria-hidden
                    className="absolute inset-x-0 -top-px h-0.5 bg-[#ffffff]"
                  />
                ) : null}
                {/* 아이콘 숨김 — 검은 세계 위 활자만 */}
                <Icon className="hidden" aria-hidden />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
