-- ============================================================================
-- 0022_metrics — 검증지표 대시보드(/admin/metrics, #181) 집계 + 온도 실행 통계
--
-- 1) temperature_runs.stats jsonb — 산출 1회의 입력 통계를 구조화해 남긴다.
--    { issues, matched, classified, pending, provider, fallback }
--    "감정 성분 0" 이 분류 실패인지(provider/fallback) 매칭 0건인지(matched) 를
--    detail 문자열 파싱 없이 구분하기 위한 것(2026-10-11 실측: 169사안 중 167사안이
--    7일 창 댓글 0건 → 분산이 정의상 0).
-- 2) metrics_daily(p_since, p_until) — KST 일별 수집·온도·팟캐·방문 집계 한 번에.
--    PostgREST 로 수천 행을 끌어와 앱에서 더하지 않도록 DB 에서 센다.
-- 3) metrics_visits(p_since, p_until) — 기간 순방문자·재방문자(방문일 ≥2).
-- 두 함수 모두 service_role 전용(anon/authenticated 실행 권한 회수).
-- ============================================================================

alter table public.temperature_runs add column if not exists stats jsonb;

drop function if exists public.metrics_daily(date, date);
create function public.metrics_daily(p_since date, p_until date)
returns table (
  day                date,
  ingest_runs        integer,
  ingest_ok          integer,
  adapters_total     integer,
  adapters_failed    integer,
  articles_upserted  integer,
  comments_upserted  integer,
  temp_runs          integer,
  temp_ok            integer,
  temp_matched_sum   integer,   -- stats 가 있는 실행의 여론 매칭 합 (평균 = sum / stats_runs)
  temp_stats_runs    integer,   -- stats 가 기록된 실행 수(2026-10-11 이후)
  temp_classified    integer,
  temp_pending       integer,
  podcast_published  boolean,
  podcast_status     text,
  visitors           integer
)
language sql
security definer
set search_path = public
stable
as $fn$
  with days as (
    select generate_series(p_since, p_until, interval '1 day')::date as day
  ),
  ing as (
    select (ran_at at time zone 'Asia/Seoul')::date d,
           count(*)::int runs,
           count(*) filter (where status = 'ok')::int ok,
           coalesce(sum(adapters_total), 0)::int a_total,
           coalesce(sum(adapters_failed), 0)::int a_failed,
           coalesce(sum(articles_upserted), 0)::int arts,
           coalesce(sum(comments_upserted), 0)::int cmts
    from ingest_runs
    where ran_at >= (p_since::timestamp at time zone 'Asia/Seoul')
      and ran_at <  ((p_until + 1)::timestamp at time zone 'Asia/Seoul')
    group by 1
  ),
  tmp as (
    select (ran_at at time zone 'Asia/Seoul')::date d,
           count(*)::int runs,
           count(*) filter (where status = 'ok')::int ok,
           coalesce(sum((stats->>'matched')::int), 0)::int matched_sum,
           count(stats)::int stats_runs,
           coalesce(sum((stats->>'classified')::int), 0)::int classified,
           coalesce(sum((stats->>'pending')::int), 0)::int pending
    from temperature_runs
    where ran_at >= (p_since::timestamp at time zone 'Asia/Seoul')
      and ran_at <  ((p_until + 1)::timestamp at time zone 'Asia/Seoul')
    group by 1
  ),
  pod as (
    select scheduled_for d,
           bool_or(status = 'published') published,
           -- 하루 여러 행이면 가장 "진행된" 상태 하나
           (array_agg(status::text order by case status::text when 'published' then 0 when 'review' then 1 when 'generating' then 2 else 3 end))[1] st
    from podcast_episodes
    where scheduled_for between p_since and p_until
    group by 1
  ),
  vis as (
    select visit_date d, count(*)::int n
    from site_visits
    where visit_date between p_since and p_until
    group by 1
  )
  select days.day,
         coalesce(ing.runs, 0), coalesce(ing.ok, 0),
         coalesce(ing.a_total, 0), coalesce(ing.a_failed, 0),
         coalesce(ing.arts, 0), coalesce(ing.cmts, 0),
         coalesce(tmp.runs, 0), coalesce(tmp.ok, 0),
         coalesce(tmp.matched_sum, 0), coalesce(tmp.stats_runs, 0), coalesce(tmp.classified, 0), coalesce(tmp.pending, 0),
         coalesce(pod.published, false), pod.st,
         coalesce(vis.n, 0)
  from days
  left join ing on ing.d = days.day
  left join tmp on tmp.d = days.day
  left join pod on pod.d = days.day
  left join vis on vis.d = days.day
  order by days.day;
$fn$;

drop function if exists public.metrics_visits(date, date);
create function public.metrics_visits(p_since date, p_until date)
returns table (visitors integer, returning_visitors integer, visit_days integer)
language sql
security definer
set search_path = public
stable
as $fn$
  with per as (
    select visitor_hash, count(distinct visit_date) days
    from site_visits
    where visit_date between p_since and p_until
    group by 1
  )
  select count(*)::int,
         count(*) filter (where days >= 2)::int,
         coalesce(sum(days), 0)::int
  from per;
$fn$;

revoke all on function public.metrics_daily(date, date) from public, anon, authenticated;
revoke all on function public.metrics_visits(date, date) from public, anon, authenticated;
grant execute on function public.metrics_daily(date, date) to service_role;
grant execute on function public.metrics_visits(date, date) to service_role;
