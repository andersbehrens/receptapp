Rekommendera vilket/vilka recept från samlingen som är värda att laga denna vecka, baserat på vad som är på extrapris/kampanj hos ICA just nu.

Butik (om inget annat sägs): https://handlaprivatkund.ica.se/stores/1004028

## Gör så här

1. Öppna butikens sida i Chrome (Claude in Chrome krävs). Navigera till "Erbjudanden" i toppmenyn (eller `.../campaigns` om den URL:en fungerar bättre).
2. Extrahera listan över produkter på extrapris/kampanj just nu via `javascript_tool` — text, inte skärmdump (se `/handla` → "Tokeneffektivitet", samma princip gäller här). Om erbjudandesidan har flera sidor/scroll: hämta minst de första 40–50 produkterna, det räcker för en rimlig rekommendation.
3. Läs alla receptfiler i `recept/*.md` (9 st just nu — se `RECIPE_FILES` i `js/app.js` för aktuell lista om fler lagts till). För varje recept: samla titel + alla ingredienser (från `## Ingredienser`-sektionen, inklusive ev. undergrupper).
4. Matcha ingredienser mot erbjudandelistan. Matchningen ska vara **innehållsbaserad, inte exakt sträng** — ett erbjudande som heter "ICA ​Gul lök 500g" ska matcha receptets ingrediens "2 gula lökar" (jämför kärnordet, t.ex. "lök", inte hela produktnamnet). Räkna antal träffar per recept.
5. Presentera en rekommendation, rangordnad efter flest träffar:
   - Vilket/vilka recept som passar bäst denna vecka och varför (vilka specifika ingredienser är på extrapris, gärna med pris/rabatt om det syns).
   - Kort om recept med få/inga träffar (inget behöver sägas om alla, en kort lista räcker).
6. Fråga om användaren vill gå vidare med `/handla` för det rekommenderade receptet.

## Viktigt

- Det här är en **rekommendation**, inte ett automatiskt beslut — presentera resonemanget kort så användaren kan bedöma det själv, gissa inte fram en "vinnare" utan att visa varför.
- Rör aldrig inloggning, varukorg eller betalning i det här kommandot — det är `/handla`s jobb, inte det här.
- Om erbjudandesidan kräver inloggning för att visa priser/lagerstatus: notera det och fortsätt ändå med vad som går att se utan inloggning (produktnamn brukar synas ändå).
