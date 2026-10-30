-- ============================================================================
-- 0026_cleanup_action — 운영 정리(중복 페어 통합·기사 아닌 클립 제외)를 감사 로그에서 별도 액션으로 (#189)
--
-- #188(f10bca2) 의 scripts/merge-duplicate-pairs 가 통합되는 쪽 페어를 action='reject' + operator null +
-- details.kind='dup_story'(또는 'non_story') 로 남겼다. 검수 승인율(검증지표 ⑤ = 운영자가 검수해 승인한 비율)은
-- action 만 보므로 10/19 정리 7건이 "반려"로 섞여 크로스뷰 승인율이 100% → 56.3% 로 보였다(PMO 재실측).
-- 0023(auto_publish) 과 같은 방식으로 'cleanup' 을 추가한다. 기존 행 이동은 0027 — enum 값은 같은 트랜잭션 안에서
-- 쓸 수 없어(supabase db push 는 파일 단위 트랜잭션) 파일을 나눈다. psql -f 로 차례로 적용해도 같다.
-- 상세 페이지 리다이렉트·감사 로그 화면은 details.kind 를 보므로 그대로 동작한다(코드도 action in (reject, cleanup) 으로 넓힘).
-- ============================================================================

alter type moderation_action add value if not exists 'cleanup';
