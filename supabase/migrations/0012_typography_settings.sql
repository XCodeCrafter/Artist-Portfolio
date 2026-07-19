alter table public.site_settings
  add column if not exists display_font text not null default 'playfair-display',
  add column if not exists body_font text not null default 'inter',
  add column if not exists ui_font text not null default 'manrope';

alter table public.site_settings
  drop constraint if exists site_settings_display_font_check,
  drop constraint if exists site_settings_body_font_check,
  drop constraint if exists site_settings_ui_font_check;

alter table public.site_settings
  add constraint site_settings_display_font_check check (
    display_font in (
      'abril-fatface', 'playfair-display', 'bodoni-moda',
      'libre-caslon-display', 'cormorant-sc', 'marcellus', 'italiana',
      'dm-serif-display', 'spectral', 'prata'
    )
  ),
  add constraint site_settings_body_font_check check (
    body_font in (
      'inter', 'source-sans-3', 'dm-sans', 'work-sans',
      'plus-jakarta-sans', 'ibm-plex-sans'
    )
  ),
  add constraint site_settings_ui_font_check check (
    ui_font in (
      'manrope', 'space-grotesk', 'dm-sans', 'inter', 'urbanist',
      'ibm-plex-sans'
    )
  );
