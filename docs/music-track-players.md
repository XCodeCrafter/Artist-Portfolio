# Spotify a SoundCloud v Tracks & mixes

Pod hlavním Spotify přehrávačem na `/music` může být jeden společný seznam
skladeb, alb, playlistů a mixů ze Spotify a SoundCloudu. Hlavní přehrávač má
nadále samostatné nastavení. Dosavadní nadpis spodní sekce zůstává uložený
a lze jej změnit v administraci.

## Editace

1. Otevři **Admin V2 → Music page → Tracks & mixes**
   (`/admin/v2/pages/music`).
2. Přidej položku a vyber **Spotify** nebo **SoundCloud**.
3. Vlož odkaz. Spotify přijímá běžný odkaz na skladbu, album nebo playlist;
   editor jej převede na adresu přehrávače. SoundCloud přijímá dosavadní
   odkazy na skladby a mixy, včetně API a sdílecích odkazů.
4. Volitelně doplň název, nastav zveřejnění a pořadí. Potvrď
   **Save Tracks & mixes**. Ve stejném seznamu lze obě platformy kombinovat.

Přepnutí platformy při editaci dočasně uchová rozpracovaný odkaz pro každou
z obou voleb. Do databáze se ukládá jedna aktuální URL položky. Po uložení,
zahození změn nebo opětovném načtení je rozhodující uložený stav.
Skrývání, archivace a obnova položek fungují jako dosud; obnovená položka
začíná skrytá. Limit zůstává 48 položek.

## Nasazení

1. Nejdřív nasaď odpovídající novou verzi aplikace.
2. V Supabase SQL Editoru spusť
   `supabase/migrations/0062_music_track_players.sql`.
3. Spusť `supabase/checks/0062_music_track_players.sql`.
   Každá kontrola musí vrátit `passed = true`.
4. Obnov editor Music a ověř uložení i opětovné načtení položky z obou
   platforem. Před migrací nový editor kolekce hlásí požadavek na 0062.

Migrace nepřepisuje existující skladby, nadpisy, pořadí ani archiv. Přidává
service-only RPC `save_music_tracks_v2` a odvození platformy v seznamu
archivu. Původní ukládací RPC zůstává zachovaná. Nové ukládání používá stejné
zámky a kontrolu verzí jako dosavadní editor a archiv; nepřepisuje novější
změny z jiného okna.

Interní jména `soundcloud_tracks`, sekce `soundcloud` a odkaz
`/music#soundcloud-mixes` zůstávají kvůli kompatibilitě. Platforma se bezpečně
odvozuje z URL, není potřeba kopírovat data ani přidávat sloupec do tabulky.
Uložené vlastní názvy navigace se nemění.

## Přehrávání a ověření

Veřejné přehrávače používají existující souhlas s externími médii. Náhled
malých karet v administraci ukazuje platformu a název bez načítání externího
iframe. Žádné URL se na serveru nestahují a není potřeba rozšířit CSP.

Testy pokrývají společný seznam, normalizaci URL, odmítnutí cizích přehrávačů,
ukládání a archivaci. SQL lze ověřit bez přístupu k hostované databázi:

`node scripts/test-music-track-players-migration.mjs <local-PGlite-dist/index.js>`

Příprava migrace a lokální náhled nejsou potvrzením jejího spuštění
v hostovaném Supabase. Lokální náhled používá ukázková data a ukládání v paměti.
