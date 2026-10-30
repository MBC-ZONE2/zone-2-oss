-- 크로스뷰 카드뉴스 배경 이미지 URL과 공개 Storage 버킷.
alter table crossview_pairs
  add column if not exists card_image_url text;

insert into storage.buckets (id, name, public)
values ('crossview', 'crossview', true)
on conflict do nothing;

do $$
begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'crossview_public_read'
  ) then
    execute 'create policy "crossview_public_read"
      on storage.objects for select
      to public
      using (bucket_id = ''crossview'')';
  end if;
end
$$;
