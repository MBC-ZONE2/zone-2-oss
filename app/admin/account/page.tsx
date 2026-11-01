import { redirect } from "next/navigation";
import {
  getAdminUser,
  getAuthUser,
  permissionsForRole,
  ROLE_LABEL,
  type Permission,
} from "@/lib/auth";
import { PasswordChangeForm } from "../_components/password-change-form";

const PERMISSION_LABEL: Record<Permission, string> = {
  "dashboard.view": "대시보드 조회",
  "crossview.moderate": "크로스뷰 검수",
  "podcast.moderate": "팟캐스트 검수",
  "forum.moderate": "공론장 관리",
  "temperature.editLabel": "온도계 라벨 수정",
  "match.addRule": "수동 매칭 규칙 추가",
  "bannedWords.manage": "금칙어 관리",
  "ingest.config": "데이터 수집 설정",
  "schedule.edit": "발행 일정 변경",
  "users.manage": "계정·권한 관리",
  "logs.view": "감사 로그 조회",
  "content.rollback": "발행 되돌리기",
  "alerts.resolve": "시스템 경고 확인",
  "system.config": "시스템 설정",
};

export default async function AdminAccountPage() {
  const user = await getAdminUser();
  if (!user) {
    const authUser = await getAuthUser();
    redirect(authUser ? "/admin/pending" : "/admin/login");
  }

  const permissions = permissionsForRole(user.role);

  return (
    <main className="ad-two">
      <div style={{ display: "grid", gap: 32 }}>
      <section className="ad-block">
        <h1>내 계정</h1>
        <p>로그인 정보와 현재 소속 역할입니다.</p>
        <dl className="ad-dl">
          <dt>표시 이름</dt>
          <dd>{user.displayName}</dd>
          <dt>로그인 방식</dt>
          <dd>{user.provider === "kakao" ? "카카오" : user.provider === "email" || !user.provider ? "이메일·비밀번호" : user.provider}</dd>
          <dt>이메일</dt>
          <dd>{user.email ?? "제공되지 않음"}</dd>
          <dt>소속 역할</dt>
          <dd>
            <span className="ad-chip">{ROLE_LABEL[user.role]}</span>
          </dd>
        </dl>
      </section>

      {/* 비밀번호 변경 — 이메일·비밀번호 계정만(카카오 등 소셜 계정은 비밀번호가 없다) */}
      {user.provider === "email" && user.email && (
        <section className="ad-block">
          <h2>비밀번호 변경</h2>
          <p>현재 비밀번호를 확인한 뒤 바꿉니다. 발급받은 초기 비밀번호는 여기서 바로 바꿔 주세요.</p>
          <div style={{ marginTop: 14, maxWidth: 440 }}>
            <PasswordChangeForm />
          </div>
        </section>
      )}
      </div>

      <section className="ad-block">
        <h2>허용된 작업</h2>
        <p>권한은 관리자가 변경하며 본인이 직접 바꿀 수 없습니다.</p>
        <ul className="ad-perms">
          {permissions.map((permission) => (
            <li key={permission}>{PERMISSION_LABEL[permission]}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
