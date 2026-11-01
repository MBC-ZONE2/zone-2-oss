// ============================================================================
// /admin/login — 관리자 이메일·비밀번호 로그인 (「일점 지면」 낱장)
// 관리자 인증은 자격증명 전용(카카오 소셜 로그인은 일반 유저용 — 메인/공론장).
// 권한 부여는 인증과 분리한다: app_metadata.role 이 SSOT.
// ============================================================================

import { PasswordLogin } from "@/components/auth/password-login";

export default async function AdminLoginPage() {
  return (
    <main className="ad-center">
      <div className="ad-sheet">
        <div>
          <p className="ad-k">운영 데스크 · 운영자 전용</p>
          <h1>관리자 로그인</h1>
        </div>
        <PasswordLogin redirectTo="/admin" />
        <p>관리자 계정은 최고관리자가 발급합니다. 접근 권한 문의는 운영팀에 요청하세요.</p>
      </div>
    </main>
  );
}
