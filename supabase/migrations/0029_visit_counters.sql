-- ============================================================================
-- 0029_visit_counters — 오늘·누적 방문자 수 (푸터 공개 표기 + 관리자 대시보드, 2026-10-26 대표 지시)
--
-- site_visits 는 개인정보 보존 기간 때문에 180일 지난 행을 지운다(0021). 그대로 세면
-- 누적이 내년 4월부터 줄어들므로, 일별 순방문자 수만 site_visits_daily 에 영구 보관하고
--   누적 방문 = 지난 날들의 일별 순방문자 합(site_visits_daily) + 오늘 순방문자(site_visits 실시간)
-- 로 정의한다(대표 결정 2026-10-26: "1번 + 일별 합"). 해시는 남기지 않으므로 "중복 없는 누적"은
-- 180일을 넘겨 유지할 수 없다 — 그래서 일별 합이다.
--
-- visit_counters(): 호출할 때마다 지난 날짜(마지막 집계일 하루 전부터 어제까지)를 멱등 반영하고
-- 오늘·누적·시작일을 돌려준다. service_role 전용(공개 API 는 서버가 60초 캐시로 호출).
-- ============================================================================

create table if not exists public.site_visits_daily (
  visit_date  date primary key,            -- KST 날짜
  visitors    integer not null check (visitors >= 0),  -- 그날 순방문자(distinct visitor_hash)
  updated_at  timestamptz not null default now()
);

alter table public.site_visits_daily enable row level security;
grant all on public.site_visits_daily to service_role;

drop function if exists public.visit_counters();
create function public.visit_counters()
returns table (today integer, total integer, since date, today_date date)
language plpgsql
security definer
set search_path = public
volatile
as $fn$
declare
  d_today date := (now() at time zone 'Asia/Seoul')::date;
  d_from  date;
begin
  -- 마지막 집계일 하루 전부터 다시 센다 — 자정 전후에 늦게 들어온 신호를 다음 호출에서 반영
  select coalesce(max(visit_date) - 1, (select min(visit_date) from site_visits), d_today)
    into d_from
    from site_visits_daily;

  insert into site_visits_daily (visit_date, visitors, updated_at)
  select visit_date, count(distinct visitor_hash)::int, now()
    from site_visits
   where visit_date >= d_from and visit_date < d_today
   group by visit_date
  on conflict (visit_date) do update
     set visitors = excluded.visitors, updated_at = now()
   where site_visits_daily.visitors is distinct from excluded.visitors;

  return query
  with t as (
    select count(distinct visitor_hash)::int as n from site_visits where visit_date = d_today
  ),
  p as (
    select coalesce(sum(visitors), 0)::int as n from site_visits_daily where visit_date < d_today
  ),
  s as (
    select min(d) as d from (
      select min(visit_date) d from site_visits_daily
      union all
      select min(visit_date) from site_visits
    ) x
  )
  select t.n, (p.n + t.n)::int, coalesce(s.d, d_today), d_today from t, p, s;
end
$fn$;

revoke all on function public.visit_counters() from public, anon, authenticated;
grant execute on function public.visit_counters() to service_role;

-- site_visits_prune(p_cutoff): 보존 기간 정리 — 지우기 전에 같은 트랜잭션에서 일별 집계를 먼저 채운다.
-- /api/visit 가 delete 대신 이 함수를 부른다(codex 리뷰 2026-10-26: 통계 호출이 뜸한 사이 180일이
-- 지나면 미집계 원본이 먼저 지워져 누적이 영구 누락될 수 있었다). 지운 행 수를 돌려준다.
drop function if exists public.site_visits_prune(date);
create function public.site_visits_prune(p_cutoff date)
returns integer
language plpgsql
security definer
set search_path = public
volatile
as $fn$
declare
  n integer;
begin
  insert into site_visits_daily (visit_date, visitors, updated_at)
  select visit_date, count(distinct visitor_hash)::int, now()
    from site_visits
   where visit_date < p_cutoff
   group by visit_date
  on conflict (visit_date) do update
     set visitors = greatest(site_visits_daily.visitors, excluded.visitors), updated_at = now();

  delete from site_visits where visit_date < p_cutoff;
  get diagnostics n = row_count;
  return n;
end
$fn$;

revoke all on function public.site_visits_prune(date) from public, anon, authenticated;
grant execute on function public.site_visits_prune(date) to service_role;

notify pgrst, 'reload schema';
