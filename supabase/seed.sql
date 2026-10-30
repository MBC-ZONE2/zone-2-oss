-- ============================================================================
-- supabase/seed.sql — 합성 시드 (#184 공개 리포 기획 ② "10분 규칙", 2026-10-26)
--
-- `supabase db reset` 이 마이그레이션 뒤 자동으로 넣는다(supabase/config.toml [db.seed]). 키·수집 없이도
-- 홈·크로스뷰·온도계·팟캐·공론장·공고가 찬 상태로 뜨게 하는 **가상의** 데이터다.
--   · 전부 창작이다. 실존 인물·기관·기사가 아니며 지명·매체명을 쓰지 않는다(매체 표시 이름은 config/region 이 붙인다).
--   · external_id 는 demo-seed-* — 수집 파이프라인은 demo- 접두 행을 증분 기준(high-water)에서 뺀다.
--   · id 는 md5 기반 고정 UUID 라 여러 번 돌려도 같은 행이고 ON CONFLICT DO NOTHING 으로 멱등이다.
--   · 운영 DB 에는 넣지 않는다(운영은 실수집). 지우려면: delete from articles where external_id like 'demo-seed-%' 등.
-- 팟캐 회차는 음성 파일이 없어 "오디오 준비 중"으로 보인다(대본·헤드라인은 있다).
-- ============================================================================

-- 고정 UUID 는 md5('zone2-seed:<키>')::uuid 를 그대로 쓴다. 임시 함수(pg_temp)는 Supabase CLI 가 시드를 배치로 보낼 때 "schema pg_temp does not exist" 로 깨진다(2026-10-30 새 DB 설치 검증).

-- ── 1. 기사 — 6개 사안 × (광역 macro / 기초 micro) ─────────────────────────────
insert into public.articles (id, source, kind, external_id, url, title, body, category, keywords, published_at, raw)
values
 (md5('zone2-seed:a-bus-macro')::uuid,   'mbc_cb',  'news', 'demo-seed-bus-macro',   'https://example.org/macro/bus',   '도, 농촌 버스 노선 통합 추진… "효율화로 적자 30% 감축"', '도가 농촌 지역 버스 노선 120개를 80개로 통합하는 개편안을 내놨다. 중복 노선을 줄여 연간 적자를 30% 줄이고 수요응답형 버스를 도입한다는 계획이다. 시군 의견 수렴을 거쳐 내년 상반기 시행한다.', '교통', array['버스','노선 통합','수요응답형'], now() - interval '20 hours', '{"_seed": true}'),
 (md5('zone2-seed:a-bus-micro')::uuid,   'okinews', 'news', 'demo-seed-bus-micro',   'https://example.org/micro/bus',   '"하루 두 대도 없어진다니" — 노선 통합에 마을 어르신들 발 동동', '노선 통합안대로면 면 소재지 밖 다섯 마을은 정류장이 사라진다. 아침 병원 가는 유일한 버스가 끊긴다는 소식에 주민들이 군청 앞에 모였다. 군은 "마을버스 대안을 검토 중"이라고만 답했다.', '교통', array['버스','마을','정류장'], now() - interval '18 hours', '{"_seed": true}'),
 (md5('zone2-seed:a-farm-macro')::uuid,  'mbc_cb',  'news', 'demo-seed-farm-macro',  'https://example.org/macro/farm',  '폭염에 과수 피해 3천㏊… 도, 재해보험 특별 지원', '올여름 기록적 폭염으로 도내 과수 피해 면적이 3천 헥타르를 넘었다. 도는 재해보험 자부담을 절반으로 낮추는 특별 지원책을 발표했다.', '경제', array['폭염','과수','재해보험'], now() - interval '26 hours', '{"_seed": true}'),
 (md5('zone2-seed:a-farm-micro')::uuid,  'okinews', 'news', 'demo-seed-farm-micro',  'https://example.org/micro/farm',  '복숭아밭 절반 낙과… "보험 들어도 수확 전 피해는 안 쳐준다"', '한 과수원은 올해 복숭아 절반을 땅에서 주웠다. 재해보험에 들었지만 수확 전 피해 산정 기준이 까다로워 보상은 기대의 삼분의 일이다. 농민들은 산정 기준 개선을 요구했다.', '경제', array['복숭아','낙과','보험'], now() - interval '24 hours', '{"_seed": true}'),
 (md5('zone2-seed:a-school-macro')::uuid,'mbc_cb',  'news', 'demo-seed-school-macro','https://example.org/macro/school','도교육청, 소규모 고교 3곳 통합 확정… 2028년 개교', '도교육청이 학생 수 60명 미만 고교 세 곳을 통합해 기숙형 거점 고교로 만든다. 통합 학교는 2028년 3월 문을 연다.', '교육', array['고교 통합','거점 고교','도교육청'], now() - interval '40 hours', '{"_seed": true}'),
 (md5('zone2-seed:a-school-micro')::uuid,'okinews', 'news', 'demo-seed-school-micro','https://example.org/micro/school','"우리 동네 마지막 고등학교" — 통합 발표에 학부모 100명 서명', '통합 대상이 된 고교의 학부모들이 서명을 모아 교육청에 전달했다. 통학 거리가 40분 늘고 지역 인구 유출이 빨라진다는 걱정이 크다.', '교육', array['고등학교','학부모','통학'], now() - interval '38 hours', '{"_seed": true}'),
 (md5('zone2-seed:a-er-macro')::uuid,    'mbc_cb',  'news', 'demo-seed-er-macro',    'https://example.org/macro/er',    '도내 응급실 야간 공백 지역 4곳… 공공의료 확충안 발표', '도는 야간 응급 진료가 불가능한 지역이 네 곳이라고 밝히고 공공병원 의사 정원을 늘리는 확충안을 내놨다.', '의료', array['응급실','공공의료','야간 진료'], now() - interval '50 hours', '{"_seed": true}'),
 (md5('zone2-seed:a-er-micro')::uuid,    'okinews', 'news', 'demo-seed-er-micro',    'https://example.org/micro/er',    '밤 10시 넘으면 40분 달려야… 군민 "응급실 지켜달라"', '군 유일의 응급실이 밤 10시에 문을 닫은 지 석 달째다. 심야 환자는 이웃 시까지 40분을 달려야 한다. 군민 서명 운동이 시작됐다.', '의료', array['응급실','심야','서명'], now() - interval '48 hours', '{"_seed": true}'),
 (md5('zone2-seed:a-river-macro')::uuid, 'mbc_cb',  'news', 'demo-seed-river-macro', 'https://example.org/macro/river', '하천 정비 2단계 착공… 도 "상습 침수 구간 해소"', '도가 상습 침수 구간 12㎞의 하천 정비 2단계 공사를 시작했다. 2029년까지 제방을 높이고 저류지를 만든다.', '환경', array['하천 정비','침수','저류지'], now() - interval '70 hours', '{"_seed": true}'),
 (md5('zone2-seed:a-river-micro')::uuid, 'okinews', 'news', 'demo-seed-river-micro', 'https://example.org/micro/river', '정비 공사에 둔치 텃밭 300평 사라져… 주민 "대체지 달라"', '하천 정비 구간에 들어간 둔치 텃밭을 가꾸던 주민 20여 명이 대체 부지를 요구했다. 군은 "검토하겠다"고 했다.', '환경', array['둔치','텃밭','대체지'], now() - interval '68 hours', '{"_seed": true}'),
 (md5('zone2-seed:a-fest-macro')::uuid,  'mbc_cb',  'news', 'demo-seed-fest-macro',  'https://example.org/macro/fest',  '가을 축제 관광객 25만 명… 도 "지역 경제 효과 300억"', '도내 가을 축제에 연인원 25만 명이 다녀갔다. 도는 숙박·음식 매출 등 경제 효과를 300억 원으로 추산했다.', '문화', array['축제','관광객','경제 효과'], now() - interval '90 hours', '{"_seed": true}'),
 (md5('zone2-seed:a-fest-micro')::uuid,  'okinews', 'news', 'demo-seed-fest-micro',  'https://example.org/micro/fest',  '축제 끝난 자리, 상인들 "매출은 외지 푸드트럭이 가져갔다"', '축제 기간 읍내 식당 매출은 평소와 비슷했다는 상인회 조사가 나왔다. 외부 푸드트럭 위주 운영이 원인으로 꼽혔다.', '문화', array['축제','상인','푸드트럭'], now() - interval '88 hours', '{"_seed": true}')
on conflict do nothing;

-- 군청 공고(공지사항·고시공고·입법예고·채용공고) — raw.deadline 이 "YYYY-MM-DD" 면 마감 밴드에 오른다
insert into public.articles (id, source, kind, external_id, url, title, body, category, keywords, published_at, raw)
values
 (md5('zone2-seed:n-1')::uuid, 'oc_gov', 'notice', 'demo-seed-notice-1', 'https://example.org/gov/1', '2027년 마을공동체 지원사업 공모', '마을 단위 공동체 활동을 지원하는 사업의 참여 단체를 모집한다.', '공지사항', null, now() - interval '2 days', jsonb_build_object('_seed', true, 'dept', '자치행정과', 'deadline', to_char(now() + interval '5 days', 'YYYY-MM-DD'), 'period', '접수 ~' || to_char(now() + interval '5 days', 'MM.DD'))),
 (md5('zone2-seed:n-2')::uuid, 'oc_gov', 'notice', 'demo-seed-notice-2', 'https://example.org/gov/2', '하천 정비 2단계 공사 구간 통행 제한 고시', '정비 공사 기간 둔치 산책로 일부 구간의 통행을 제한한다.', '고시공고', null, now() - interval '3 days', jsonb_build_object('_seed', true, 'dept', '안전건설과', 'deadline', to_char(now() + interval '12 days', 'YYYY-MM-DD'))),
 (md5('zone2-seed:n-3')::uuid, 'oc_gov', 'notice', 'demo-seed-notice-3', 'https://example.org/gov/3', '농촌 버스 노선 운영 조례 일부개정조례안 입법예고', '수요응답형 버스 도입 근거를 담은 조례 개정안에 대한 의견을 받는다.', '입법예고', null, now() - interval '1 day', jsonb_build_object('_seed', true, 'dept', '교통과', 'deadline', to_char(now() + interval '19 days', 'YYYY-MM-DD'))),
 (md5('zone2-seed:n-4')::uuid, 'oc_gov', 'notice', 'demo-seed-notice-4', 'https://example.org/gov/4', '보건소 야간진료 전담 간호직 기간제 채용', '야간 진료 운영을 위한 간호직 기간제 근로자를 채용한다.', '채용공고', null, now() - interval '4 days', jsonb_build_object('_seed', true, 'dept', '보건소', 'deadline', to_char(now() + interval '2 days', 'YYYY-MM-DD')))
on conflict do nothing;

-- ── 2. 댓글(광역 기사에 달린 주민 반응) — 작성자는 해시만, 감정값 있음 ─────────────
insert into public.comments (id, source, article_id, external_id, body, author_hash, like_count, sentiment, published_at)
values
 (md5('zone2-seed:c-bus-1')::uuid, 'mbc_cb', md5('zone2-seed:a-bus-macro')::uuid, 'demo-seed-c-bus-1', '노선 통합은 찬성인데 배차 간격이 관건이죠. 출퇴근 시간만이라도 늘려 주세요.', md5('seed-author-1'), 14, 'neu', now() - interval '19 hours'),
 (md5('zone2-seed:c-bus-2')::uuid, 'mbc_cb', md5('zone2-seed:a-bus-macro')::uuid, 'demo-seed-c-bus-2', '효율화 좋은데 외곽 주민 발은 어쩌라고요. 대책이 같이 나와야 말이 되죠.', md5('seed-author-2'), 22, 'neg', now() - interval '18 hours'),
 (md5('zone2-seed:c-bus-3')::uuid, 'mbc_cb', md5('zone2-seed:a-bus-macro')::uuid, 'demo-seed-c-bus-3', '수요응답형 버스 도입은 반갑네요. 잘 굴러갔으면.', md5('seed-author-3'), 6, 'pos', now() - interval '17 hours'),
 (md5('zone2-seed:c-bus-4')::uuid, 'mbc_cb', md5('zone2-seed:a-bus-macro')::uuid, 'demo-seed-c-bus-4', '하루 두 대면 병원도 못 갑니다. 진짜 심각해요.', md5('seed-author-4'), 17, 'neg', now() - interval '16 hours'),
 (md5('zone2-seed:c-farm-1')::uuid, 'mbc_cb', md5('zone2-seed:a-farm-macro')::uuid, 'demo-seed-c-farm-1', '자부담 절반이면 숨통은 트이겠네요. 산정 기준도 손봐 주세요.', md5('seed-author-5'), 9, 'pos', now() - interval '25 hours'),
 (md5('zone2-seed:c-farm-2')::uuid, 'mbc_cb', md5('zone2-seed:a-farm-macro')::uuid, 'demo-seed-c-farm-2', '보험 들어도 수확 전 피해는 거의 안 쳐줍니다. 현장을 좀 보세요.', md5('seed-author-6'), 19, 'neg', now() - interval '24 hours'),
 (md5('zone2-seed:c-school-1')::uuid, 'mbc_cb', md5('zone2-seed:a-school-macro')::uuid, 'demo-seed-c-school-1', '학생 수가 그 정도면 통합이 맞다고 봅니다. 기숙사만 제대로 지어 주세요.', md5('seed-author-7'), 8, 'neu', now() - interval '39 hours'),
 (md5('zone2-seed:c-school-2')::uuid, 'mbc_cb', md5('zone2-seed:a-school-macro')::uuid, 'demo-seed-c-school-2', '학교 없어지면 젊은 사람 더 떠납니다. 숫자만 보지 마세요.', md5('seed-author-8'), 25, 'neg', now() - interval '38 hours'),
 (md5('zone2-seed:c-er-1')::uuid, 'mbc_cb', md5('zone2-seed:a-er-macro')::uuid, 'demo-seed-c-er-1', '의사 정원 늘린다고 오나요. 처우부터 바꿔야죠.', md5('seed-author-9'), 12, 'neg', now() - interval '47 hours'),
 (md5('zone2-seed:c-er-2')::uuid, 'mbc_cb', md5('zone2-seed:a-er-macro')::uuid, 'demo-seed-c-er-2', '밤에 아프면 40분 운전해야 하는 현실, 빨리 해결되길.', md5('seed-author-10'), 15, 'neg', now() - interval '46 hours'),
 (md5('zone2-seed:c-river-1')::uuid, 'mbc_cb', md5('zone2-seed:a-river-macro')::uuid, 'demo-seed-c-river-1', '여름마다 잠기던 곳인데 드디어 하네요. 공사 중 안전도 신경 써 주세요.', md5('seed-author-11'), 7, 'pos', now() - interval '69 hours'),
 (md5('zone2-seed:c-fest-1')::uuid, 'mbc_cb', md5('zone2-seed:a-fest-macro')::uuid, 'demo-seed-c-fest-1', '300억이면 동네 식당에도 좀 돌아갔으면 좋겠네요.', md5('seed-author-12'), 5, 'neu', now() - interval '87 hours')
on conflict do nothing;

-- ── 3. 사안과 공론 온도 — 직전 배치(prev_rank 용)와 현재 배치 ─────────────────────
insert into public.issues (id, label, keywords, created_at) values
 (md5('zone2-seed:i-bus')::uuid,    '농촌 버스 노선 통합', array['버스','노선 통합','정류장','수요응답형'], now() - interval '2 days'),
 (md5('zone2-seed:i-school')::uuid, '소규모 고교 통합', array['고교 통합','고등학교','학부모','거점 고교'], now() - interval '2 days'),
 (md5('zone2-seed:i-er')::uuid,     '응급실 야간 공백', array['응급실','심야','야간 진료','공공의료'], now() - interval '2 days'),
 (md5('zone2-seed:i-farm')::uuid,   '폭염 과수 피해 보상', array['폭염','과수','재해보험','낙과'], now() - interval '2 days'),
 (md5('zone2-seed:i-river')::uuid,  '하천 정비와 둔치 텃밭', array['하천 정비','둔치','텃밭','침수'], now() - interval '2 days')
on conflict do nothing;

insert into public.temperature_scores (id, issue_id, temperature, frequency, sentiment_var, topic_conc, rank, prev_rank, computed_at) values
 -- 직전 배치(30분 전)
 (md5('zone2-seed:t0-bus')::uuid,    md5('zone2-seed:i-bus')::uuid,    58,   40, 60, 70, 2, 3, now() - interval '30 minutes'),
 (md5('zone2-seed:t0-school')::uuid, md5('zone2-seed:i-school')::uuid, 61,   45, 62, 75, 1, 1, now() - interval '30 minutes'),
 (md5('zone2-seed:t0-er')::uuid,     md5('zone2-seed:i-er')::uuid,     50,   30, 55, 65, 3, 2, now() - interval '30 minutes'),
 (md5('zone2-seed:t0-farm')::uuid,   md5('zone2-seed:i-farm')::uuid,   44,   25, 50, 60, 4, 4, now() - interval '30 minutes'),
 (md5('zone2-seed:t0-river')::uuid,  md5('zone2-seed:i-river')::uuid,  38,   20, 40, 55, 5, 5, now() - interval '30 minutes'),
 -- 현재 배치
 (md5('zone2-seed:t1-bus')::uuid,    md5('zone2-seed:i-bus')::uuid,    66,   48, 64, 72, 1, 2, now()),
 (md5('zone2-seed:t1-school')::uuid, md5('zone2-seed:i-school')::uuid, 59,   44, 60, 74, 2, 1, now()),
 (md5('zone2-seed:t1-er')::uuid,     md5('zone2-seed:i-er')::uuid,     53,   33, 57, 66, 3, 3, now()),
 (md5('zone2-seed:t1-farm')::uuid,   md5('zone2-seed:i-farm')::uuid,   46.5, 27, 52, 61, 4, 4, now()),
 (md5('zone2-seed:t1-river')::uuid,  md5('zone2-seed:i-river')::uuid,  39,   21, 41, 56, 5, 5, now())
on conflict do nothing;

-- ── 4. 크로스뷰 — 6쌍 모두 양측 확인·승인(published_at 은 0030 트리거) ───────────────
insert into public.crossview_pairs (id, article_macro, article_micro, similarity, match_score, summary_macro, summary_micro, reading_point, card_headline, card_data, status, confirmations)
select md5('zone2-seed:' || 'p-' || t.key)::uuid, md5('zone2-seed:' || 'a-' || t.key || '-macro')::uuid, md5('zone2-seed:' || 'a-' || t.key || '-micro')::uuid, 0.86, 0.92,
       t.sm, t.sn, t.rp, t.head,
       jsonb_build_object('headline', t.head, 'slides', jsonb_build_array(
         jsonb_build_object('kind','cover','title', t.head, 'body', t.rp),
         jsonb_build_object('kind','macro','title', (select title from public.articles where id = md5('zone2-seed:' || 'a-' || t.key || '-macro')::uuid), 'body', t.sm),
         jsonb_build_object('kind','micro','title', (select title from public.articles where id = md5('zone2-seed:' || 'a-' || t.key || '-micro')::uuid), 'body', t.sn),
         jsonb_build_object('kind','point','title','읽는 점','body', t.rp))),
       'approved',
       jsonb_build_object('okinews', jsonb_build_object('by', null, 'at', (now() - interval '3 hours')::text), 'mbc', jsonb_build_object('by', null, 'at', (now() - interval '2 hours')::text))
from (values
 ('bus',    '광역은 노선 120→80 통합과 적자 30% 감축이라는 숫자로 개편을 설명한다.', '기초는 정류장이 사라지는 다섯 마을과 병원 가는 유일한 버스를 비춘다.', '같은 개편안을 광역은 재정 효율로, 기초는 끊기는 발로 읽는다. 빠진 것은 대안의 시한이다.', '광역은 적자 감축, 기초는 끊기는 발'),
 ('farm',   '광역은 피해 면적 3천㏊와 자부담 절반 지원이라는 정책을 전한다.', '기초는 낙과 절반과 보상 삼분의 일이라는 한 과수원의 셈을 보여 준다.', '지원 규모보다 산정 기준이 쟁점이다. 두 기사를 겹치면 "들어도 못 받는 보험"이 보인다.', '광역은 지원책, 기초는 못 받는 보험'),
 ('school', '광역은 통합 확정과 2028년 개교 일정, 기숙형 거점 고교라는 모델을 전한다.', '기초는 서명 100명과 통학 40분, 인구 유출 우려를 전한다.', '교육청의 효율과 지역의 존속이 맞선다. 통학 지원과 기숙사 계획이 구체화돼야 논의가 진전된다.', '광역은 거점 고교, 기초는 마지막 학교'),
 ('er',     '광역은 야간 공백 지역 4곳과 의사 정원 확대라는 확충안을 전한다.', '기초는 밤 10시 이후 40분 이동과 석 달째 공백, 서명 운동을 전한다.', '정원을 늘려도 올 의사가 있느냐가 핵심이다. 처우와 당직 체계가 함께 설계돼야 한다.', '광역은 정원 확대, 기초는 40분 거리'),
 ('river',  '광역은 침수 구간 12㎞ 정비와 2029년 완공 일정을 전한다.', '기초는 사라지는 둔치 텃밭 300평과 대체지 요구를 전한다.', '안전 사업이 생활 공간을 밀어낸다. 대체 부지 약속이 공사 전에 나와야 갈등이 줄어든다.', '광역은 침수 해소, 기초는 사라지는 텃밭'),
 ('fest',   '광역은 관광객 25만 명과 경제 효과 300억 원을 전한다.', '기초는 읍내 식당 매출이 평소와 같았다는 상인회 조사를 전한다.', '총량의 성공과 분배의 실패가 한 축제에 있다. 다음 축제의 지표를 바꿔야 할 때다.', '광역은 300억 효과, 기초는 제자리 매출')
) as t(key, sm, sn, rp, head)
on conflict do nothing;

-- ── 5. 팟캐 회차 — 공개 상태, 음성 없음(대본·헤드라인만) ────────────────────────────
insert into public.podcast_episodes (id, title, headline, script, audio_url, duration_sec, status, scheduled_for, published_at, source_refs, confirmations)
values (md5('zone2-seed:ep-1')::uuid, '오늘의 브리핑 (합성 시드)', '버스 노선 통합 논란, 고교 통합 확정, 응급실 야간 공백',
 E'안녕하십니까. 두 매체의 보도와 주민의 목소리를 함께 전하는 오늘의 브리핑입니다.\n\n먼저 오늘의 헤드라인입니다. 도가 농촌 버스 노선 통합안을 내놓은 가운데, 정류장이 사라지는 마을 주민들이 군청 앞에 모였습니다. 도교육청은 소규모 고교 세 곳의 통합을 확정했고, 학부모 100명이 서명을 전달했습니다. 응급실 야간 공백 지역이 네 곳으로 확인됐습니다.\n\n첫 번째 사안입니다. 광역 매체는 노선 120개를 80개로 줄여 적자를 30% 감축한다는 숫자에 주목했습니다. 반면 기초 매체는 아침 병원 가는 유일한 버스가 끊기는 다섯 마을을 찾았습니다. 같은 개편안을 한쪽은 재정으로, 다른 쪽은 발로 읽은 셈입니다. 댓글에서는 "효율화는 좋지만 대책이 같이 나와야 한다"는 의견이 가장 많은 공감을 받았습니다.\n\n두 번째, 고교 통합입니다. 광역 매체는 2028년 기숙형 거점 고교 개교 일정을 전했고, 기초 매체는 통학 거리가 40분 늘어난다는 학부모의 걱정을 전했습니다.\n\n세 번째, 응급실입니다. 도는 의사 정원 확대를 약속했지만, 주민들은 "정원을 늘려도 올 의사가 있느냐"고 묻습니다.\n\n이어서 지역 소식입니다. 복숭아밭 절반이 낙과한 과수원의 보험 보상은 기대의 삼분의 일에 그쳤습니다. 하천 정비 공사로 둔치 텃밭 300평이 사라지게 되자 주민들이 대체 부지를 요구했습니다. 축제가 끝난 읍내 상인들은 매출이 평소와 같았다고 전했습니다.\n\n오늘의 브리핑은 여기까지입니다. 내일 또 전하겠습니다.',
 null, 410, 'published', current_date, now() - interval '6 hours',
 jsonb_build_object('articleIds', jsonb_build_array(md5('zone2-seed:a-bus-macro')::uuid, md5('zone2-seed:a-bus-micro')::uuid, md5('zone2-seed:a-school-macro')::uuid, md5('zone2-seed:a-er-macro')::uuid), 'commentIds', jsonb_build_array(md5('zone2-seed:c-bus-2')::uuid), 'qaHits', '[]'::jsonb, '_seed', true),
 jsonb_build_object('okinews', jsonb_build_object('by', null, 'at', (now() - interval '7 hours')::text), 'mbc', jsonb_build_object('by', null, 'at', (now() - interval '7 hours')::text)))
on conflict do nothing;

-- ── 6. 공론장 — 글 4 · 댓글 3 (비밀번호 해시 없음 → 수정·삭제 불가, 시연용) ───────────
insert into public.forum_posts (id, article_id, author_hash, display_name, title, body, like_count, created_at)
values
 (md5('zone2-seed:f-1')::uuid, md5('zone2-seed:a-bus-micro')::uuid, md5('seed-f-1'), '안남 사는 사람', '노선 통합, 마을버스라도 먼저 정해 주세요', '정류장이 없어지는 마을부터 마을버스를 정해 놓고 통합해야 순서가 맞습니다. 발표만 먼저 하니 어르신들이 불안해합니다.', 12, now() - interval '15 hours'),
 (md5('zone2-seed:f-2')::uuid, null, md5('seed-f-2'), null, '응급실 야간 진료, 서명에 동참해 주세요', '밤에 아이가 아팠을 때 40분을 달려 봤습니다. 서명 용지는 읍내 약국 세 곳에 있습니다.', 20, now() - interval '30 hours'),
 (md5('zone2-seed:f-3')::uuid, md5('zone2-seed:a-school-micro')::uuid, md5('seed-f-3'), '졸업생', '통합 반대만 할 게 아니라 기숙사 조건을 걸자', '통합이 정해졌다면 통학버스와 기숙사 조건을 못 박는 게 현실적입니다. 교육청이 약속을 문서로 내게 합시다.', 7, now() - interval '36 hours'),
 (md5('zone2-seed:f-4')::uuid, md5('zone2-seed:a-river-micro')::uuid, md5('seed-f-4'), '텃밭 20년', '둔치 텃밭 대체지, 공사 전에 정해 주십시오', '공사가 끝나면 잊힙니다. 대체 부지를 공사 전에 지정해 달라고 군의회에 건의서를 냈습니다.', 9, now() - interval '60 hours')
on conflict do nothing;

insert into public.forum_comments (id, post_id, author_hash, display_name, body, created_at)
values
 (md5('zone2-seed:fc-1')::uuid, md5('zone2-seed:f-1')::uuid, md5('seed-fc-1'), null, '동감입니다. 수요응답형이면 전화 예약이 어르신들께 어려울 수도 있어요.', now() - interval '14 hours'),
 (md5('zone2-seed:fc-2')::uuid, md5('zone2-seed:f-2')::uuid, md5('seed-fc-2'), '읍내 약사', '약국에 서명 용지 비치했습니다. 많이들 오세요.', now() - interval '28 hours'),
 (md5('zone2-seed:fc-3')::uuid, md5('zone2-seed:f-3')::uuid, md5('seed-fc-3'), null, '통학버스 운행 시간표부터 받아 봐야겠네요.', now() - interval '35 hours')
on conflict do nothing;

-- ── 7. 검수 로그(승인 기록) — 대시보드·검증지표가 비지 않게 ────────────────────────
insert into public.moderation_logs (id, target, target_id, action, operator, details)
select md5('zone2-seed:' || 'log-' || p.id::text)::uuid, 'crossview', p.id, 'approve', null, '{"_seed": true}'::jsonb
from public.crossview_pairs p where p.id in (md5('zone2-seed:p-bus')::uuid, md5('zone2-seed:p-farm')::uuid, md5('zone2-seed:p-school')::uuid, md5('zone2-seed:p-er')::uuid, md5('zone2-seed:p-river')::uuid, md5('zone2-seed:p-fest')::uuid)
on conflict do nothing;
