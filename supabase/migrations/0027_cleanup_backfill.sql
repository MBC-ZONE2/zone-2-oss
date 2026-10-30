-- 0027_cleanup_backfill — 앞 파일들이 추가한 enum 값으로 기존 감사 로그 행을 옮긴다. 멱등.
-- 새 enum 값은 추가한 트랜잭션(=같은 마이그레이션 파일) 안에서 쓸 수 없어(PG 55P04) 백필은 뒤 파일에서 한다.

-- ① 0023 의 'auto_publish' — f204ea3 의 자동 공개가 action='approve' + details.autoPublish 로 남긴 행 (#185)
update public.moderation_logs
   set action = 'auto_publish'
 where action = 'approve'
   and details ? 'autoPublish';

-- ② 0026 의 'cleanup' — 운영 정리 행 (#189)
update public.moderation_logs
   set action = 'cleanup'
 where action = 'reject'
   and operator is null
   and details->>'kind' in ('dup_story', 'non_story');
