-- ZONE-2 관리자 계정 역할 변경 감사 로그
-- 역할의 실제 SSOT는 auth.users.raw_app_meta_data.role(app_metadata.role)이며,
-- 이 테이블은 누가 누구의 권한을 언제 바꿨는지만 별도로 보존한다.

create table if not exists public.admin_account_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  subject_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('role_assign', 'role_change', 'role_revoke')),
  previous_role text,
  new_role text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_account_audit_logs_created_at_idx
  on public.admin_account_audit_logs (created_at desc);

alter table public.admin_account_audit_logs enable row level security;

-- 일반 anon/authenticated 정책을 만들지 않는다.
-- 조회·쓰기는 users.manage 가드 이후 service_role API에서만 수행한다.
