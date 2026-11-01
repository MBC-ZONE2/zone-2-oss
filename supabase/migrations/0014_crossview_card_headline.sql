-- 크로스뷰 카드뉴스 히어로용 짧은 대조 헤드라인(2줄 이내). readingPoint는 분석 문장이라
-- 히어로에 무거워, 별도로 codex가 생성한 압축 헤드라인을 저장한다.
alter table crossview_pairs add column if not exists card_headline text;
