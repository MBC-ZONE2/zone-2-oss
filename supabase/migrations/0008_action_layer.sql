-- ============================================================================
-- 0008_action_layer — 행동 레이어 2종 (놓치면 손해 · 해결됐어요)
--
-- 참조 프로토타입(콘텐츠팜 연구)의 "행동과 응답을 남기는 인터페이스" 의도를
-- 기존 REQ 기능 위에 추가 레이어로 얹는다(계약 기능 대체 아님 — 사용자 결정).
--
--   deadline_items     : 마감이 있는 지원·신청·안내 (놓치면 손해)
--   resolution_stories : 제보 → 취재 → 기관 응답 추적 결과 (해결됐어요)
--
-- 두 테이블 모두 운영자 수기 큐레이션이다 — 자동 수집 대상이 아니다.
-- 쓰기: service_role 전용(정책 없음 = anon/authenticated 쓰기 불가).
-- 읽기: 공개(anon) — 홈 지면 노출용.
--
-- ⚠️ 번호 주의: 0006·0007 은 PR #61(팟캐스트 스토리지) 브랜치가 사용 중이라
--    이 브랜치는 0008 을 쓴다. 머지 순서와 무관하게 충돌하지 않는다.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 놓치면 손해 — 마감 임박 항목
-- ---------------------------------------------------------------------------
create table deadline_items (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  summary       text,
  /** 핵심 혜택 한 줄 (예: "보험료 55% 지원") */
  benefit_label text,
  /** 분류 태그 (예: "농업·상권", "재난·안전", "의료·돌봄") */
  category      text,
  /** 대상 지역 (예: "옥천군 전체", "옥천읍 · 이원면") */
  region        text,
  deadline      date not null,
  /** 공고문·안내 원문 링크 */
  source_url    text,
  created_at    timestamptz default now()
);

comment on table deadline_items is
  '놓치면 손해 — 마감이 있는 지원·신청·안내. 운영자 수기 등록, 마감 경과분은 홈에서 자동 제외.';

create index deadline_items_deadline_idx on deadline_items (deadline);

alter table deadline_items enable row level security;

create policy "deadline_items_public_read"
  on deadline_items for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 해결됐어요 — 제보 → 취재 → 응답 추적
-- ---------------------------------------------------------------------------
create table resolution_stories (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  /** 경과 한 줄 (예: "상인 제보 7건 → 온도 상승 → 옥천신문 취재 → 군청 답변") */
  timeline     text not null,
  reported_on  date,
  resolved_on  date,
  /** 주민 인용 (선택) */
  quote        text,
  quote_author text,
  source_url   text,
  created_at   timestamptz default now()
);

comment on table resolution_stories is
  '해결됐어요 — 제보가 취재·기관 응답으로 이어진 사례. 운영자 수기 등록.';

alter table resolution_stories enable row level security;

create policy "resolution_stories_public_read"
  on resolution_stories for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 시드 (데모 큐레이션) — 마감일은 상대 날짜라 시연 시점에도 D-day 가 살아 있다.
-- 실운영 항목이 쌓이면 그대로 두거나 지워도 무방하다(홈은 마감 경과분을 숨긴다).
-- ---------------------------------------------------------------------------
insert into deadline_items (title, summary, benefit_label, category, region, deadline) values
  ('마늘·양파 재해보험 가입 지원',
   '보험료 55% 군비 지원. 작년 우박 피해 농가 우선.',
   '보험료 55% 지원', '농업·상권', '옥천군 전체', current_date + 3),
  ('집중호우 대비 — 침수 이력 3개 지점 주의',
   '금구리 지하차도 · 이원면 강변길 · 동이면 농로. 우회로 안내.',
   '양사 확인', '재난·안전', '옥천읍 · 이원면 · 동이면', current_date + 5),
  ('보건지소 화요일 순회진료 변경 신청',
   '혈압·당뇨 정기 처방은 옥천읍 보건소로. 무료 셔틀 신청 가능.',
   '무료 셔틀', '의료·돌봄', '군북면', current_date + 12);

insert into resolution_stories
  (title, timeline, reported_on, resolved_on, quote, quote_author) values
  ('중앙로 상수도 공사, 야간 공사로 전환',
   '상인 제보 7건 → 온도 상승 → 옥천신문 취재 → 군청 ''야간 전환'' 답변',
   current_date - 38, current_date - 26,
   '여기 올리니까 진짜 되네요.', '제보자 김OO(카페 운영)'),
  ('버스 651번 첫차 20분 앞당김',
   '통근 주민 질문 12건 → 공론장 의제화 → MBC충북 보도 → 군 교통과 회신',
   current_date - 55, current_date - 31,
   '새벽 조기출근이 편해졌어요.', '이용 주민 박OO');
