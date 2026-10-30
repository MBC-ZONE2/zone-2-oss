-- 0020: 팟캐 회차 내용 요약 헤드라인 (Figma 코멘트 #4, 2026-09-13)
--
-- episodes.title 은 "오늘의 충북 9월 8일" 처럼 날짜라 목록에서 무슨 회차인지 알 수 없다.
-- 대본에서 codex 가 지은 편집 헤드라인("52년 만의 그린벨트 해제, 옥천은 무엇을 얻고 무엇을 내주나")
-- 을 여기 저장하고 화면 제목 자리에 쓴다. title 은 그대로(회차 식별·관리자 큐).
-- null 이면 화면은 lib/podcast/script.episodeHeadline 휴리스틱으로 폴백한다.
-- 생성: lib/ai/podcast-headline.ts (회차 생성 시 + 크론이 빈 행을 매시 보충).

alter table podcast_episodes
  add column if not exists headline text;

comment on column podcast_episodes.headline is
  '내용 요약 헤드라인(codex, 40자 이내). null 이면 화면은 대본 휴리스틱으로 폴백';

-- 목록 폴백 조회용(빈 헤드라인 보충 크론): 대부분 채워지면 부분 인덱스는 거의 비어 있다
create index if not exists podcast_episodes_headline_null_idx
  on podcast_episodes (created_at desc)
  where headline is null and status <> 'failed';
