"use client";

// ============================================================================
// app/admin/_components/admin-nav — 관리자 상단 텍스트 탭(현재 위치 표시)
//
// 레이아웃은 서버 컴포넌트라 현재 경로를 모른다 → 이 작은 클라이언트 조각이
// usePathname 으로 aria-current 를 붙인다. 시각은 app/admin.css .ad-nav(1px 괘선 위
// 텍스트 탭, 활성 = 잉크 700 + 2px 밑줄) — 공개 지면 공론장 탭과 같은 문법.
// ============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ canManageUsers }: { canManageUsers: boolean }) {
  const pathname = usePathname() ?? "/admin";
  const items = [
    { href: "/admin", label: "운영 대시보드", exact: true },
    { href: "/admin/metrics", label: "검증지표", exact: false },
    { href: "/admin/account", label: "내 계정·권한", exact: false },
    ...(canManageUsers ? [{ href: "/admin/users", label: "계정·권한 관리", exact: false }] : []),
  ];
  return (
    <nav aria-label="관리자 메뉴" className="ad-nav">
      {items.map((it) => {
        const current = it.exact
          ? pathname === it.href
          : pathname === it.href || pathname.startsWith(`${it.href}/`);
        return (
          <Link key={it.href} href={it.href} aria-current={current ? "page" : undefined}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
