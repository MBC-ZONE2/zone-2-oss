-- ============================================================================
-- 0009_ingest_runs — 수집 실행 로그 (검증지표 #1: API 수집 성공률 ≥ 95%)
--
-- docs/02-검증지표.md 1단계 통과 기준의 하나가 "API 수집 성공률 ≥ 95%" 인데,
-- 온도 산출에는 temperature_runs 가 있는 반면 **수집에는 대응 테이블이 없어
-- 측정 자체가 불가능**했다. 같은 패턴으로 실행 로그를 남긴다.
--
-- 성공률은 실행 단위가 아니라 **어댑터 호출 단위**로 센다:
--   성공률 = 1 - sum(adapters_failed) / sum(adapters_total)
-- 한 실행에서 어댑터 3종 중 1종만 실패하면 그 실행은 status='fail' 이지만
-- 호출 성공률은 2/3 이다 — 지표 정의(수집 성공률)에 맞추려면 분모가 호출이어야
-- 한다.
-- ============================================================================

create table ingest_runs (
  id                uuid primary key default gen_random_uuid(),
  status            text check (status in ('ok', 'fail')),
  detail            text,
  -- 어댑터 호출 집계 (성공률 분모/분자)
  adapters_total    int default 0,
  adapters_failed   int default 0,
  -- 적재량 (중간보고 규모 데이터)
  articles_upserted int default 0,
  comments_upserted int default 0,
  ran_at            timestamptz default now()
);

create index on ingest_runs (ran_at desc);

alter table ingest_runs enable row level security;

-- temperature_runs 와 동일: 공개 정책 없음 → anon/authenticated 차단,
-- service_role 만 RLS 우회로 접근한다(크론·집계 전용).
