-- ============================================================================
-- 0025_forum_insert_service_only — 공론장 글·댓글 INSERT 는 서버(service_role)만 (codex 리뷰 2026-10-19)
--
-- 0001 의 authenticated 직접 INSERT 정책은 소셜 로그인 시절 것. 지금 글쓰기는 전부 익명 → 서버 API 가
-- 캡차·honeypot·IP 제한·모더레이션·사진 URL 검사를 한 뒤 service_role 로 넣는다. 정책이 남아 있으면
-- (로그인 세션이 생기는 경우) 그 검사를 전부 우회해 직접 insert 할 수 있으므로 제거한다.
-- ============================================================================
drop policy if exists forum_posts_auth_insert on public.forum_posts;
drop policy if exists forum_comments_auth_insert on public.forum_comments;
