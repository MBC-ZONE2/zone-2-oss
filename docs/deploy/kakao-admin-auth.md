# 관리자 카카오 로그인 · 권한 운영

## 구조

- 인증: self-host Supabase Auth의 Kakao OAuth
- 권한 SSOT: `auth.users.app_metadata.role`
- 관리자 로그인에서 신규 인증: `user_metadata.admin_access_requested=true` 표시 후 `/admin/pending`
- 권한 판정에는 위 표시를 쓰지 않고 `app_metadata.role`만 사용
- 역할: `super_admin`(관리자), `operator_mbc`(MBC충북 기자), `operator_oki`(옥천신문 기자)
- 계정 관리: `super_admin`만 `/admin/users`와 `/api/admin/users` 사용
- 변경 감사: `public.admin_account_audit_logs` (`0009_admin_accounts.sql`)

`user_metadata.role`은 사용자가 수정할 수 있으므로 권한 판정에 절대 사용하지 않는다.

## Kakao Developers

앱 `ZONE-2`(App ID 1531220) 기준:

1. 카카오 로그인 사용 설정: ON
2. 동의항목: `profile_nickname` 필수, `profile_image` 선택
3. REST API 키의 카카오 로그인 Redirect URI:
   - 로컬: `http://127.0.0.1:54321/auth/v1/callback`
   - 운영: `https://auth.mbcok.com/auth/v1/callback`
4. REST API 키와 Kakao Login Client Secret은 Git에 넣지 않는다.

이메일 동의 권한이 없는 앱이므로 self-host Auth에서 Kakao 이메일 없는 가입을 허용해야 한다.

## self-host Supabase Auth

운영에서는 Auth/Kong을 TLS가 적용된 `https://auth.mbcok.com`으로만 공개한다. Cloudflare Named Tunnel ingress에 다음을 추가한다.

```text
auth.mbcok.com -> http://localhost:54321
```

실앱 런타임:

```env
NEXT_PUBLIC_SUPABASE_URL=https://auth.mbcok.com
```

self-host GoTrue/Supabase Auth 컨테이너 환경 변수:

```env
GOTRUE_SITE_URL=https://www.mbcok.com
GOTRUE_URI_ALLOW_LIST=https://www.mbcok.com/auth/callback,http://127.0.0.1:3000/auth/callback
GOTRUE_API_EXTERNAL_URL=https://auth.mbcok.com
GOTRUE_EXTERNAL_KAKAO_ENABLED=true
GOTRUE_EXTERNAL_KAKAO_CLIENT_ID=<Kakao REST API key>
GOTRUE_EXTERNAL_KAKAO_SECRET=<Kakao Login Client Secret>
GOTRUE_EXTERNAL_KAKAO_REDIRECT_URI=https://auth.mbcok.com/auth/v1/callback
GOTRUE_EXTERNAL_KAKAO_EMAIL_OPTIONAL=true
```

배포 순서:

1. Cloudflare Tunnel/DNS에 `auth.mbcok.com` 추가
2. 위 Auth 환경 변수를 git 밖 운영 시크릿 파일에 추가
3. Supabase Auth/Kong 재시작
4. 앱의 `NEXT_PUBLIC_SUPABASE_URL`을 공개 TLS URL로 변경 후 재빌드
5. `supabase/migrations/0009_admin_accounts.sql` 적용
6. `/admin/login`에서 대표 카카오 계정으로 최초 로그인
7. Auth 사용자 UUID를 확인하고 첫 관리자 지정

```bash
pnpm admin:bootstrap <auth-user-uuid>
```

8. `/admin/users`에서 나머지 계정을 MBC충북 기자/옥천신문 기자로 승인

## 검증

```bash
pnpm verify:admin-auth
pnpm typecheck
pnpm build
```

운영 스모크:

- 권한 없는 카카오 계정 → `/admin/pending`
- 기자 계정 → `/admin`, `/admin/account` 접근 가능, `/admin/users` 차단
- 관리자 계정 → `/admin/users` 역할 부여/해제 가능
- 자기 자신의 관리자 권한 해제 차단
- 역할 변경 시 `admin_account_audit_logs` 기록
