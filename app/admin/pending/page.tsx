import { redirect } from "next/navigation";
import { extractNickname, extractRole, getAuthUser, ROLE_LABEL } from "@/lib/auth";
import { signOut } from "../actions";
import { Button } from "@/components/ui/button";

export default async function AdminPendingPage() {
  const user = await getAuthUser();
  if (!user) redirect("/admin/login");
  if (extractRole(user)) redirect("/admin");

  return (
    <main className="ad-center">
      <div className="ad-sheet" style={{ maxWidth: 520 }}>
        <div>
          <p className="ad-k">운영 데스크</p>
          <h1>권한 승인 대기</h1>
        </div>
        <p>카카오 로그인은 완료됐습니다. 관리자에게 소속 역할 승인을 요청해 주세요.</p>
        <dl className="ad-dl">
          <dt>카카오 계정</dt>
          <dd>{extractNickname(user)}</dd>
          <dt>이메일</dt>
          <dd>{user.email ?? "카카오에서 이메일을 제공하지 않음"}</dd>
          <dt>현재 권한</dt>
          <dd>미지정</dd>
        </dl>
        <p>승인 가능한 역할은 {ROLE_LABEL.super_admin}, {ROLE_LABEL.operator_mbc}, {ROLE_LABEL.operator_oki}입니다.</p>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm" className="w-full">
            다른 카카오 계정으로 로그인
          </Button>
        </form>
      </div>
    </main>
  );
}
