// ============================================================================
// /admin — 관리자 대시보드 (보호 페이지)
//
// 출처: docs/06-API명세.md §4, deliverables/07-관리자-권한표.md §2, REQ(F7)
//
// 서버 가드: 미인증 → /admin/login 리다이렉트.
// 권한 플래그를 계산해 대시보드 셸(검수 큐 / 콘텐츠 관리 / 감사 로그)에 전달한다.
// ============================================================================

import { redirect } from "next/navigation";
import { getAdminUser, getAuthUser, roleHasPermission } from "@/lib/auth";
import { AdminDashboard } from "./_components/admin-dashboard";
import { SystemAlerts } from "./_components/system-alerts";
import { getAdminSummary } from "./_components/summary";

export default async function AdminPage() {
  const user = await getAdminUser();
  if (!user) {
    const authUser = await getAuthUser();
    redirect(authUser ? "/admin/pending" : "/admin/login");
  }

  // 검수 액션 가능 여부 — 큐 탭 중 하나라도 가능하면 액션 UI 노출(viewer 는 false).
  const canModerate =
    roleHasPermission(user.role, "crossview.moderate") ||
    roleHasPermission(user.role, "podcast.moderate") ||
    roleHasPermission(user.role, "forum.moderate");
  // 롤백(발행→검수)은 관리자·양사 기자 모두(한쪽 단독, 2026-10-19), 감사 로그는 logs.view 보유자.
  const canRollback = roleHasPermission(user.role, "content.rollback");
  const canViewLogs = roleHasPermission(user.role, "logs.view");
  const canManageUsers = roleHasPermission(user.role, "users.manage");
  // 백업 현황·내려받기는 관리자(system.config)만 — 덤프에 전 데이터가 들어 있다(2026-10-27)
  const canViewBackups = roleHasPermission(user.role, "system.config");

  // "해야 할 일" 스냅샷 — 로그인 직후 처리 대상을 한눈에.
  const summary = await getAdminSummary(canManageUsers, canViewBackups);

  return (
    <>
      <SystemAlerts />
      <AdminDashboard
        canModerate={canModerate}
        canRollback={canRollback}
        canViewLogs={canViewLogs}
        summary={summary}
      />
    </>
  );
}
