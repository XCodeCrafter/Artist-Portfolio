alter table public.site_settings
  add column if not exists footer_effect text not null default 'soul';

alter table public.site_settings
  drop constraint if exists site_settings_footer_effect_check;

alter table public.site_settings
  add constraint site_settings_footer_effect_check check (
    footer_effect in ('soul', 'red-light')
  );
