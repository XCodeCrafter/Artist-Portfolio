-- Optional Home section edge fades. Existing sites remain OFF until enabled.
-- Apply manually, then run checks/0057_home_section_transitions.sql.
-- This does not alter Home content, section order, visibility or media.
begin;

alter table public.site_settings
  add column if not exists home_section_transitions_enabled boolean not null default false;

comment on column public.site_settings.home_section_transitions_enabled is
  'Optional public Home section edge fades, default OFF. Admin updates use site_settings.updated_at compare-and-swap.';

-- Keep existing owner values, timestamps, RLS policies and update/reference
-- triggers intact, including when this additive migration is applied again.
notify pgrst, 'reload schema';
commit;
