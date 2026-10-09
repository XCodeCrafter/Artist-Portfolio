-- Hide/show the entire public Bio Resume & Credits block without changing its content.
-- Apply manually, then run checks/0059_bio_resume_visibility.sql.
begin;

-- Serialize the first-add decision; reruns must never reset an owner's choice.
lock table public.site_settings in access exclusive mode;
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'site_settings'
      and column_name = 'bio_resume_credits_enabled'
  ) then
    alter table public.site_settings
      add column bio_resume_credits_enabled boolean not null default true;
    -- Existing musician portfolios start with their casting block hidden.
    -- Actor sites and future rows retain the compatible ON default.
    -- The existing timestamp trigger invalidates any pre-migration settings draft.
    update public.site_settings set bio_resume_credits_enabled = false
      where portfolio_type = 'musician';
  end if;
end $$;

comment on column public.site_settings.bio_resume_credits_enabled is
  'Public Bio Resume & Credits visibility. Hiding preserves stored resume/credits. Admin saves use site_settings.updated_at compare-and-swap.';

-- Existing grants, policies and version triggers remain unchanged.
notify pgrst, 'reload schema';
commit;
