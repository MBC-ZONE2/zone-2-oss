// ============================================================================
// app/admin/layout — 관리자 운영 데스크 셸 (「일점 지면」, app/admin.css)
//
// 출처: docs/06-API명세.md §2, deliverables/07-관리자-권한표.md
//
// 로그인 사용자가 있으면 제호(운영 데스크 · ZONE-2 관리자 · 역할 · 로그아웃)와
// 텍스트 탭 내비를 렌더한다. 미인증이면 셸 없이 children 만 렌더한다(로그인 페이지용).
// 보호 페이지(page.tsx)는 자체적으로 미인증 시 /admin/login 으로 리다이렉트한다
// → 레이아웃에서 리다이렉트하면 로그인 페이지까지 막혀 무한 루프가 되므로 분리.
// ============================================================================

import type { ReactNode } from "react";
import { region } from "@/config/region";
import { getAdminUser, ROLE_LABEL, roleHasPermission } from "@/lib/auth";
import { signOut } from "./actions";
import { AdminNav } from "./_components/admin-nav";
import { AdminFooter } from "./_components/admin-footer";
import "@/app/admin.css";

// 관리자 영역은 항상 세션 쿠키를 읽으므로 정적 생성 대상에서 제외한다.
// (정적 프리렌더 시 cookies() 가 DYNAMIC_SERVER_USAGE 를 던져 빌드 로그를 더럽힌다.)
// 레이아웃에 두면 /admin, /admin/login 하위 전체에 적용된다.
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getAdminUser();

  // 미인증: 셸 없이 children(로그인 페이지)만.
  if (!user) {
    return (
      <div className="admin">
        {children}
        <AdminFooter />
      </div>
    );
  }

  return (
    <div className="admin">
      {/* 제호 — 3px double 괘선 아래 텍스트 탭. 제호 옆 작은 활자가 곧 역할("관리자"·"MBC충북 기자") */}
      <header className="ad-mast">
        <div>
          <p className="ad-k">운영 데스크</p>
          <h1 className="ad-title">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/zone2-black.png" alt={region.site.name} width={600} height={119} className="ad-logo" />
            <small>{ROLE_LABEL[user.role] ?? user.role}</small>
          </h1>
        </div>
        <div className="ad-mast-r">
          <span>{user.email ?? user.displayName}</span>
          <form action={signOut}>
            <button type="submit" className="ad-textbtn">
              로그아웃
            </button>
          </form>
        </div>
      </header>
      <AdminNav canManageUsers={roleHasPermission(user.role, "users.manage")} />
      {children}
      <AdminFooter />
    </div>
  );
}
