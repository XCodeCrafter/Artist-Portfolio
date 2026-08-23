-- Per-profile primary navigation visibility.
-- Hidden slugs are stored instead of visible slugs so new portfolio modules
-- remain visible by default after future deployments. Separate columns keep
-- actor and musician choices intact when the portfolio mode changes.

alter table public.site_settings
add column if not exists hidden_nav_page_slugs_actor text[] not null default '{}',
add column if not exists hidden_nav_page_slugs_musician text[] not null default '{}';

alter table public.site_settings
drop constraint if exists site_settings_hidden_nav_page_slugs_actor_valid;

alter table public.site_settings
add constraint site_settings_hidden_nav_page_slugs_actor_valid
check (
  hidden_nav_page_slugs_actor <@
  array['home', 'bio', 'gallery', 'video', 'booking']::text[]
  and cardinality(hidden_nav_page_slugs_actor) < 5
);

alter table public.site_settings
drop constraint if exists site_settings_hidden_nav_page_slugs_musician_valid;

alter table public.site_settings
add constraint site_settings_hidden_nav_page_slugs_musician_valid
check (
  hidden_nav_page_slugs_musician <@
  array['home', 'bio', 'music', 'video', 'booking']::text[]
  and cardinality(hidden_nav_page_slugs_musician) < 5
);

comment on column public.site_settings.hidden_nav_page_slugs_actor is
  'Actor page slugs hidden from the primary navbar; page content and direct URLs remain available.';

comment on column public.site_settings.hidden_nav_page_slugs_musician is
  'Musician page slugs hidden from the primary navbar; page content and direct URLs remain available.';
