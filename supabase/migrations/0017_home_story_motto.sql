alter table public.gallery_presentation
  alter column story_scroll_label set default
    'Stay curious, protect the spark, and let the work speak before the noise.';

update public.gallery_presentation
set story_scroll_label =
  'Stay curious, protect the spark, and let the work speak before the noise.'
where story_scroll_label = 'Scroll through the practice';
