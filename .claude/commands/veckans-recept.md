Rekommendera vilket/vilka recept från samlingen som är värda att laga denna vecka, baserat på vad som är på extrapris/kampanj hos **både ICA och Willys** just nu. Jämförelsen mellan butikerna är också tänkt att hjälpa användaren välja vilken butik som är värd att handla i denna vecka (se `/handla <butik>` för själva handla-rundan).

Butiker:
- **ICA**: https://handlaprivatkund.ica.se/stores/1004028 — använd `mcp__claude-in-chrome__*` (Chrome-tillägget).
- **Willys**: https://www.willys.se — använd **`mcp__Claude_Browser__*`** (Browser-pane-verktyget), INTE `claude-in-chrome`, som är blockerat mot `willys.se` (se `/handla` → "Butik: Willys" för bakgrund). Det spelar ingen roll att Browser-pane-sessionen inte är beständig mellan konversationer — det här kommandot rör aldrig varukorg/inloggning, bara läsning av offentliga erbjudandesidor.

## Gör så här

1. **ICA**: Öppna butikens sida i Chrome (Claude in Chrome krävs). Navigera till "Erbjudanden" i toppmenyn (eller `.../campaigns` om den URL:en fungerar bättre).
2. **Willys**: Öppna `https://www.willys.se` via Browser-pane-verktyget (`preview_start` eller `navigate`). Startsidan visar redan flera "Veckans erbjudanden"-sektioner direkt utan att behöva välja butik — använd den, inte `/erbjudanden`-sidan (den kräver att man väljer en specifik fysisk butik för reklamblad, vilket är en annan sak än e-handelns aktuella kampanjpriser och onödigt krångligt att klicka igenom).
3. Extrahera erbjudandelistan från båda butikerna via `javascript_tool` — text, inte skärmdump (se `/handla` → "Tokeneffektivitet", samma princip gäller här):
   - ICA: hämta minst de första 40–50 produkterna om sidan har flera sidor/scroll.
   - Willys: produktkort har `[data-testid="product"]` (se `/handla` → "Butik: Willys" för extraktions-snippet). Startsidans kampanjsektioner räcker (behöver inte klicka "Visa fler" på varje sektion, men gärna på ett par om tiden räcker).
4. Läs alla receptfiler i `recept/*.md` (se `RECIPE_FILES` i `js/app.js` för aktuell lista). För varje recept: samla titel + alla ingredienser (från `## Ingredienser`-sektionen, inklusive ev. undergrupper).
5. Matcha ingredienser mot erbjudandelistan från **båda** butikerna separat. Matchningen ska vara **innehållsbaserad, inte exakt sträng** — ett erbjudande som heter "Gul Lök 500g" ska matcha receptets ingrediens "2 gula lökar" (jämför kärnordet, t.ex. "lök", inte hela produktnamnet). Räkna antal träffar per recept **per butik**.
6. Presentera en jämförande rekommendation:
   - Rangordna recepten efter flest träffar, men visa träffar för **båda butikerna sida vid sida** (t.ex. "Belugalasagne — 5 träffar hos ICA, 2 hos Willys").
   - Peka ut vilken butik som verkar bäst denna vecka för det/de rekommenderade recepten, och varför (vilka specifika ingredienser är på extrapris i respektive butik, gärna med pris/rabatt).
   - Kort om recept med få/inga träffar i någon butik (inget behöver sägas om alla, en kort lista räcker).
7. Fråga om användaren vill gå vidare med `/handla` (och i så fall vilken butik) för det rekommenderade receptet.

## Viktigt

- Det här är en **rekommendation**, inte ett automatiskt beslut — presentera resonemanget kort så användaren kan bedöma det själv, gissa inte fram en "vinnare" utan att visa varför.
- Rör aldrig inloggning, varukorg eller betalning i det här kommandot, i någon av butikerna — det är `/handla`s jobb, inte det här.
- Om en erbjudandesida kräver inloggning för att visa priser/lagerstatus: notera det och fortsätt ändå med vad som går att se utan inloggning (produktnamn brukar synas ändå).
- Om en av butikernas erbjudandesida inte går att nå (t.ex. tillfälligt nere): fortsätt ändå med den andra butiken och notera det i svaret, istället för att avbryta helt.
