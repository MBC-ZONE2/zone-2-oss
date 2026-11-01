-- ============================================================================
-- ZONE-2 0033 — public 스키마 테이블 권한을 명시한다 (빈 DB 설치 검증, 2026-11-02)
--
-- 왜: 최근 Supabase 로컬 이미지는 `postgres` 가 만든 테이블의 기본 권한(ALTER DEFAULT PRIVILEGES)이
--     anon/authenticated/service_role 에 TRUNCATE·REFERENCES·TRIGGER(Dxtm)만 주고 SELECT/INSERT/UPDATE/DELETE 는
--     주지 않는다. 0001~0032 는 명시 GRANT 없이 기본 권한에 기대고 있어, 새 DB 에서는 서비스 역할(service_role)이
--     forum_posts·podcast_episodes 등 대부분 테이블을 읽고 쓰지 못한다(42501 permission denied).
--     운영 DB 는 예전 기본값(arwdDxtm)으로 만들어져 영향이 없었다. 이 파일은 운영에 적용해도 변화가 없다(멱등).
-- 무엇을:
--   · service_role — public 모든 테이블·시퀀스에 전체 권한 (서버 코드는 전부 service_role 경로)
--   · anon/authenticated — public 모든 테이블 SELECT (행 노출은 각 테이블 RLS 정책이 결정)
--   · 단 forum_posts·forum_comments 는 0032 의 결정 유지: anon/authenticated 는 민감 컬럼을 뺀 컬럼 SELECT 만
--   · 앞으로 만들 테이블도 같은 규칙이 붙도록 기본 권한을 고친다
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete, truncate, references, trigger
  on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;

grant select on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- 0032: 공론장 민감 컬럼(edit_password_hash·author_ip_hash)은 브라우저 키로 못 읽는다 — 위 일괄 SELECT 뒤 다시 거둔다.
revoke select on public.forum_posts from anon, authenticated;
grant select (id, article_id, author_hash, display_name, title, body, image_url, like_count, is_flagged, flag_reason, deleted_at, created_at)
  on public.forum_posts to anon, authenticated;
revoke select on public.forum_comments from anon, authenticated;
grant select (id, post_id, author_hash, display_name, body, is_flagged, deleted_at, created_at)
  on public.forum_comments to anon, authenticated;

-- 앞으로 postgres 가 만드는 테이블·시퀀스의 기본 권한
alter default privileges for role postgres in schema public
  grant select, insert, update, delete, truncate, references, trigger on tables to service_role;
alter default privileges for role postgres in schema public
  grant select on tables to anon, authenticated;
alter default privileges for role postgres in schema public
  grant usage, select, update on sequences to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to anon, authenticated;
