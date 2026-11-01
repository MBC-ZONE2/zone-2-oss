-- ============================================================================
-- 0006_oc_gov_notice_podcast_storage — 한 파일에 두 묶음(① 공고 enum 확장 ② 팟캐스트 오디오 버킷)
--
-- 원래 0006_oc_gov_notice.sql 과 0006_podcast_storage.sql 두 파일이 같은 버전 번호 0006 을 썼다.
-- Supabase CLI 는 supabase_migrations.schema_migrations(version PK) 에 버전을 기록하므로 새 DB 에서
-- `supabase start`/`db reset` 이 두 번째 0006 에서 duplicate key 로 멈췄다(2026-10-30 공개 리포 설치 검증).
-- 뒤 번호를 전부 밀면 문서·주석의 번호 참조가 어긋나므로 두 파일을 합쳐 0006 하나로 둔다.
-- 이미 적용된 DB 에는 영향이 없다(두 묶음 모두 멱등).
-- ============================================================================

-- ─── ① 옥천군청 공고 수집 대비 enum 확장 (구 0006_oc_gov_notice) ───
-- 0006: 옥천군청 공고 수집(scrape-oc-notices) 대비 enum 확장
--   - media_source.oc_gov : 옥천군청(oc.go.kr) 게시판 출처
--   - article_kind.notice : 고시·공고(지원사업·모집) — 뉴스가 아니므로 크로스뷰 매칭 제외
alter type media_source add value if not exists 'oc_gov';
alter type article_kind add value if not exists 'notice';

-- ─── ② 팟캐스트 오디오 스토리지 버킷 (구 0006_podcast_storage) ───
-- ============================================================================
-- 0006_podcast_storage — 팟캐스트 오디오 스토리지 버킷 (REQ-010 · GH#16)
--
-- 오디오 저장소는 Supabase Storage 버킷 'podcast'(lib/podcast/storage.ts). 원안의 R2 분기는 쓰지 않는다.
--
-- 공개 읽기: 팟캐스트는 공개 콘텐츠이므로 익명 read 를 허용한다.
-- 쓰기: service_role 만 (수집·생성 크론). 일반 사용자는 업로드할 수 없다.
-- ============================================================================

-- 버킷 생성 (멱등)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'podcast',
  'podcast',
  true,                                    -- 공개 읽기(CDN 유사 접근)
  52428800,                                -- 50MiB — config.toml file_size_limit 과 동일
  array['audio/mpeg', 'audio/mp3']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- RLS 정책 — storage.objects 는 기본 RLS 활성 상태다.
-- ---------------------------------------------------------------------------

-- 익명 포함 전체 읽기 (공개 콘텐츠)
drop policy if exists "podcast_public_read" on storage.objects;
create policy "podcast_public_read"
  on storage.objects for select
  using (bucket_id = 'podcast');

-- 쓰기/수정/삭제는 service_role 전용.
-- service_role 은 RLS 를 우회하므로 별도 정책을 만들지 않는다.
-- (정책을 만들지 않음 = anon/authenticated 는 insert·update·delete 불가)
