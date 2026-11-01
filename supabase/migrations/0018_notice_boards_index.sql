-- ============================================================================
-- 0018 군청 공고 게시판 4종 — 마감일 부분 인덱스 교체 + 기존 category 이관
--
-- 배경(회의 결정 [4·5]): scripts/scrape-oc-notices.ts 가 옥천군청 게시판 4종
--   (공지사항 36 · 고시공고 40 · 입법예고 41 · 채용공고 42)을 수집하면서
--   articles.category 가 '공고' 하나에서 게시판 한글명 4종으로 갈라졌다.
--   0016 의 부분 인덱스는 조건이 category = '공고' 라 새 값들을 하나도 덮지 못한다.
--
-- 이 마이그레이션이 하는 일
--   ① 기존 oc_gov 행(전부 고시공고 게시판에서 온 것)을 category='고시공고',
--      raw.board='gosi' 로 옮긴다 — 스크래퍼 lookback 밖의 옛 공고가
--      /notices·홈 마감 띠에서 사라지지 않게 하는 일회성 이관.
--   ② 마감일 부분 인덱스를 category 조건 대신 kind='notice' 조건으로 다시 만든다.
--      게시판이 더 늘어도 조건이 그대로라 인덱스를 다시 만들 필요가 없다.
--
-- 규약: raw->>'deadline' 로 필터·정렬하는 쿼리는 반드시
--   source='oc_gov' AND kind='notice' 를 함께 걸어야 이 부분 인덱스를 탄다
--   (category IN (...) 는 인덱스 조건을 함축하지 못한다). 해당 쿼리는 두 곳:
--   components/home/action-layer.loadNoticeDeadlines, app/(public)/notices/page.tsx loadNotices.
-- ============================================================================

-- ① 기존 '공고'(= 고시공고 게시판) 행 이관 — 새 스크래퍼가 쓰는 값과 맞춘다
update articles
   set category = '고시공고',
       raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('board', 'gosi')
 where source = 'oc_gov'
   and category = '공고';

-- ② 마감일 부분 인덱스를 조건만 바꿔 다시 만든다(이름은 0016 그대로 유지).
--    조건이 다르면 create ... if not exists 가 갱신해 주지 않으므로 먼저 지운다.
drop index if exists articles_oc_notice_deadline_idx;

create index if not exists articles_oc_notice_deadline_idx
  on articles ((raw->>'deadline'))
  where source = 'oc_gov' and kind = 'notice';
