-- 팟캐스트 재생 카운트 (#117) — KPI "월 500회 재생" 측정 수단.
-- 단순 카운터 1개면 이 규모(월 수백 회)엔 충분하다(이벤트 테이블 불필요).
-- 재생 시작 이벤트는 클라이언트가 에피소드당 세션 1회만 보내고(자동재생·프리로드
-- 부풀림 방지), 서버는 아래 함수로 원자적으로 +1 한다.

alter table podcast_episodes
  add column if not exists play_count integer not null default 0;

comment on column podcast_episodes.play_count is
  '누적 재생 시작 수(클라이언트 play 이벤트, 에피소드당 세션 1회). KPI 월 500회 측정용.';

-- 원자적 증가(경합 안전). 공개된 에피소드에만 카운트한다.
-- security definer: 익명 재생도 카운트되도록 소유자 권한으로 실행하되, 본문은
-- 단순 +1 로만 제한해 남용 여지를 없앤다.
create or replace function increment_podcast_play(ep uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update podcast_episodes
     set play_count = play_count + 1
   where id = ep and status = 'published';
$$;

grant execute on function increment_podcast_play(uuid) to anon, authenticated, service_role;
