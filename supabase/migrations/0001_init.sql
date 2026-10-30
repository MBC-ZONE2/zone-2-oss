-- ============================================================================
-- ZONE-2 초기 스키마 (0001_init)
-- 출처: docs/04-데이터모델.md — 확장 · enum · 테이블 · 인덱스 · RLS
-- Supabase Postgres + pgvector. 관계형 + 전문검색 + 임베딩 매칭 단일 DB 통합.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 확장
-- ---------------------------------------------------------------------------
create extension if not exists vector;      -- pgvector (임베딩 매칭)
create extension if not exists pg_trgm;     -- 텍스트 유사도 보조

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------
create type media_source as enum ('mbc_cb', 'okinews');     -- 광역 / 기초
create type article_kind  as enum ('news', 'youtube', 'forum_opinion');
create type pair_status   as enum ('candidate', 'approved', 'rejected');
create type episode_status as enum ('generating', 'review', 'approved', 'published', 'failed');
create type moderation_target as enum ('crossview', 'podcast', 'temperature', 'forum');
create type moderation_action as enum ('approve', 'reject');

-- ---------------------------------------------------------------------------
-- 기사 / 댓글
-- ---------------------------------------------------------------------------
create table articles (
  id            uuid primary key default gen_random_uuid(),
  source        media_source not null,
  kind          article_kind not null default 'news',
  external_id   text,                       -- 원본 CMS/영상 ID
  url           text,
  title         text not null,
  body          text,
  category      text,
  keywords      text[],
  published_at  timestamptz,
  embedding     vector(1536),               -- text-embedding-3-small
  raw           jsonb,                       -- 원본 페이로드
  created_at    timestamptz default now(),
  unique (source, external_id)
);
create index on articles using hnsw (embedding vector_cosine_ops);
create index on articles (source, published_at desc);

create table comments (
  id            uuid primary key default gen_random_uuid(),
  source        media_source not null,
  article_id    uuid references articles(id) on delete cascade,
  external_id   text,
  body          text not null,
  author_hash   text,                       -- 비식별화
  like_count    int default 0,
  sentiment     text check (sentiment in ('pos','neg','neu')),  -- Claude 분류
  published_at  timestamptz,
  created_at    timestamptz default now(),
  unique (source, external_id)
);
create index on comments (article_id);
create index on comments (published_at desc);

-- ---------------------------------------------------------------------------
-- 기능 ① 크로스뷰 매칭
-- ---------------------------------------------------------------------------
create table crossview_pairs (
  id             uuid primary key default gen_random_uuid(),
  article_macro  uuid references articles(id) on delete cascade,  -- MBC충북(광역)
  article_micro  uuid references articles(id) on delete cascade,  -- 옥천신문(기초)
  similarity     real,                       -- pgvector 코사인
  match_score    real,                       -- Claude 재랭킹 점수(0~1)
  summary_macro  text,                        -- AI 광역 관점 요약
  summary_micro  text,                        -- AI 기초 관점 요약
  reading_point  text,                        -- "같은 정책, 두 개의 현실"
  card_data      jsonb,                       -- 카드뉴스 구성
  status         pair_status default 'candidate',
  created_at     timestamptz default now(),
  unique (article_macro, article_micro)
);

-- 매칭 정확도 검증용 정답셋 (Precision@5)
create table matching_eval (
  id             uuid primary key default gen_random_uuid(),
  article_macro  uuid references articles(id),
  article_micro  uuid references articles(id),
  is_correct     boolean not null,           -- 수동 태깅
  created_at     timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 기능 ② 공론 온도계
-- ---------------------------------------------------------------------------
create table issues (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,                 -- 이슈명(LLM 라벨)
  keywords    text[],
  created_at  timestamptz default now()
);

create table temperature_scores (
  id              uuid primary key default gen_random_uuid(),
  issue_id        uuid references issues(id) on delete cascade,
  temperature     real not null,             -- 0~100 스케일
  frequency       real,                       -- Freq 성분
  sentiment_var   real,                       -- SentimentVariance 성분
  topic_conc      real,                       -- TopicConcentration 성분
  rank            int,                        -- TOP5 순위
  prev_rank       int,                        -- 변동 화살표
  computed_at     timestamptz default now()
);
create index on temperature_scores (computed_at desc);

-- 15분 갱신 작동률 검증용
create table temperature_runs (
  id          uuid primary key default gen_random_uuid(),
  status      text check (status in ('ok','fail')),
  detail      text,
  ran_at      timestamptz default now()
);

-- 온도 산출:
-- temperature = 100 * (0.4*Freq_norm + 0.35*SentVar_norm + 0.25*TopicConc_norm)
-- 가중치 α=0.4 / β=0.35 / γ=0.25 고정.

-- ---------------------------------------------------------------------------
-- 기능 ③ AI 팟캐스트
-- ---------------------------------------------------------------------------
create table podcast_episodes (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,               -- "오늘의 충북 N월 N일"
  script        text,                         -- Claude 생성 스크립트
  audio_url     text,                         -- Supabase Storage
  duration_sec  int,
  thumbnail_url text,
  source_refs   jsonb,                        -- 사용된 기사/댓글 id
  status        episode_status default 'generating',
  reviewed_by   uuid,                         -- 운영자
  scheduled_for date,                         -- 월/수/금
  published_at  timestamptz,
  created_at    timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 기능 ④ 통합 공론장
-- ---------------------------------------------------------------------------
create table forum_posts (
  id           uuid primary key default gen_random_uuid(),
  article_id   uuid references articles(id) on delete set null,
  author_hash  text,
  title        text,
  body         text not null,
  like_count   int default 0,
  is_flagged   boolean default false,        -- AI 모더레이션
  flag_reason  text,                          -- bot/spam/hate
  created_at   timestamptz default now()
);
create index on forum_posts (created_at desc);

create table forum_comments (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid references forum_posts(id) on delete cascade,
  author_hash  text,
  body         text not null,
  is_flagged   boolean default false,
  created_at   timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 기능 ⑤ 관리자 / 검수
-- ---------------------------------------------------------------------------
create table moderation_logs (
  id          uuid primary key default gen_random_uuid(),
  target      moderation_target not null,
  target_id   uuid not null,
  action      moderation_action not null,
  reason      text,
  operator    uuid,                           -- MBC/옥천 담당자
  created_at  timestamptz default now()
);
-- 검수 승인율 = approve / (approve+reject)

-- ============================================================================
-- RLS / 권한 (docs/04 §RLS 요약)
--   - 공개 읽기: articles, crossview_pairs(approved), temperature_scores,
--                podcast_episodes(published)
--   - forum_posts/forum_comments: 인증 사용자 작성, 누구나 읽기
--   - moderation_logs, matching_eval, *_runs: 운영자/서비스만 (공개 정책 없음)
--   - 쓰기는 service_role(= RLS 우회) / cron 으로 한정 → anon/authenticated 쓰기 정책 없음
--   - AI 생성물은 status='approved'/'published' 만 공개
-- ============================================================================

alter table articles            enable row level security;
alter table comments            enable row level security;
alter table crossview_pairs     enable row level security;
alter table matching_eval       enable row level security;
alter table issues              enable row level security;
alter table temperature_scores  enable row level security;
alter table temperature_runs    enable row level security;
alter table podcast_episodes    enable row level security;
alter table forum_posts         enable row level security;
alter table forum_comments      enable row level security;
alter table moderation_logs     enable row level security;

-- 공개 읽기 (anon + authenticated) ------------------------------------------
create policy "articles_public_read"
  on articles for select
  to anon, authenticated
  using (true);

create policy "comments_public_read"
  on comments for select
  to anon, authenticated
  using (true);

create policy "crossview_public_read_approved"
  on crossview_pairs for select
  to anon, authenticated
  using (status = 'approved');

create policy "temperature_scores_public_read"
  on temperature_scores for select
  to anon, authenticated
  using (true);

create policy "issues_public_read"
  on issues for select
  to anon, authenticated
  using (true);

create policy "podcast_public_read_published"
  on podcast_episodes for select
  to anon, authenticated
  using (status = 'published');

-- 공론장: 누구나 읽기, 인증 사용자만 작성 ----------------------------------
create policy "forum_posts_public_read"
  on forum_posts for select
  to anon, authenticated
  using (true);

create policy "forum_posts_auth_insert"
  on forum_posts for insert
  to authenticated
  with check (true);

create policy "forum_comments_public_read"
  on forum_comments for select
  to anon, authenticated
  using (true);

create policy "forum_comments_auth_insert"
  on forum_comments for insert
  to authenticated
  with check (true);

-- matching_eval / temperature_runs / moderation_logs:
-- 공개 정책 없음 → anon/authenticated 접근 차단. service_role 만 RLS 우회로 접근.
