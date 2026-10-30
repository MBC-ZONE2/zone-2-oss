-- ============================================================================
-- ZONE-2 이중 컨펌 (0017_dual_confirm)
-- 출처: 컨소시엄 회의 결정 [9] — 콘텐츠 발행은 **옥천신문과 MBC충북 양측 확인이
--       모두 끝나야** 발행된다(이중 컨펌).
--
-- crossview_pairs / podcast_episodes 에 confirmations jsonb 를 추가한다.
-- 형식:
--   {"okinews": {"by": "<auth.users.id>", "at": "<ISO8601>"},
--    "mbc":     {"by": "<auth.users.id>", "at": "<ISO8601>"}}
--   - 키가 있으면 그 사(社)의 확인이 끝난 것. 두 키가 모두 있어야 발행 전이
--     (crossview → approved, podcast → published)를 실행한다.
--   - 한쪽만 있으면 status 는 candidate/review 그대로 두고 큐에 남긴다.
--
-- 기존 행은 '{}' 로 시작한다. 이미 발행된 콘텐츠의 status 는 건드리지 않으므로
-- 소급 적용되지 않고, 앞으로 검수 큐에 들어오는 항목부터 이중 컨펌이 적용된다.
--
-- 관리자 소속(org)은 auth.users.app_metadata.org 에 저장한다(별도 테이블 없음).
--   'okinews' | 'mbc' | null(super_admin — 양쪽 확인 가능)
-- ============================================================================

alter table public.crossview_pairs
  add column if not exists confirmations jsonb not null default '{}'::jsonb;

alter table public.podcast_episodes
  add column if not exists confirmations jsonb not null default '{}'::jsonb;
