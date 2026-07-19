# USER TODO

Osobni poznamky k projektu, dalsim krokum a budoucimu nasazeni.

## Aktualni stav

Projekt zatim bezi lokalne na localhostu. To je v poradku.

Aktualne neni nutne resit Supabase migrace, pokud jeste nepouzivas realnou Supabase databazi a admin dashboard pro ukladani obsahu.

Aplikace ma fallback obsah primo v kodu, hlavne v:

- `lib/content/fallback.ts`

Diky tomu projekt funguje i bez Supabase konfigurace.

## Login a Admin na localhostu

Stav: login je v kodu implementovany pres Supabase Auth na adrese:

- `/admin/login`

Plne funkcni admin login ale potrebuje Supabase konfiguraci, Supabase Auth uzivatele a admin profil v databazi.

Dulezite:

- heslo ani hash hesla se nedava do `.env`
- heslo vytvorim u Supabase Auth uzivatele
- Supabase si heslo uklada a hashuje sama
- do `.env.local` patri jen Supabase URL, klice a admin email allowlist

### Lokalne pripravit `.env.local`

1. Zkopirovat sablonu:

```bash
cp .env.local.example .env.local
```

2. Vyplnit minimalne:

```bash
SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
ADMIN_EMAILS=you@example.com
SUPABASE_SECRET_KEY=YOUR_SUPABASE_SERVICE_ROLE_SECRET
SUPABASE_MEDIA_BUCKET=portfolio-media
```

Poznamky:

- `ADMIN_EMAILS` je email, ktery bude mit povoleny vstup do adminu
- `SUPABASE_SECRET_KEY` je server-only service role/secret key
- `SUPABASE_SECRET_KEY` nikdy nepatri do browseru a nikdy se necommituje
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` je podporovany fallback pro starsi Supabase projekty

### Vytvoreni admin uzivatele

1. Otevrit Supabase Dashboard.
2. Jit do `Authentication` -> `Users`.
3. Kliknout na `Add user`.
4. Email zadat stejny jako v `ADMIN_EMAILS`, napr. `you@example.com`.
5. Vytvorit silne heslo. Toto heslo potom zadavam na `/admin/login`.
6. Zkopirovat `User UID` vytvoreneho uzivatele.
7. Spustit migrace, hlavne `supabase/migrations/0001_initial_schema.sql`, aby existovala tabulka `admin_profiles`.
8. V Supabase SQL Editoru vlozit admin profil:

```sql
insert into public.admin_profiles (user_id, email, role, is_active)
values ('AUTH_USER_UUID', 'you@example.com', 'owner', true)
on conflict (user_id)
do update set
  email = excluded.email,
  role = excluded.role,
  is_active = true;
```

Nahradit:

- `AUTH_USER_UUID` za realne `User UID` ze Supabase Auth
- `you@example.com` za stejny email jako v `ADMIN_EMAILS`

### Prihlaseni

1. Spustit aplikaci:

```bash
npm run dev
```

2. Otevrit:

- `http://localhost:3000/admin/login`

3. Prihlasit se:

- email: stejny jako `ADMIN_EMAILS`
- password: heslo vytvorene v Supabase Auth

### Caste chyby loginu

- `Supabase auth is not configured.` znamena, ze chybi `NEXT_PUBLIC_SUPABASE_URL` nebo public/anon key.
- `Invalid admin credentials.` znamena spatny email/heslo nebo neexistujici Supabase Auth user.
- `This account is not allowed to access admin.` znamena, ze email neni v `ADMIN_EMAILS`, chybi aktivni radek v `admin_profiles`, nebo chybi server admin key.

Pro localhost muze dev fallback povolit login jen pres Supabase Auth + `ADMIN_EMAILS`, kdyz chybi `SUPABASE_SECRET_KEY`. Pro plne testovani adminu ale chci mit `SUPABASE_SECRET_KEY` a `admin_profiles` nastavene hned i lokalne.

## Co jsou migrace

Migrace jsou SQL soubory, ktere upravi Supabase databazi.

Kod uz obsahuje nove funkce, ale databaze o nich bude vedet az po spusteni techto SQL souboru v Supabase.

Priklad:

- galerie potrebuje tabulku `gallery_images`
- showreel potrebuje nove sloupce u `videos`
- herecke CV potrebuje tabulky `actor_resume` a `actor_credits`
- contact workflow potrebuje sloupce `portfolio_type` a `inquiry_type`

Dokud projekt bezi jen lokalne bez Supabase, migrace nemusim resit.

## Migrace pripravene pro budoucnost

Az budu mit Supabase projekt, spustit postupne:

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_media_manager.sql`
3. `supabase/migrations/0003_analytics_inquiries.sql`
4. `supabase/migrations/0004_security_center.sql`
5. `supabase/migrations/0005_portfolio_modes.sql`
6. `supabase/migrations/0006_module_registry.sql`
7. `supabase/migrations/0007_gallery_foundation.sql`
8. `supabase/migrations/0008_actor_showreel.sql`
9. `supabase/migrations/0009_actor_resume.sql`
10. `supabase/migrations/0010_simple_contact_workflow.sql`
11. `supabase/migrations/0011_security_event_counters.sql`

Spousti se v Supabase Dashboardu v SQL Editoru, nebo pozdeji pres Supabase CLI.

## Automatizace Supabase migraci

Ano, migrace jde automatizovat pres Supabase CLI. Nechci ale, aby aplikace pri `npm run dev` sama mazala nebo menila produkcni databazi. Bezpecny workflow je:

1. Migrace jsou ulozene v repozitari v `supabase/migrations`.
2. Pred aplikaci se udela kontrola:

```bash
npm run db:push:dry
```

3. Kdyz vypis vypada spravne, posle se to do Supabase:

```bash
npm run db:push
```

Prvni nastaveni CLI:

```bash
npm run db:init
npm run db:link -- --project-ref TVUJ_PROJECT_REF
```

Poznamky:

- `db:init` vytvori `supabase/config.toml`, pokud jeste neexistuje.
- `db:link` propoji lokalni projekt s konkretnim Supabase projektem.
- `db:status` ukaze, ktere migrace jsou lokalne a ktere uz jsou v remote DB.
- `db:push:dry` ukaze plan bez provedeni zmen.
- `db:push` aplikuje pending migrace do linked Supabase projektu.
- `db:reset:local` je jen pro lokalni Supabase DB a maze lokalni data.

Proc to nedelat uplne automaticky pri startu aplikace:

- SQL databaze ma realne schema, indexy, RLS policies a constraints.
- Automaticke mazani tabulek pri behu aplikace je nebezpecne pro produkci.
- Spravny production postup je migrace spoustet jako samostatny krok pred deployem nebo v CI/CD.

MongoDB pusobi vic automaticky, protoze kolekce a dokumenty jsou schemaless a casto vznikaji pri prvnim zapisu. Supabase/Postgres je prisnejsi, ale prave diky tomu mame lepsi kontrolu nad bezpecnosti, rolemi, vztahy, indexy a admin daty.

## Hotove batche

### Batch 8: Module Registry

Centralni rizeni modulu podle typu portfolia.

- musician: HOME, BIO, MUSIC, VIDEO, BOOKING
- actor: HOME, BIO, GALLERY, SHOWREEL, CONTACT

Dulezite soubory:

- `lib/content/modules.ts`
- `app/sitemap.ts`
- `components/admin/ContentEditor.tsx`

### Batch 9: Actor Gallery

Samostatna herecka galerie.

- public stranka `/gallery`
- admin sekce Photo Gallery
- tabulka `gallery_images` pro budoucnost

Dulezite soubory:

- `app/gallery/page.tsx`
- `components/admin/ContentEditor.tsx`
- `supabase/migrations/0007_gallery_foundation.sql`

### Batch 10: Actor Showreel

Video portfolio pro herce.

- featured showreel
- typ videa: showreel, scene, self_tape, interview, music_video, behind_scenes, other
- admin muze nastavit featured video

Dulezite soubory:

- `app/video/page.tsx`
- `components/admin/ContentEditor.tsx`
- `supabase/migrations/0008_actor_showreel.sql`

### Batch 11: Actor Resume & Credits

Herecke CV a credits.

- resume blok na `/bio`
- languages, skills, representation, resume URL
- credits podle typu: film, television, theatre, commercial, voiceover, training, other
- admin sprava resume a credits

Dulezite soubory:

- `components/ActorResume.tsx`
- `app/bio/page.tsx`
- `components/admin/ContentEditor.tsx`
- `supabase/migrations/0009_actor_resume.sql`

### Batch 12: Simple Contact Workflow

Jednoduchy kontakt pro herce.

Actor portfolio nema slozity casting formular. Jen:

- Name
- Email
- Message

Textove pojati:

- `LET'S WORK TOGETHER`
- `Interested in working together? Send a short message and I will get back to you.`

Formular uklada metadata:

- `portfolio_type`
- `inquiry_type`

Dulezite soubory:

- `app/booking/page.tsx`
- `components/BookingForm.tsx`
- `app/api/booking/route.ts`
- `components/admin/AnalyticsDashboard.tsx`
- `supabase/migrations/0010_simple_contact_workflow.sql`

### Batch 13: Security Event Counters

Bezpecnostni viditelnost v adminu.

- blokovane contact/API pokusy se zapisujou do `audit_logs`
- eventy maji prefix `security_*`
- Admin Dashboard ukazuje rychle security staty
- Security Center ukazuje detailni pocitadla utoku
- analytics API a admin write actions maji vlastni security guardy
- migrace pridava index pro rychle dotazy nad audit logy

Dulezite soubory:

- `app/api/booking/route.ts`
- `components/BookingForm.tsx`
- `lib/admin/security.ts`
- `components/admin/SecurityCenter.tsx`
- `app/admin/page.tsx`
- `supabase/migrations/0011_security_event_counters.sql`

### Batch 14: Admin UX Polish

Rozpracovano.

- Content Editor uz neni jedna dlouha stranka se vsemi formulari
- `/admin/content` ma modulove workspace tlacitka a otevira jen vybranou sekci
- `/admin/analytics` ma modulove workspace tlacitka pro traffic, pages, links, events a inquiries
- `/admin/security` ma modulove workspace tlacitka pro health, threats, allowlist, admin profiles a audit log
- po ulozeni se diky hash casti URL umi otevrit zpatky spravna sekce

Dalsi mozne zlepseni:

- podobny workflow pro `/admin/media`, pokud bude media knihovna dlouha
- modal pro editaci jednotlive polozky galerie/video/social linku
- vyhledavani a filtrovani v dlouhych seznamech

## Hardening hotovy

Probehly bezpecnostni upravy:

- production admin uz nema fungovat jen pres `ADMIN_EMAILS`, pokud chybi Supabase service key
- contact API neveri slepe klientskemu `portfolioType`
- API ma limit velikosti requestu
- email subject je ocisteny od nebezpecnych znaku
- IP/user-agent hodnoty se omezuji/sanitizuji
- CSP a security headers jsou zpevneny v `next.config.ts`
- README a `.env.example` vysvetluji, ze service role je pro production admin povinna
- contact API ma dual honeypot pole `company` a `website`
- contact API kontroluje stejny origin requestu
- contact API blokuje bezne non-browser bot user-agenty
- blokovane pokusy se zapisujou do `audit_logs` jako `security_contact_*`
- analytics API ma limit velikosti, origin/referer check, bot filter a volitelny Redis rate limit
- admin write actions maji same-origin guard proti cross-origin pokusum
- admin/API routes maji `Cache-Control: no-store` a `X-Robots-Tag: noindex`
- HSTS a `upgrade-insecure-requests` jsou zapnute jen pro production, ne pro localhost
- nepouzivana knihovna `lenis` byla odstranena z dependencies
- Admin Dashboard ukazuje `Threat events 24h` a `Honeypot traps 7d`
- Security Center ukazuje pocitadla utoku za 24 hodin a 7 dni

Dulezite soubory:

- `lib/admin/action-security.ts`
- `lib/admin/auth.ts`
- `lib/admin/security.ts`
- `app/api/analytics/route.ts`
- `app/api/booking/route.ts`
- `app/admin/content/actions.ts`
- `app/admin/media/actions.ts`
- `app/admin/analytics/actions.ts`
- `app/admin/security/actions.ts`
- `components/BookingForm.tsx`
- `components/admin/SecurityCenter.tsx`
- `next.config.ts`
- `.env.example`

## Overeni

Posledni kontroly prosly:

- `npm run lint`
- `npm run build`

Audit zavislosti:

- `npm audit --omit=dev --audit-level=low`

Stale hlasi znamy problem:

- `postcss`
- severity: moderate
- problem jde pres `next`
- npm hlasi `No fix available`

To zatim neni chyba naseho kodu. Je potreba to sledovat a aktualizovat Next.js, az bude oprava dostupna.

## Co zatim nemusim resit

Dokud jsem jen na localhostu:

- nemusim spoustet migrace
- nemusim zakladat Supabase hned
- nemusim nastavovat Vercel env promenne
- nemusim resit produkcni storage
- nemusim mit realneho admin uzivatele

Projekt muze dal bezet z fallback dat.

## Co bude potreba pred Vercel/Supabase nasazenim

Az budu chtit projekt dat online:

1. Zalozit Supabase projekt.
2. Spustit vsechny SQL migrace ve spravnem poradi.
3. Spustit `supabase/seed.sql`, pokud chci zakladni data.
4. Vytvorit Supabase Auth uzivatele pro admin login.
5. Vlozit admina do `admin_profiles`.
6. Nastavit Supabase Storage bucket pres migraci `0002_media_manager.sql`.
7. Zalozit Resend nebo jinou emailovou konfiguraci.
8. Zalozit Upstash Redis pro rate limiting.
9. Nastavit env promenne ve Vercelu.
10. Nasadit pres Vercel.
11. Otestovat public web.
12. Otestovat admin login.
13. Otestovat contact form.
14. Otestovat media upload.

## Vercel env promenne

Pozdeji bude potreba nastavit:

- `SITE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `RESEND_API_KEY`
- `BOOKING_TO_EMAIL`
- `BOOKING_FROM_EMAIL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_MEDIA_BUCKET`
- `ADMIN_EMAILS`

Pozor:

- `SUPABASE_SECRET_KEY` a `SUPABASE_SERVICE_ROLE_KEY` nikdy nepatri do browseru.
- Ve Vercelu patri jen do server-side environment variables.

## Dalsi mozne batche

### Batch 13: Deployment Prep

Pripravit projekt na Vercel/Supabase.

- checklist env promennych
- produkcni README
- nasazovaci postup
- kontrola build outputu
- kontrola CSP pro realne domeny

### Batch 14: Admin UX Polish

Zlepsit admin dashboard.

- lepsi rozlozeni sekci
- preview public URL u media
- rychle odkazy na public stranky
- jasnejsi statusy

### Batch 15: Content Polish

Pripravit realny obsah.

- finalni texty pro musician
- finalni texty pro actor
- realne fotky
- realne video/showreel odkazy
- social links

### Batch 16: SEO & Social Sharing

Doladit vystup na Google a social site.

- metadata podle typu portfolia
- OpenGraph texty
- social image
- sitemap kontrola
- robots kontrola

## Kratke pravidlo

Ted lokalne:

- dal vyvijet
- testovat UI
- ladit obsah

Pozdeji pred produkci:

- Supabase
- migrace
- env promenne
- admin uzivatel
- Vercel deploy
