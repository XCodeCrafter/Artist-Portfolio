insert into public.site_settings (
  id,
  portfolio_type,
  artist_name,
  tagline,
  description,
  location,
  spotify_artist_url,
  spotify_embed_url,
  contact_blurb
) values (
  'main',
  'musician',
  'Franky Fugazi',
  'Music / Photos / Illustration',
  'Official portfolio for Franky Fugazi - music, video, biography, and booking.',
  'Amsterdam, The Netherlands',
  'https://open.spotify.com/artist/3j6ZTLub4b9G6huqfRDIIM',
  'https://open.spotify.com/embed/artist/3j6ZTLub4b9G6huqfRDIIM?theme=0',
  'Use the form for direct booking and inquiries.'
) on conflict (id) do update set
  portfolio_type = excluded.portfolio_type,
  artist_name = excluded.artist_name,
  tagline = excluded.tagline,
  description = excluded.description,
  location = excluded.location,
  spotify_artist_url = excluded.spotify_artist_url,
  spotify_embed_url = excluded.spotify_embed_url,
  contact_blurb = excluded.contact_blurb;

insert into public.page_heroes (
  page_slug,
  title,
  subtitle,
  cta_label,
  cta_href,
  background_src,
  poster_src,
  media_type,
  sort_order
) values
  ('home', 'FRANKY FUGAZI', 'MUSIC / PHOTOS / ILLUSTRATION', '', '#home-about', '/images/hero.jpg', '', 'image', 10),
  ('bio', 'BIOGRAPHY', 'BIO', 'READ', '#bio', '/images/bio-hero.jpg', '', 'image', 20),
  ('gallery', 'GALLERY', 'HEADSHOTS', 'VIEW', '#gallery', '/images/bio-music.jpg', '', 'image', 30),
  ('music', 'MUSIC', 'LISTEN', 'SCROLL', '#music', '/images/music-hero.jpg', '', 'image', 40),
  ('video', 'VIDEOS', 'WATCH', 'SCROLL', '#videos', '/media/hero-loop.mp4', '', 'video', 50),
  ('booking', 'BOOKING', 'CONTACT', 'WRITE', '#form', '/images/booking-hero.jpg', '', 'image', 60)
on conflict (page_slug) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  cta_label = excluded.cta_label,
  cta_href = excluded.cta_href,
  background_src = excluded.background_src,
  poster_src = excluded.poster_src,
  media_type = excluded.media_type,
  sort_order = excluded.sort_order;

insert into public.about_home (
  id,
  heading,
  body,
  cta_label,
  cta_href,
  image_src,
  image_alt
) values (
  'main',
  'ABOUT',
  'Guitarist with roots in England, now based in Amsterdam. I craft moody yet energetic indie rock - shimmering guitars, raw emotion, and melodies that linger long after the last chord fades. Come to a show and you will get a cinematic ride without unnecessary words - just sound, atmosphere, and honest intensity.',
  'Find Out More',
  '/bio',
  '/images/about.jpg',
  'Artist portrait on stage'
) on conflict (id) do update set
  heading = excluded.heading,
  body = excluded.body,
  cta_label = excluded.cta_label,
  cta_href = excluded.cta_href,
  image_src = excluded.image_src,
  image_alt = excluded.image_alt;

insert into public.home_updates (id, text, link_label, href, avatar_src, sort_order) values
  ('latest-track', 'My latest track is out now', 'Listen here', 'https://open.spotify.com/artist/3j6ZTLub4b9G6huqfRDIIM', '/images/avatar-1.jpg', 10),
  ('atmospheric-productions', 'Known for atmospheric and melodic productions.', '', '', '/images/avatar-2.jpg', 20),
  ('sound-blend', 'Blends indie, rock, and progressive sounds.', '', '', '/images/avatar-3.jpg', 30),
  ('worldwide-events', 'Plays at clubs and events worldwide.', '', '', '/images/avatar-4.jpg', 40)
on conflict (id) do update set
  text = excluded.text,
  link_label = excluded.link_label,
  href = excluded.href,
  avatar_src = excluded.avatar_src,
  sort_order = excluded.sort_order;

insert into public.music_platform_links (id, title, label, href, icon_key, image_src, sort_order) values
  ('beatport', 'BEATPORT', '', 'https://beatport.com', 'beatport', '/images/music-1.jpg', 10),
  ('spotify', 'SPOTIFY', '', 'https://open.spotify.com/artist/3j6ZTLub4b9G6huqfRDIIM', 'spotify', '/images/music-2.jpg', 20),
  ('soundcloud', 'SOUNDCLOUD', '', 'https://soundcloud.com', 'soundcloud', '/images/music-3.jpg', 30),
  ('apple-music', 'APPLE MUSIC', '', 'https://music.apple.com', 'apple', '/images/music-4.jpg', 40)
on conflict (id) do update set
  title = excluded.title,
  label = excluded.label,
  href = excluded.href,
  icon_key = excluded.icon_key,
  image_src = excluded.image_src,
  sort_order = excluded.sort_order;

insert into public.soundcloud_tracks (id, title, embed_url, sort_order) values
  ('mix-01', '', 'https://api.soundcloud.com/tracks/soundcloud:tracks:247188263', 10),
  ('mix-02', '', 'https://api.soundcloud.com/tracks/soundcloud:tracks:2114365833', 20),
  ('mix-03', '', 'https://api.soundcloud.com/tracks/soundcloud:tracks:2189419043', 30),
  ('mix-04', '', 'https://api.soundcloud.com/tracks/soundcloud:tracks:2159226369', 40),
  ('mix-05', '', 'https://api.soundcloud.com/tracks/soundcloud:tracks:2120089767', 50)
on conflict (id) do update set
  title = excluded.title,
  embed_url = excluded.embed_url,
  sort_order = excluded.sort_order;

insert into public.bio_gallery_images (id, src, alt, sort_order) values
  ('portrait-01', '/images/bio.jpg', 'Portrait 01', 10),
  ('portrait-02', '/images/bio-music.jpg', 'Portrait 02', 20),
  ('portrait-03', '/images/bio-music-1.jpg', 'Portrait 03', 30),
  ('portrait-04', '/images/bio-music-3.jpg', 'Portrait 04', 40)
on conflict (id) do update set
  src = excluded.src,
  alt = excluded.alt,
  sort_order = excluded.sort_order;

insert into public.gallery_images (
  id,
  title,
  src,
  alt,
  caption,
  category,
  sort_order
) values
  (
    'headshot-01',
    'Editorial Portrait',
    '/images/bio.jpg',
    'Editorial actor portrait',
    'Natural-light portrait suitable for casting and press.',
    'Headshot',
    10
  ),
  (
    'headshot-02',
    'Studio Headshot',
    '/images/bio-music.jpg',
    'Studio headshot portrait',
    'Clean studio portrait for agencies and casting profiles.',
    'Headshot',
    20
  ),
  (
    'portrait-03',
    'Character Portrait',
    '/images/bio-music-1.jpg',
    'Character portrait',
    'Mood-led portrait for editorial and role range context.',
    'Portrait',
    30
  ),
  (
    'portrait-04',
    'Profile Still',
    '/images/bio-music-3.jpg',
    'Profile still',
    'Portfolio still with a cinematic profile angle.',
    'Still',
    40
  )
on conflict (id) do update set
  title = excluded.title,
  src = excluded.src,
  alt = excluded.alt,
  caption = excluded.caption,
  category = excluded.category,
  sort_order = excluded.sort_order;

insert into public.bio_profile (id, top_label, intro_text, caption) values (
  'main',
  '',
  '',
  'Amsterdam / Producer / Singer'
) on conflict (id) do update set
  top_label = excluded.top_label,
  intro_text = excluded.intro_text,
  caption = excluded.caption;

insert into public.bio_paragraphs (id, body, reveal_delay, sort_order) values
  ('bio-01', 'I create music that moves between shadow and glow - hypnotic rhythm, melodic tension, and textures that feel both intimate and massive. The sound is built to pull you in, not just to make noise. It is not about volume. It is about gravity.', 140, 10),
  ('bio-02', 'Every track begins as a mood - sometimes fragile, sometimes raw. I collect fragments: field recordings, half-finished melodies, late-night synth accidents, conversations overheard in strange cities. They slowly start speaking to each other. What remains is never random.', 200, 20),
  ('bio-03', 'My influences are intentionally messy: deeper electronic roots, emotional alternative edges, ambient spaces, and cultural fragments that show up when you least expect them. The result is always driven by narrative - even on a loud dancefloor.', 260, 30),
  ('bio-04', 'Whether it is an intimate room or a big stage, the set is shaped like a story arc: slow tension, release, a little danger, and a clean landing. I am obsessed with pacing - how long can you hold a moment before it breaks into something bigger?', 320, 40),
  ('bio-05', 'Over the years, the focus has stayed consistent: emotion, pace, atmosphere. I am not here to fill silence - I am here to build a world for a few minutes where people can actually feel something. A world that feels cinematic, but still human.', 380, 50),
  ('bio-06', 'Production has become more minimal, but more precise. Fewer layers, more intention. I am interested in tension you can almost touch - the quiet before a drop, the air between two chords, the breath before impact.', 440, 60),
  ('bio-07', 'Traveling shaped the sound in unexpected ways. England gave it depth. Amsterdam gave it urgency. Small rooms taught restraint. Big stages taught scale. Each city leaves a fingerprint.', 500, 70),
  ('bio-08', 'I do not separate studio work from live performance. They feed each other constantly. A mistake in a live set can become the core of a future release. A studio experiment can redefine the energy of a night.', 560, 80),
  ('bio-09', 'Right now the focus is on pushing production forward - more releases, collaborations, and live moments that feel like a short film you can dance to. Something immersive. Something that lingers after the lights come back on.', 620, 90),
  ('bio-10', 'At the center of it all is one simple intention: create spaces where people feel suspended - just slightly outside of time. Not escaping reality. Just experiencing it differently.', 680, 100)
on conflict (id) do update set
  body = excluded.body,
  reveal_delay = excluded.reveal_delay,
  sort_order = excluded.sort_order;

insert into public.actor_resume (
  id,
  headline,
  summary,
  location,
  playing_age,
  height,
  eyes,
  hair,
  languages,
  skills,
  representation,
  resume_url
) values (
  'main',
  'Screen and stage performer',
  'Actor profile foundation for casting directors, agencies, and production teams. Replace this text with a focused performer summary, casting range, and recent work highlights.',
  'Amsterdam, The Netherlands',
  '25-35',
  '',
  '',
  '',
  'English, Dutch',
  'Improvisation, movement, stage combat, guitar',
  '',
  ''
) on conflict (id) do update set
  headline = excluded.headline,
  summary = excluded.summary,
  location = excluded.location,
  playing_age = excluded.playing_age,
  height = excluded.height,
  eyes = excluded.eyes,
  hair = excluded.hair,
  languages = excluded.languages,
  skills = excluded.skills,
  representation = excluded.representation,
  resume_url = excluded.resume_url;

insert into public.actor_credits (
  id,
  credit_type,
  title,
  role,
  production,
  director,
  year,
  href,
  sort_order
) values
  (
    'credit-film-01',
    'film',
    'Short Film Title',
    'Lead',
    'Independent Production',
    'Director Name',
    '2026',
    '',
    10
  ),
  (
    'credit-theatre-01',
    'theatre',
    'Stage Production',
    'Supporting',
    'Theatre Company',
    'Director Name',
    '2025',
    '',
    20
  ),
  (
    'credit-commercial-01',
    'commercial',
    'Commercial Campaign',
    'Principal',
    'Brand / Agency',
    '',
    '2025',
    '',
    30
  )
on conflict (id) do update set
  credit_type = excluded.credit_type,
  title = excluded.title,
  role = excluded.role,
  production = excluded.production,
  director = excluded.director,
  year = excluded.year,
  href = excluded.href,
  sort_order = excluded.sort_order;

insert into public.social_links (id, label, platform, href, icon_key, sort_order) values
  ('spotify', 'Spotify', 'spotify', 'https://open.spotify.com/artist/3j6ZTLub4b9G6huqfRDIIM', 'spotify', 10),
  ('soundcloud', 'SoundCloud', 'soundcloud', 'https://soundcloud.com', 'soundcloud', 20),
  ('instagram', 'Instagram', 'instagram', 'https://instagram.com', 'instagram', 30),
  ('youtube', 'YouTube', 'youtube', 'https://youtube.com', 'youtube', 40),
  ('bandcamp', 'Bandcamp', 'bandcamp', 'https://bandcamp.com', 'bandcamp', 50),
  ('apple-music', 'Apple Music', 'apple', 'https://music.apple.com', 'apple', 60)
on conflict (id) do update set
  label = excluded.label,
  platform = excluded.platform,
  href = excluded.href,
  icon_key = excluded.icon_key,
  sort_order = excluded.sort_order;

-- After creating the first Supabase Auth user, activate admin access with:
--
-- insert into public.admin_profiles (user_id, email, role)
-- values ('AUTH_USER_UUID_HERE', 'you@example.com', 'owner')
-- on conflict (user_id) do update set
--   email = excluded.email,
--   role = excluded.role,
--   is_active = true;
