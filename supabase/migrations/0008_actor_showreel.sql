-- Actor showreel foundation.
-- Run after 0001_initial_schema.sql.

alter table public.videos
  add column if not exists description text not null default '',
  add column if not exists video_type text not null default 'music_video',
  add column if not exists is_featured boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'videos_video_type_check'
      and conrelid = 'public.videos'::regclass
  ) then
    alter table public.videos
      add constraint videos_video_type_check
      check (
        video_type in (
          'showreel',
          'scene',
          'self_tape',
          'interview',
          'music_video',
          'behind_scenes',
          'other'
        )
      );
  end if;
end $$;

create unique index if not exists videos_single_featured_idx
on public.videos (is_featured)
where is_featured = true;

create index if not exists videos_type_order_idx
on public.videos (video_type, sort_order);
