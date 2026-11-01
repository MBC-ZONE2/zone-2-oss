-- ============================================================================
-- ZONE-2 관리자 검수 고도화 (0005_admin_review)
-- 출처: REQ(F7) — 관리자 대시보드 (이슈 #34 확정 기획, Admin PRD Editor 범위)
--
-- 1) moderation_action enum 에 'edit_approve' 추가
--      - 수정승인(인라인 편집 후 승인) 액션. 기존 approve/reject 와 구분.
--      - ADD VALUE IF NOT EXISTS: 재실행/부분적용 안전.
-- 2) moderation_logs.details jsonb 추가
--      - 수정승인 before/after diff, 롤백 사유·전이 등 구조화 기록.
--      - 기존 reason(text) 은 자유 사유 텍스트로 유지, 구조화 데이터는 details 로.
-- ============================================================================

-- 1) 수정승인 액션 값 추가 (트랜잭션 밖에서도 안전하도록 IF NOT EXISTS)
alter type moderation_action add value if not exists 'edit_approve';

-- 2) 구조화 감사 기록 컬럼
alter table moderation_logs
  add column if not exists details jsonb;
