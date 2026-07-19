-- Media manager storage setup.
-- Run after 0001_initial_schema.sql.

alter table public.media_assets
  add column if not exists storage_bucket text not null default 'portfolio-media',
  add column if not exists storage_path text not null default '',
  add column if not exists file_size bigint not null default 0,
  add column if not exists mime_type text not null default '';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'portfolio-media',
  'portfolio-media',
  true,
  104857600,
  array[
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
) on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read portfolio media objects" on storage.objects;
create policy "Public can read portfolio media objects"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'portfolio-media');

drop policy if exists "Admins can manage portfolio media objects" on storage.objects;
create policy "Admins can manage portfolio media objects"
on storage.objects for all
to authenticated
using (bucket_id = 'portfolio-media' and public.is_admin())
with check (bucket_id = 'portfolio-media' and public.is_admin());
