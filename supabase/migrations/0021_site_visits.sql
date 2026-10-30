-- ============================================================================
-- 0021_site_visits — 자체 방문 기록 (검증지표 ④ 재방문율 · KPI 순방문자, #181/#116)
--
-- Cloudflare Web Analytics 는 쿠키리스라 "재방문" 지표 자체가 없고 운영에 비콘도
-- 켜져 있지 않았다(2026-10-11 확인). GA4 는 쿠키 동의 배너가 필요하다. 그래서
-- 1st-party 익명 방문 기록으로 바꾼다(사용자 결정 2026-10-11).
--
-- 저장하는 것: sha256(브라우저 무작위 ID + VISIT_HASH_PEPPER) 와 KST 날짜, 그날 첫 경로.
-- 저장하지 않는 것: IP · User-Agent · 쿠키 · 원 ID. 하루 1행이라 행동 추적이 아니라
-- "그날 왔는가" 만 남는다(docs-site/guide/data.md 개인정보 절). 180일 지난 행은 /api/visit 가 가끔 지운다.
--   순방문자(기간) = distinct visitor_hash
--   재방문율(기간) = 방문일 ≥ 2 인 visitor ÷ 순방문자  (사업계획서: 베타 2주 ≥ 30%)
-- ============================================================================

create table if not exists public.site_visits (
  visitor_hash text not null,          -- sha256(방문 ID + pepper) — 원 ID 는 저장 안 함
  visit_date   date not null,          -- KST 기준 날짜
  first_path   text,                   -- 그날 첫 방문 화면의 구역("/forum" 처럼 첫 조각만 — 개별 글 id 는 남기지 않는다)
  created_at   timestamptz not null default now(),
  primary key (visitor_hash, visit_date)
);

create index if not exists site_visits_date_idx on public.site_visits (visit_date);

alter table public.site_visits enable row level security;
-- anon/authenticated 정책은 만들지 않는다(서버 service_role 전용 — API 가 해시해서 쓴다).
grant all on public.site_visits to service_role;
