-- ============================================================================
-- 0030_crossview_published_at — 크로스뷰 "최초 공개 시각" (codex 리뷰 2026-10-26, SEO)
--
-- 뉴스 사이트맵·NewsArticle.datePublished·RSS pubDate 는 "사이트에 처음 공개된 시각"이어야 한다
-- (Google 뉴스 사이트맵 규격). 지금까지는 후보 생성 시각 created_at 을 썼는데, 검수가 이틀 넘게
-- 걸리면 승인 직후에도 "최근 2일" 창 밖이라 뉴스 사이트맵에서 빠졌다.
--   · published_at: status 가 approved 로 처음 바뀔 때 트리거가 한 번만 채운다(되돌렸다 재승인해도 유지).
--   · 백필: 기존 approved 페어는 moderation_logs 의 첫 승인 로그 시각, 없으면 created_at.
-- ============================================================================

alter table public.crossview_pairs add column if not exists published_at timestamptz;

create or replace function public.crossview_set_published_at()
returns trigger
language plpgsql
as $fn$
begin
  if new.status = 'approved' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_crossview_published_at on public.crossview_pairs;
create trigger trg_crossview_published_at
  before insert or update of status on public.crossview_pairs
  for each row execute function public.crossview_set_published_at();

-- 백필 — 첫 승인 로그(approve·edit_approve·auto_publish) 시각, 없으면 생성 시각
update public.crossview_pairs p
   set published_at = coalesce(
         (select min(l.created_at) from public.moderation_logs l
           where l.target = 'crossview' and l.target_id::text = p.id::text
             and l.action in ('approve', 'edit_approve', 'auto_publish')),
         p.created_at)
 where p.status = 'approved' and p.published_at is null;

create index if not exists crossview_pairs_published_idx on public.crossview_pairs (published_at desc) where status = 'approved';

notify pgrst, 'reload schema';
