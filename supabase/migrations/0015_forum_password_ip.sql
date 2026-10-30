-- ============================================================================
-- 0015 포럼 익명화 개편 — 로그인 제거, 비번 기반 수정/삭제, IP 해시 어뷰징 차단
--
-- 정책 변경:
--   * 글/댓글 작성은 로그인 없이 누구나. 대신 4자리+ 비밀번호(bcrypt 해시)를 받아
--     본인만 수정/삭제할 수 있게 한다.
--   * 작성자 IP는 원문 저장하지 않고 해시(+앱 솔트)로만 저장해 어뷰징(도배) 판별.
--   * 좋아요/신고는 비번 없이 IP 해시로 1회 제한(익명).
-- ============================================================================

-- 글/댓글: 비번 해시 + IP 해시
alter table forum_posts
  add column if not exists edit_password_hash text,
  add column if not exists author_ip_hash text;

alter table forum_comments
  add column if not exists edit_password_hash text,
  add column if not exists author_ip_hash text;

-- 좋아요/신고: IP 해시 기반 1회 제한(기존 author_hash/reporter_hash를 IP 해시로 채운다).
alter table forum_reactions add column if not exists ip_hash text;
alter table forum_reports   add column if not exists ip_hash text;

-- 도배 차단용 조회 인덱스(IP 해시 + 최근 작성 시각).
create index if not exists forum_posts_ip_created_idx
  on forum_posts (author_ip_hash, created_at desc);
create index if not exists forum_comments_ip_created_idx
  on forum_comments (author_ip_hash, created_at desc);
