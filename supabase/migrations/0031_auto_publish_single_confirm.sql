-- ============================================================================
-- 0031_auto_publish_single_confirm — "한쪽 확인 후 N시간 자동 공개"를 DB 한 트랜잭션으로 (대표 결정 2026-10-26, codex 리뷰 반영)
--
-- 앱(lib/moderation/confirm-timeout)이 조회 → 갱신 → 로그를 따로 하면
--   ① 조회와 갱신 사이에 재확인·수정승인(상대 확인 무효화)이 끼어도 옛 스냅샷으로 공개될 수 있고
--   ② 로그 삽입이 실패해도 공개는 남으며
--   ③ PostgREST 1,000행 상한에 대상이 잘린다.
-- 그래서 판정·전이·감사 로그를 이 함수가 한 트랜잭션에서 한다. 행은 FOR UPDATE SKIP LOCKED 로 잠그고
-- 잠근 시점의 최신 값으로 조건을 다시 평가한다(EvalPlanQual). 로그 삽입이 실패하면 전체가 롤백된다.
-- 대상: 크로스뷰 candidate / 팟캐 review 중 **정확히 한 기관**만 확인했고 그 확인 시각이 cutoff 이전인 행.
-- 공개 결과 행을 돌려준다(앱은 IndexNow 알림만). service_role 전용.
-- ============================================================================

drop function if exists public.auto_publish_single_confirmed(numeric);
create function public.auto_publish_single_confirmed(p_hours numeric)
returns table (target text, target_id uuid, confirmed_by text, confirmed_at timestamptz)
language plpgsql
security definer
set search_path = public
volatile
as $fn$
declare
  cutoff timestamptz := now() - make_interval(secs => (p_hours * 3600)::int);
  r record;
  v_org text;
  v_at timestamptz;
  v_missing jsonb;
begin
  if p_hours is null or p_hours <= 0 then
    return;
  end if;

  -- ── 크로스뷰 ──
  for r in
    select p.id, p.confirmations
      from crossview_pairs p
     where p.status = 'candidate'
       and p.confirmations is not null
       and ((p.confirmations ? 'mbc') <> (p.confirmations ? 'okinews'))
       and (
         (p.confirmations->(case when p.confirmations ? 'mbc' then 'mbc' else 'okinews' end)->>'at')::timestamptz <= cutoff
       )
     for update skip locked
  loop
    v_org := case when r.confirmations ? 'mbc' then 'mbc' else 'okinews' end;
    v_at := (r.confirmations->v_org->>'at')::timestamptz;
    v_missing := case when v_org = 'mbc' then '["okinews"]'::jsonb else '["mbc"]'::jsonb end;

    update crossview_pairs set status = 'approved' where id = r.id;  -- published_at 은 0030 트리거

    insert into moderation_logs (target, target_id, action, operator, details)
    values ('crossview', r.id, 'auto_publish', null,
            jsonb_build_object('autoPublish', jsonb_build_object(
              'reason', 'single_confirm_timeout', 'hours', p_hours,
              'confirmedBy', v_org, 'confirmedAt', v_at, 'confirmations', r.confirmations, 'missing', v_missing,
              'note', format('%s 확인 후 %s시간 경과·상대 확인 없음 — 자동 공개(대표 결정 2026-10-26). 되돌리려면 콘텐츠 관리 → 검수로 되돌리기',
                             case when v_org = 'mbc' then 'MBC충북' else '옥천신문' end, p_hours))));

    target := 'crossview'; target_id := r.id; confirmed_by := v_org; confirmed_at := v_at;
    return next;
  end loop;

  -- ── 팟캐스트 ──
  for r in
    select e.id, e.confirmations, e.scheduled_for
      from podcast_episodes e
     where e.status = 'review'
       and e.confirmations is not null
       and ((e.confirmations ? 'mbc') <> (e.confirmations ? 'okinews'))
       and (
         (e.confirmations->(case when e.confirmations ? 'mbc' then 'mbc' else 'okinews' end)->>'at')::timestamptz <= cutoff
       )
     for update skip locked
  loop
    v_org := case when r.confirmations ? 'mbc' then 'mbc' else 'okinews' end;
    v_at := (r.confirmations->v_org->>'at')::timestamptz;
    v_missing := case when v_org = 'mbc' then '["okinews"]'::jsonb else '["mbc"]'::jsonb end;

    -- 발행일은 사람 승인과 같은 규칙: 콘텐츠 날짜(scheduled_for) 09:00 KST, 없으면 지금
    update podcast_episodes
       set status = 'published',
           published_at = coalesce((r.scheduled_for::text || 'T09:00:00+09:00')::timestamptz, now())
     where id = r.id;

    insert into moderation_logs (target, target_id, action, operator, details)
    values ('podcast', r.id, 'auto_publish', null,
            jsonb_build_object('autoPublish', jsonb_build_object(
              'reason', 'single_confirm_timeout', 'hours', p_hours,
              'confirmedBy', v_org, 'confirmedAt', v_at, 'confirmations', r.confirmations, 'missing', v_missing,
              'note', format('%s 확인 후 %s시간 경과·상대 확인 없음 — 자동 공개(대표 결정 2026-10-26). 되돌리려면 콘텐츠 관리 → 검수로 되돌리기',
                             case when v_org = 'mbc' then 'MBC충북' else '옥천신문' end, p_hours))));

    target := 'podcast'; target_id := r.id; confirmed_by := v_org; confirmed_at := v_at;
    return next;
  end loop;
end
$fn$;

revoke all on function public.auto_publish_single_confirmed(numeric) from public, anon, authenticated;
grant execute on function public.auto_publish_single_confirmed(numeric) to service_role;

notify pgrst, 'reload schema';
