// Pure, fictional fixtures for a newly generated LOCAL acceptance project.
// Never execute these exports against a linked/hosted project. The launcher
// must independently verify loopback endpoints and the dedicated project id.
// No Auth account, session, password, factor or token is manufactured here.
export const ACCEPTANCE_OWNER_EMAIL = "owner@portfolio.test";
export const ACCEPTANCE_MEDIA = Object.freeze({
  portrait: "/acceptance-fixtures/portrait.png",
  landscape: "/acceptance-fixtures/landscape.png",
});
export const ACCEPTANCE_HERO_SLUGS = Object.freeze([
  "home", "bio", "music", "gallery", "video", "booking",
]);

const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${literal(JSON.stringify(value))}::jsonb`;
const hero = {
  title: "ACCEPTANCE ARTIST", subtitle: "FICTIONAL LOCAL TEST PORTFOLIO",
  ctaLabel: "Explore", ctaHref: "#home-about",
  backgroundSrc: ACCEPTANCE_MEDIA.portrait, posterSrc: "", mediaType: "image",
};
const about = {
  heading: "About the fixture", body: "Fictional content for reversible acceptance tests.",
  ctaLabel: "Biography", ctaHref: "/bio",
  imageSrc: ACCEPTANCE_MEDIA.landscape, imageAlt: "Synthetic colored landscape",
};
export const ACCEPTANCE_HOME_DRAFT = {
  layout: ["hero", "about", "cnc", "feature", "stories"].map((id) => ({ id, enabled: id !== "cnc" })),
  hero,
  about,
  cnc: { eyebrow: "LOCAL FIXTURE", title: "Test program", body: "Synthetic program, not production source." },
  feature: {
    title: "Fixture interlude", body: "Video acceptance awaits a generated clip and local TLS.",
    ctaLabel: "Showreel", ctaHref: "/video", videoSrc: "",
    posterSrc: ACCEPTANCE_MEDIA.landscape, label: "Fixture", meta: "Local acceptance", eyebrow: "Test motion",
  },
  stories: {
    title: "Fixture stories", body: "Four synthetic frames, no owner photographs.",
    ctaLabel: "Gallery", ctaHref: "/gallery", label: "Fixture sequence", scrollLabel: "Scroll through test frames",
    images: [1, 2, 3, 4].map((position) => ({
      src: position % 2 ? ACCEPTANCE_MEDIA.portrait : ACCEPTANCE_MEDIA.landscape,
      title: `Fixture frame ${position}`, body: "Disposable test story.", alt: `Synthetic frame ${position}`,
    })),
  },
};

// Insert immediately AFTER 0001 in the generated migration sequence. In
// particular 0045 requires main BEFORE the normal post-migration seed runs.
// The private marker and empty-account guards are extra mistake prevention,
// not a substitute for the launcher's local-only endpoint checks.
export const ACCEPTANCE_BOOTSTRAP_SQL = `
begin;
do $$ begin
  if exists(select 1 from public.site_settings)
    or exists(select 1 from auth.users)
    or exists(select 1 from public.admin_profiles) then
    raise exception 'acceptance_bootstrap_requires_empty_fixture_database';
  end if;
end; $$;
create schema acceptance_fixture_private;
revoke all on schema acceptance_fixture_private from public, anon, authenticated;
create table acceptance_fixture_private.marker (
  id text primary key check (id = 'artist-portfolio-acceptance')
);
revoke all on table acceptance_fixture_private.marker from public, anon, authenticated;
insert into acceptance_fixture_private.marker values ('artist-portfolio-acceptance');
insert into public.site_settings(id, artist_name, tagline, description, location, contact_blurb)
values ('main', 'Acceptance Artist', 'Fictional local test portfolio',
  'Disposable acceptance content. Not a real artist.', 'Fixture City', 'Local test inquiries only.');
insert into public.page_heroes(page_slug, title, subtitle, cta_label, cta_href, background_src, poster_src, media_type, sort_order)
values ${ACCEPTANCE_HERO_SLUGS.map((slug, index) => `(${literal(slug)}, ${literal(slug === "home" ? hero.title : `FIXTURE ${slug.toUpperCase()}`)}, 'FICTIONAL LOCAL TEST', '', '', ${literal(ACCEPTANCE_MEDIA.portrait)}, '', 'image', ${(index + 1) * 10})`).join(",\n")};
insert into public.about_home(id, heading, body, cta_label, cta_href, image_src, image_alt)
values ('main', ${literal(about.heading)}, ${literal(about.body)}, ${literal(about.ctaLabel)}, ${literal(about.ctaHref)}, ${literal(about.imageSrc)}, ${literal(about.imageAlt)});
commit;
`;

// One-time seed, after all genuine migrations but BEFORE creating the local
// Auth owner. Explicitly refuse an existing account or a changed identity.
// Bundled starter rows created by historical migrations are fictionalized;
// no original repo seed or owner media is copied into this environment.
export const ACCEPTANCE_SEED_SQL = `
begin;
do $$ begin
  if not exists(select 1 from acceptance_fixture_private.marker where id = 'artist-portfolio-acceptance')
    or not exists(select 1 from public.site_settings where id = 'main' and artist_name = 'Acceptance Artist')
    or exists(select 1 from auth.users)
    or exists(select 1 from public.admin_profiles) then
    raise exception 'acceptance_seed_requires_fresh_marked_fixture_database';
  end if;
end; $$;
update public.site_settings set navigation_config_version = 1,
  spotify_artist_url = '', spotify_embed_url = '',
  footer_content = ${json({ eyebrow: "Local fixture", heading: "Acceptance test footer", primaryLabel: "Contact", primaryHref: "/booking", secondaryLabel: "Showreel", secondaryHref: "/video", socialEyebrow: "Test links", socialHeading: "Fictional links only" })}
where id = 'main';
update public.site_navigation_items set is_visible = destination_key in ('home','bio','gallery','music','works','contact')
where site_id = 'main';
update public.home_page_config set draft = ${json(ACCEPTANCE_HOME_DRAFT)}, hero_media_framing = null where id = 'main';
insert into public.bio_profile(id, top_label, intro_text, caption)
values ('main', 'FIXTURE BIO', 'A fictional biography for local testing.', 'Synthetic portrait');
insert into public.bio_paragraphs(id, body, sort_order)
values ('acceptance-bio-paragraph', 'This paragraph can be archived and restored safely.', 10);
insert into public.bio_gallery_images(id, src, alt, sort_order)
values ('acceptance-bio-portrait', ${literal(ACCEPTANCE_MEDIA.portrait)}, 'Synthetic portrait', 10);
update public.actor_resume set headline = 'Fictional performer', summary = 'Disposable local resume.',
  location = 'Fixture City', playing_age = '', height = '', eyes = '', hair = '',
  languages = 'Test language', skills = 'Acceptance tests', representation = '', resume_url = '' where id = 'main';
update public.actor_credits set title = 'Fictional credit ' || id, role = 'Test role',
  production = 'Fixture production', director = 'Fictional director', year = '2026', href = '';
update public.gallery_images set title = 'Synthetic frame ' || id,
  src = ${literal(ACCEPTANCE_MEDIA.landscape)}, alt = 'Synthetic landscape', caption = 'Disposable gallery fixture.', category = 'Fixture';
update public.gallery_presentation set intro_eyebrow = 'FIXTURE GALLERY', intro_title = 'Synthetic frames',
  interlude_label = 'Fixture clip', interlude_meta = 'Local test', interlude_eyebrow = 'Synthetic motion',
  interlude_title = 'Video fixture pending', interlude_video_src = '',
  interlude_poster_src = ${literal(ACCEPTANCE_MEDIA.landscape)}, story_label = 'Fixture stories',
  story_scroll_label = 'Scroll through test frames' where id = 'main';
update public.music_presentation set releases_heading = 'FIXTURE RELEASES', mixes_heading = 'FIXTURE MIXES' where id = 'main';
insert into public.music_platform_links(id, title, label, href, icon_key, image_src, sort_order)
values ('acceptance-platform', 'Fixture platform', 'Not a real service', 'https://music.example.test/acceptance', 'website', ${literal(ACCEPTANCE_MEDIA.landscape)}, 10);
insert into public.social_links(id, label, platform, href, icon_key, sort_order)
values ('acceptance-social', 'Fixture website', 'website', 'https://social.example.test/acceptance', 'website', 10);
insert into public.media_assets(id, label, src, alt, media_type, usage_key, sort_order)
values ('acceptance-portrait', 'Fixture portrait', ${literal(ACCEPTANCE_MEDIA.portrait)}, 'Synthetic portrait', 'image', 'acceptance:fixture', 10),
  ('acceptance-landscape', 'Fixture replacement', ${literal(ACCEPTANCE_MEDIA.landscape)}, 'Synthetic landscape', 'image', 'acceptance:fixture', 20);
update public.cnc_programs set title = 'Fixture program', file_name = 'ACCEPTANCE.NC',
  description = 'Synthetic local test program.', source_code = E'N10 G00 X0 Y0\nN20 M30', is_published = false;
insert into public.booking_inquiries(id, name, email, message, inquiry_intent)
values ('13a00000-0000-4000-8000-000000000001', 'Fixture Visitor', 'visitor@portfolio.test',
  'Fictional local inquiry for Inbox acceptance tests.', 'general');
notify pgrst, 'reload schema';
commit;
`;
