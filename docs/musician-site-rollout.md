# Nasazení úprav pro Frankyho

Tato sada obsahuje přepínač Resume & Credits v BIO, samostatnou stránku Press
s vlastním editorem a kalendář koncertů s vypnutelnými odkazy na vstupenky.
Příprava souborů ani lokální náhled nemění živý web nebo databázi v Supabase.

## Pořadí nasazení

Nejdřív nasaď odpovídající verzi aplikace, potom spusť níže uvedené nové SQL
migrace v Supabase SQL Editoru. Starší aplikace neumí rozšířené nastavení
kalendáře; tato nová verze umí stará data přečíst a do migrace zablokuje jeho
ukládání. SQL samo o sobě nenahraje změny aplikace na web.

1. Spusť obsah `supabase/migrations/0059_bio_resume_visibility.sql`.
   Potom spusť `supabase/checks/0059_bio_resume_visibility.sql`.
   Přidává nastavení viditelnosti spodního bloku BIO. Obsah životopisu
   a credits nemaže. Existující profil typu musician začíná s blokem skrytým.
2. Spusť obsah `supabase/migrations/0060_press_page_navigation.sql`.
   Potom spusť `supabase/checks/0060_press_page_navigation.sql`.
   Přidává PRESS do navigace a její správy. Články zůstávají v původním úložišti;
   migrace je nekopíruje ani nemaže. Ostatní odkazy a jejich pořadí zachová.
3. Spusť obsah `supabase/migrations/0061_booking_calendar_ticket_visibility.sql`.
   Potom spusť `supabase/checks/0061_booking_calendar_ticket_visibility.sql`.
   Přidává výchozí vypnuté zobrazování odkazů na vstupenky. Zachová události,
   jejich zveřejnění, nastavení celého kalendáře i uložené odkazy.

Každý kontrolní soubor je jen pro čtení. Ve všech vrácených řádcích musí být
`passed = true`. Při chybě SQL nebo neúspěšné kontrole nepokračuj další migrací;
zachovej konkrétní výsledek pro diagnostiku. Po dokončení znovu načti otevřené
editory, aby používaly aktuální verze uložených dat.

Podle dříve potvrzených projektových záznamů jsou migrace 0053 až 0058 již
na používaném projektu aplikované. Neopakuj je a nespouštěj `seed.sql`.
Seznam výše uvádí nové migrace z této práce, nikoliv živě ověřenou historii
vzdálené databáze. Pro nový prázdný projekt platí celé pořadí migrací.

## Editace v administraci

* **BIO → Visibility → Show Resume & Credits**: skrýt nebo obnovit celý blok.
* **Press page**: upravit úvod, články, obrázky, pořadí, zveřejnění a hlavní recenzi.
* **Events → Calendar settings**: zapnout kalendář na Live & Contact a nechat
  **Show ticket links** vypnuté.
* **Events → Add event**: vyplnit název, datum, čas, časové pásmo místa, město,
  podnik a typ akce. Do popisu lze napsat například „Free entry. Doors open at
  19:00.“ Prázdný odkaz sám o sobě neznamená bezplatný vstup.
* Zvolit **Publish this event** a potvrdit **Save calendar**. Samotná změna
  náhledu nic nezveřejňuje. **Discard changes** vrátí poslední uložený stav.

Později lze zobrazování vstupenek znovu zapnout a doplnit odkazy pořadatele.
Kalendář sám neprodává vstupenky a nezpracovává platby. Vypnutí odkazů nemaže
jejich uložené hodnoty; stav zrušené nebo kapacitně zaplněné akce zůstává zachovaný.

Po nasazení ověř na skutečném webu uložení a opětovné načtení existujícího
obsahu. Lokální náhledy používají ukázková data a dočasné ukládání v paměti;
jejich funkčnost není potvrzením zápisu do hostované databáze.
