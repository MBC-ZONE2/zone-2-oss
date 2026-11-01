import { redirect } from "next/navigation";
import { getAdminUser, getAuthUser, ROLE_LABEL, roleHasPermission } from "@/lib/auth";
import { UserManagementPanel } from "../_components/user-management-panel";

export default async function AdminUsersPage() {
  const user = await getAdminUser();
  if (!user) {
    const authUser = await getAuthUser();
    redirect(authUser ? "/admin/pending" : "/admin/login");
  }
  if (!roleHasPermission(user.role, "users.manage")) redirect("/admin");

  return (
    <main>
      <header className="ad-page-head">
        <h1>계정·권한 관리</h1>
        <p>역할은 {ROLE_LABEL.super_admin}, {ROLE_LABEL.operator_mbc}, {ROLE_LABEL.operator_oki} 세 가지이며 모든 변경은 기록됩니다.</p>
      </header>
      <UserManagementPanel />
    </main>
  );
}
