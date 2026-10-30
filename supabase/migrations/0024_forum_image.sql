-- ============================================================================
-- 0024_forum_image — 공론장 글 사진 1장 (대표 지시 2026-10-19)
--
-- forum_posts.image_url: 서버(/api/forum/image)가 sharp 로 1600px·WebP 로 줄여 'forum' 버킷에 올린 공개 URL.
-- 버킷은 공개 읽기, 쓰기는 service_role 만(업로드는 서버 라우트가 검증 뒤 수행). 5MB·이미지 MIME 만.
-- ============================================================================

alter table public.forum_posts add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('forum', 'forum', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'forum_public_read'
  ) then
    create policy forum_public_read on storage.objects
      for select to public using (bucket_id = 'forum');
  end if;
end $$;
