-- ============================================================================
-- 0032_forum_sensitive_columns — 공론장 글·댓글의 비밀번호 해시·IP 해시를 anon/authenticated 에서 감춘다 (보안 검수 2026-10-26)
--
-- 0004 의 공개 읽기 정책(forum_*_public_read)은 행 조건만 있고, 0015 가 나중에 edit_password_hash·author_ip_hash 를
-- 추가하면서 컬럼 권한을 손보지 않아 공개 anon 키로 PostgREST 를 직접 치면 전 글의 비밀번호 해시(PBKDF2)와
-- IP 해시를 덤프할 수 있었다. 앱의 공개 조회는 명시적 컬럼 목록(lib/forum/queries POST_COLUMNS·COMMENT_COLUMNS)만 쓰므로
-- 테이블 SELECT 를 거두고 그 컬럼들만 다시 허용한다. 비밀번호 검증·수정·삭제는 service_role 경로라 영향 없다.
-- ============================================================================

revoke select on public.forum_posts from anon, authenticated;
grant select (id, article_id, author_hash, display_name, title, body, image_url, like_count, is_flagged, flag_reason, deleted_at, created_at)
  on public.forum_posts to anon, authenticated;

revoke select on public.forum_comments from anon, authenticated;
grant select (id, post_id, author_hash, display_name, body, is_flagged, deleted_at, created_at)
  on public.forum_comments to anon, authenticated;

-- 쓰기 권한도 anon/authenticated 에서 거둔다 — 글·댓글·반응·신고는 전부 service_role 경로(0025 이후 정책도 없다)
revoke insert, update, delete, truncate, references, trigger on public.forum_posts from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.forum_comments from anon, authenticated;

notify pgrst, 'reload schema';
