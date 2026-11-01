// ============================================================================
// /auth/callback — 소셜 OAuth 콜백 (카카오·네이버 공통)
//
// 프로바이더 인증 후 code 를 세션으로 교환(exchangeCodeForSession)하고
// 원래 페이지(redirect 파라미터)로 복귀한다. 실패 시 /login?error=auth.
// Route Handler 이므로 세션 쿠키 set 이 유효하다(Server Component 와 달리).
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractRole } from "@/lib/auth";

/** 오픈 리다이렉트 방지: 내부 절대경로("/...")만 허용 */
function safePath(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/forum";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  // 터널 경유 시 request 의 origin 이 localhost:3002 로 잡혀 로그인 후 복귀가
  // 깨진다. 정본 도메인(NEXT_PUBLIC_SITE_URL=https://mbcok.com)으로 리다이렉트한다.
  const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL || origin).replace(
    /\/$/,
    "",
  );
  const code = searchParams.get("code");
  const redirect = safePath(searchParams.get("redirect"));
  const isAdminFlow = redirect.startsWith("/admin");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (isAdminFlow) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        // 카카오 인증은 성공했지만 역할이 아직 없으면 승인 대기 화면으로 보낸다.
        if (user && !extractRole(user)) {
          // 공개 공론장 사용자와 관리자 승인 요청 계정을 구분한다.
          // 이 표시는 권한이 아니며, 실제 권한 판정은 계속 app_metadata.role 만 사용한다.
          await supabase.auth.updateUser({
            data: {
              ...(user.user_metadata ?? {}),
              admin_access_requested: true,
            },
          });
          return NextResponse.redirect(`${siteOrigin}/admin/pending`);
        }
      }
      return NextResponse.redirect(`${siteOrigin}${redirect}`);
    }
    console.error("[/auth/callback] 세션 교환 실패:", error.message);
  }

  const errorPath = isAdminFlow ? "/admin/login?error=auth" : "/login?error=auth";
  return NextResponse.redirect(`${siteOrigin}${errorPath}`);
}
