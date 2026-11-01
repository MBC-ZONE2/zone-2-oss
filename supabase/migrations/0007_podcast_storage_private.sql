-- ============================================================================
-- 0007_podcast_storage_private — 팟캐스트 오디오 비공개 전환 (Codex 리뷰 P1)
--
-- 0006 은 버킷을 public=true + 전체 SELECT 허용으로 만들었다. 그런데 오디오는
-- 에피소드가 status='review'(검수 대기)일 때 업로드된다. 결과적으로 익명 사용자가
-- podcast_episodes 의 "발행분만 읽기" RLS 를 우회해 초안·실패 오디오를 받을 수
-- 있었다.
--
-- 조치: 버킷을 비공개로 돌리고 공개 read 정책을 제거한다.
--   재생은 /api/podcast/[id]/audio 가 담당한다 — 에피소드가 published 인지
--   확인한 뒤 단기 서명 URL로 리다이렉트한다.
-- ============================================================================

update storage.buckets
   set public = false
 where id = 'podcast';

-- 0006 이 만든 전체 공개 읽기 정책 제거.
-- service_role 은 RLS 를 우회하므로 업로드·서명 URL 발급은 계속 동작한다.
drop policy if exists "podcast_public_read" on storage.objects;

-- 버킷 내부 객체 경로를 보관한다. 서명 URL 발급에 필요하고,
-- audio_url(재생 경로)과 실제 저장 위치를 분리해 둔다.
alter table podcast_episodes
  add column if not exists audio_key text;

comment on column podcast_episodes.audio_key is
  '오디오 객체 경로(버킷 podcast 내부, 예: 2026/07/<id>.mp3). 재생은 /api/podcast/[id]/audio 경유.';
