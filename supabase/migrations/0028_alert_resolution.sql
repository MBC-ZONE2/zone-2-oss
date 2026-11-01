-- 0028_alert_resolution — 시스템 경고 수동 확인 기록 (#189, 2026-10-25)
-- 경고는 만든 코드가 상황 회복을 감지할 때만 resolved 로 바뀌어, 알림성(info) 경고(팟캐 마감 자동 공개 등)는
-- 아무도 걷지 못해 영구히 쌓였다. 관리자가 "확인"으로 해소할 수 있게 누가·언제·어떻게를 남긴다.
--   resolved_by   : 확인한 관리자(auth.users.id). 자동 해소·만료는 null
--   resolved_note : 'manual' | 'expired' | 'auto' | 'bulk-off' 등 짧은 사유
alter table public.system_alerts
  add column if not exists resolved_at   timestamptz,
  add column if not exists resolved_by   uuid,
  add column if not exists resolved_note text;
