-- ============================================================================
-- 0016 군청 공고 마감일(raw->>'deadline') 부분 인덱스
--
-- 배경: 홈 마감 띠(components/home/action-layer.loadNoticeDeadlines)와 /notices
--   (app/(public)/notices/page.tsx loadNotices)가 articles 를
--   source='oc_gov' and category='공고' 로 거른 뒤 raw->>'deadline'("YYYY-MM-DD" 텍스트)로
--   >= / is null 필터·정렬한다. jsonb 텍스트 추출은 인덱스가 없으면 매 요청 전체 스캔.
-- 규약: 두 쿼리는 이 부분 인덱스 조건과 **정확히 같은** 필터(source='oc_gov' and
--   category='공고')를 써야 인덱스를 탄다. 필터를 바꾸면 이 인덱스도 함께 바꿀 것.
-- ============================================================================
create index if not exists articles_oc_notice_deadline_idx
  on articles ((raw->>'deadline'))
  where source = 'oc_gov' and category = '공고';
