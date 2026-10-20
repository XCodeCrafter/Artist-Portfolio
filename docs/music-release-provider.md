# Hlavní přehrávač Music: Spotify nebo SoundCloud playlist

V **Admin V2 → Music → Releases** lze pro hlavní přehrávač vybrat Spotify
nebo SoundCloud. Umístění a vzhled sekce se nemění. Spodní **Tracks & mixes**
zůstává samostatnou kolekcí.

## Použití

1. V Releases vyber **Release player**.
2. Pro SoundCloud vlož veřejný odkaz ve tvaru
   `https://soundcloud.com/autor/sets/nazev-playlistu`.
   Běžné parametry sdílení editor odstraní. Zkrácené odkazy `on.soundcloud.com`,
   soukromé odkazy, jednotlivé skladby a HTML iframe sem nepatří.
3. Uprav nadpis a potvrď **Save Releases**.
4. Ověř výsledek na `/music` po povolení externích médií.

Volba poskytovatele a oba odkazy se ukládají společně. Přepnutí nesmaže druhou
konfiguraci, takže se lze vrátit ke Spotify bez opětovného zadávání. Editor
validuje i neaktivní odkaz; případná chyba vysvětlí, ke které volbě se vrátit.
Při souběžné editaci se kontrolují verze nastavení i prezentace; novější změny
z jiného okna se nesmějí přepsat.

SoundCloud playlist musí být veřejný a umožňovat vložení. Délku přehrávání,
dostupnost a případná omezení určuje SoundCloud a nastavení skladeb — samotné
přepnutí platformy neodstraňuje licenční nebo regionální omezení. Používá se
[oficiální SoundCloud widget](https://developers.soundcloud.com/docs/api/html5-widget),
bez serverového stahování URL, přidaného API klíče nebo autoplay.

Přehrávač vyžaduje stávající souhlas s externími médii. Odkaz **Open on
SoundCloud** umožňuje otevřít playlist přímo. Admin náhled obou poskytovatelů
je záměrně neinteraktivní a nenačítá jejich iframe ani po uděleném souhlasu.

## Nasazení

1. Nasaď aplikaci obsahující tento editor a veřejný přehrávač.
2. Spusť `supabase/migrations/0063_music_release_provider.sql`.
3. Spusť `supabase/checks/0063_music_release_provider.sql`; všechny kontroly
   musí vrátit `passed = true`.
4. Obnov Music editor. Ulož SoundCloud playlist, znovu načti uložený stav
   a ověř veřejnou stránku. Vyzkoušej také přepnutí zpět ke Spotify.

Před migrací zůstává veřejný Spotify přehrávač i uložený nadpis čitelný;
nové ukládání Releases oznámí chybějící 0063 a ponechá rozepsané hodnoty.
Ostatní editory se touto migrací nemění.

Migrace přidává `music_presentation.release_provider` (výchozí Spotify) a
`soundcloud_playlist_url` (výchozí prázdný). Existující obsah nepřepisuje.
Nová service-only RPC `save_music_releases_v2` používá stejné zámky a dvojí
kontrolu verzí jako původní Spotify ukládání. Původní RPC zůstává beze změny
a nemůže vymazat nový SoundCloud odkaz ani přepnout poskytovatele.

Interní klíč sekce `spotify`, navigační klíč `music.spotify` a odkaz
`/music#spotify-releases` zůstávají kompatibilní. Výchozí popisek navigace
je nyní **RELEASES**; vlastní uložené popisky se nepřepisují.

Kontrola `music_tracks_snapshot_unchanged` z historických kontrol 0062 očekává
starou podobu snapshotu. Po 0063 ji nahrazuje
`music_releases_snapshot_verified` v kontrolách 0063; ostatní kontroly 0062
zůstávají relevantní. Původní migrační soubory ani historie se neupravují.

SQL lze ověřit v jednorázové izolované databázi:

```text
node scripts/test-music-release-provider-migration.mjs <local-PGlite-dist/index.js>
```

Příprava migrace a lokální testy nejsou potvrzením nasazení na GitHub/Vercel
ani spuštění SQL v hostované databázi.

Ověření 2026-10-20: 6 059 testů / 226 souborů, TypeScript, ESLint a produkční
Webpack build prošly (Supabase a Resend byly pro build vypnuté).
Jednorázový PGlite běh ověřil přepnutí oběma směry, zachování odkazů i dat,
konflikty verzí, oprávnění, opakované spuštění a všech 10 SQL kontrol.
Skutečné přehrání konkrétního playlistu a ukládání v hostovaném editoru
zůstává součástí kontroly po nasazení.
