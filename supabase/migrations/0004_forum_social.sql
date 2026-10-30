-- ============================================================================
-- ZONE-2 공론장 소셜 확장 (0004_forum_social)
-- 출처: REQ-012(F6) — 소셜 로그인 + 공론장 리빌드 (이슈 #33 확정 기획)
--
-- 1) 실명 표시(display_name) · 소프트 삭제(deleted_at) 컬럼 추가
--      - display_name: 실명(소셜 닉네임) 선택 시에만 저장 → 개인정보 최소 수집
--      - deleted_at  : 내 글/댓글 소프트 삭제. '삭제된 글' 자리표시자 유지용
-- 2) 좋아요(forum_reactions) · 신고(forum_reports) 테이블
--      - target/target_id 로 게시글·댓글 공용. author/reporter 는 비식별 해시.
--      - unique 로 1인 1회(중복 좋아요·중복 신고 방지)
-- 3) RLS: 두 신규 테이블 enable + 공개 정책 없음
--      - 읽기/쓰기 모두 API 라우트가 service_role 로 수행(0003 banned_words 패턴).
--        신고 5회 누적 자동 가리기(is_flagged 전환)도 API 계층에서 count 후 처리.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) 컬럼 추가
-- ---------------------------------------------------------------------------
alter table forum_posts
  add column if not exists display_name text,          -- 실명(소셜 닉네임) 선택 시만
  add column if not exists deleted_at   timestamptz;    -- 소프트 삭제 시각

alter table forum_comments
  add column if not exists display_name text,
  add column if not exists deleted_at   timestamptz;

-- ---------------------------------------------------------------------------
-- 2) 좋아요 (forum_reactions)
--    target: 'post' | 'comment' / target_id: 해당 행 id / author_hash: 비식별 해시
--    unique(target, target_id, author_hash) → 1인 1회
-- ---------------------------------------------------------------------------
create table if not exists forum_reactions (
  id           uuid primary key default gen_random_uuid(),
  target       text not null check (target in ('post', 'comment')),
  target_id    uuid not null,
  author_hash  text not null,
  created_at   timestamptz default now(),
  unique (target, target_id, author_hash)
);
create index if not exists forum_reactions_target_idx
  on forum_reactions (target, target_id);

-- ---------------------------------------------------------------------------
-- 3) 신고 (forum_reports)
--    reason: 욕설(abuse) | 스팸(spam) | 허위정보(misinfo) | 기타(etc)
--    unique(target, target_id, reporter_hash) → 1인 1회
-- ---------------------------------------------------------------------------
create table if not exists forum_reports (
  id            uuid primary key default gen_random_uuid(),
  target        text not null check (target in ('post', 'comment')),
  target_id     uuid not null,
  reporter_hash text not null,
  reason        text not null check (reason in ('abuse', 'spam', 'misinfo', 'etc')),
  created_at    timestamptz default now(),
  unique (target, target_id, reporter_hash)
);
create index if not exists forum_reports_target_idx
  on forum_reports (target, target_id);

-- ---------------------------------------------------------------------------
-- 4) RLS: 공개 정책 없음 → anon/authenticated 접근 차단.
--    좋아요/신고/삭제는 API 라우트가 인증 확인 후 service_role 로 수행한다.
-- ---------------------------------------------------------------------------
alter table forum_reactions enable row level security;
alter table forum_reports   enable row level security;

-- ---------------------------------------------------------------------------
-- 5) 공개 SELECT 정책 강화 (교차리뷰 반영)
--    기존 0001 정책은 using(true) 라서 anon 이 Supabase 직접 질의로 삭제·
--    가려진 글의 원문(title/body/display_name)을 읽을 수 있었다.
--    공개 읽기는 "삭제되지 않고 가려지지 않은" 행으로 한정한다.
--    자리표시자·검수 화면은 API/서버가 service_role 로 조회 후 redact 한다.
-- ---------------------------------------------------------------------------
drop policy if exists "forum_posts_public_read" on forum_posts;
create policy "forum_posts_public_read"
  on forum_posts for select
  to anon, authenticated
  using (deleted_at is null and is_flagged = false);

drop policy if exists "forum_comments_public_read" on forum_comments;
create policy "forum_comments_public_read"
  on forum_comments for select
  to anon, authenticated
  using (deleted_at is null and is_flagged = false);

-- ---------------------------------------------------------------------------
-- 6) 게시글 좋아요 수 원자 동기화 (교차리뷰 반영)
--    count 조회 후 별도 update 는 동시 요청에서 낡은 값이 마지막에 저장될 수
--    있다. 단일 문장(update ... from 집계) 으로 원자화한다.
-- ---------------------------------------------------------------------------
create or replace function public.sync_forum_post_like_count(target_post uuid)
returns integer
language sql
as $$
  update forum_posts p
     set like_count = sub.cnt
    from (
      select count(*)::int as cnt
        from forum_reactions
       where target = 'post' and target_id = target_post
    ) sub
   where p.id = target_post
   returning sub.cnt;
$$;

grant execute on function public.sync_forum_post_like_count(uuid) to service_role;
