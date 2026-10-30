-- ============================================================================
-- ZONE-2 이중 컨펌 원자화 + '기관 확인' 액션 (0019_confirm_content_rpc)
-- 출처: 배포 전 codex 리뷰 지적 2건 (회의 결정 [9] / 0017_dual_confirm 후속)
--
-- 1) 동시 확인 lost update 차단
--    기존 경로는 confirmations 를 **읽고 → 앱에서 병합 → 다시 UPDATE** 했다.
--    옥천신문·MBC충북이 동시에 빈 confirmations 를 읽으면 각자 자기 키만 쓰고
--    나중 쓰기가 상대 키를 지운다 → 둘 다 확인했는데 발행이 안 된다.
--    아래 confirm_content() 는 병합을 **한 UPDATE 문 안에서** 수행한다.
--    같은 행에 대한 동시 UPDATE 는 행 잠금으로 직렬화되고, 뒤선 트랜잭션은
--    갱신된 튜플로 SET 식을 다시 계산하므로(READ COMMITTED 재평가) 상대의
--    확인 키가 보존된다.
--
-- 2) 큐 상태 가드를 함수 안으로
--    이미 발행/반려된 행에 확인 기록만 남는 것을 막기 위해, 대상 테이블별
--    "검수 큐 상태"(crossview=candidate, podcast=review)를 where 에 함께 건다.
--    갱신 행이 없으면 null 을 돌려주고, 호출부는 NOT_IN_QUEUE(409)로 매핑한다.
--
-- 3) moderation_action 에 'confirm' 추가
--    양측 확인이 끝나 실제 발행으로 전이될 때만 approve/edit_approve 로 남기고,
--    그 전 단계(한쪽 확인)는 'confirm'(기관 확인)으로 기록한다. 승인율
--    (approve/(approve+reject), docs/02 §지표)이 미발행 후보로 부풀지 않는다.
-- ============================================================================

-- 1) 감사 로그 액션 값 추가 (ADD VALUE IF NOT EXISTS: 재실행/부분적용 안전)
alter type moderation_action add value if not exists 'confirm';

-- 2) 확인 기록 병합 RPC
--    반환: 병합된 confirmations jsonb. 대상이 없거나 큐 밖(이미 처리됨)이면 null.
create or replace function public.confirm_content(
  p_table        text,
  p_id           uuid,
  p_org          text,
  p_by           uuid,
  p_reset_others boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  -- 대상 테이블별 "검수 큐" 상태 — 이 상태의 행만 확인을 받는다.
  v_queue_status  text;
  v_confirmations jsonb;
begin
  -- 테이블명이 동적 SQL 에 들어가므로 화이트리스트 밖은 즉시 예외.
  case p_table
    when 'crossview_pairs'  then v_queue_status := 'candidate';
    when 'podcast_episodes' then v_queue_status := 'review';
    else
      raise exception 'confirm_content: 허용되지 않은 테이블 %', p_table
        using errcode = '22023';
  end case;

  -- 소속도 화이트리스트 — confirmations 의 키가 되므로 임의 키 삽입을 막는다.
  if p_org is null or p_org not in ('okinews', 'mbc') then
    raise exception 'confirm_content: 허용되지 않은 소속 %', p_org
      using errcode = '22023';
  end if;

  -- p_reset_others: 내용이 실제로 바뀐 수정승인 → 상대 확인을 지우고 내 것만 남긴다.
  execute format(
    $q$
      update public.%I
         set confirmations =
               (case when $3 then '{}'::jsonb
                     else coalesce(confirmations, '{}'::jsonb) end)
               || jsonb_build_object(
                    $1,
                    jsonb_build_object(
                      'by', $2,
                      'at', to_char(now() at time zone 'utc',
                                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
       where id = $4
         and status::text = $5
      returning confirmations
    $q$,
    p_table)
    into v_confirmations
    using p_org, p_by, p_reset_others, p_id, v_queue_status;

  return v_confirmations;
end;
$fn$;

comment on function public.confirm_content(text, uuid, text, uuid, boolean) is
  '이중 컨펌: 검수 큐 상태의 대상 행에 소속별 확인을 원자적으로 병합하고 병합 결과를 반환한다(큐 밖이면 null).';

-- 3) 실행 권한: 서버(service_role) 전용. 브라우저 키(anon/authenticated)로는 호출 불가.
revoke all on function public.confirm_content(text, uuid, text, uuid, boolean) from public;
revoke all on function public.confirm_content(text, uuid, text, uuid, boolean) from anon, authenticated;
grant execute on function public.confirm_content(text, uuid, text, uuid, boolean) to service_role;
