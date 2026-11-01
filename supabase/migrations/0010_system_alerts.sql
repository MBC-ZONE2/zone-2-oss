-- ZONE-2 시스템 경고(운영 알람) — 관리자 콘솔 노출용
-- 예: 구독 CLI(codex) 재랭킹 실패로 매칭을 중단(목업 미생성)한 경우.
-- 조회·쓰기는 서버/크론(service_role)만. 관리자 UI 는 서버 경유로 읽는다.

create table if not exists public.system_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  severity text not null default 'warning'
    check (severity in ('info', 'warning', 'error')),
  message text not null,
  context jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists system_alerts_open_idx
  on public.system_alerts (created_at desc)
  where resolved = false;

alter table public.system_alerts enable row level security;

-- anon/authenticated 정책은 만들지 않는다(서버 service_role 전용).
grant all on public.system_alerts to service_role;
