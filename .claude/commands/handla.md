Kör en assisterad handla-runda — ICA eller Willys (Karlskrona), beroende på vad användaren ber om. Om inget sägs: anta ICA (den mer beprövade av de två). Fråga bara om det är oklart vilken butik som avses.

Butiker:
- **ICA**: https://handlaprivatkund.ica.se/stores/1004028
- **Willys**: https://www.willys.se (sök via `/sok?q=<term>`)

De två butikerna använder **helt olika verktyg** för browsern (se "Butik: ICA" / "Butik: Willys" nedan) — blanda inte ihop dem.

## Hämta inköpslistan

Om användaren klistrat in en lista direkt efter kommandot: använd den. Annars hämta den automatiskt (ingen anledning att fråga användaren om detta):

```
GET https://receptapp-list.andersbehrens.workers.dev
```

Svaret är `{ "updated": "<ISO-tidsstämpel eller null>", "items": ["vara 1", "vara 2", ...] }`. Appen synkar dit automatiskt (en liten Cloudflare Worker + KV-lagring, ingen auth) varje gång listan ändras (se `CLAUDE.md` → "Inköpslista" → "Synk via Cloudflare Worker"), så det här är alltid senaste listan från telefonen — inget delnings-/klistra in-steg behövs längre. Om `items` är tom eller anropet misslyckas: be användaren klistra in listan manuellt som fallback (gamla flödet via "Dela lista"-knappen).

## Butik: ICA

Använd `mcp__claude-in-chrome__*`-verktygen (Chrome-tillägget, kopplat till användarens riktiga Chrome).

1. Öppna butikens sida i Chrome (be användaren koppla in tillägget om det inte redan är anslutet). Om en cookie-modal dyker upp: klicka "Avvisa alla" — bara en gång i början av sessionen.
2. Sök fram **alla** varor i listan efter varandra (`navigate` till `.../search?q=<term>`), och samla namn/pris/vikt via `javascript_tool` (se "Tokeneffektivitet" nedan) — inte en i taget med väntan på svar mellan varje.
3. Bygg en interaktiv plockista: kopiera `.claude/templates/ica-plockista-template.html`, byt bara ut titel/`ITEMS`/`STORAGE_KEY` (se kommentaren överst i filen), publicera som Artifact. Bygg INTE en ny sida från grunden — mallen har redan alla fixar (UTF-8, textruta-fallback, localStorage) från tidigare körningar.
4. Användaren skickar tillbaka sina val (klistrar in innehållet i textrutan från artifacten).
5. Lägg de valda produkterna i den riktiga varukorgen på ICA:s sida — **i rätt mängd** (se "Kvantitet" nedan).
6. Sammanfatta på slutet: vilka varor som lades i varukorgen (med mängd), och vilka (om några) användaren hoppade över/behöver lösa själv.

### Tokeneffektivitet (ICA, lärt av tidigare körningar)

- **Läs produktresultat med JS, inte skärmdumpar.** Extrahera namn/bild/jämförelsepris via `javascript_tool`:
  ```js
  Array.from(document.querySelectorAll('.product-card-container')).slice(0,5).map(c=>{
    const img = c.querySelector('img');
    const name = c.querySelector('h3')?.textContent.trim() || '';
    const text = c.textContent.replace(/\s+/g,' ').trim();
    const jmf = text.match(/\(([\d.,]+\s*kr\/(?:kg|l|st))\)/i);
    return { image: img ? img.src : null, name, jmf: jmf ? jmf[1] : null, text };
  })
  ```
  Jämförelsepriset står bara inom parentes efter vikten (t.ex. `(21,80 kr/kg)`), inte prefixat med ordet "jmf". `text` ger dig fortfarande pris/vikt/ursprungsland (parsa ur hela strängen — ta gärna med ursprungsland/märke i plockistan). En skärmdump kostar mångdubbelt fler tokens än samma information som text — ta bara en när du faktiskt behöver se layout eller verifiera ett klick som inte gav effekt.
- **Produktbilder laddar lat, de är inte trasiga.** `querySelector('img')` direkt efter navigering ger ofta `null` eftersom bilderna laddas in efter en kort stund. Scrolla ner en bit (`window.scrollBy(0, 400)`) och vänta ~1s innan du läser av `img.src` om du vill ha med riktiga bild-URL:er. Utelämna fältet annars — mallen visar en emoji-ikon som fallback.
- **JS-klick (`btn.click()`) kan misslyckas helt tyst för vissa produktkort** — särskilt "styckvis"/viktvarukort (t.ex. "Lök gul ca 180g"). Föredra fortfarande `btn.click()` först (billigare), men **verifiera** genom att läsa kortets tillstånd direkt efter (dök en mängd-stepper `−/antal/+` upp, eller ändrades varukorgens totalsumma med rätt belopp?). Om inget hände: ta en skärmdump och klicka på riktiga koordinater istället — det fungerade tillförlitligt när JS-klicket inte gjorde det. När en vara redan blivit en mängd-stepper: klicka på **"+"-knappen** för efterföljande enheter, inte "Lägg till" (den finns inte kvar).
- **Vänta ~1.5–2s efter varje "Lägg till"-klick innan du navigerar vidare.** Navigerar du direkt kan lägg-till-anropet hinna avbrytas och varan försvinner tyst ur korgen.
- **Verifiera en gång i slutet, inte efter varje vara.** Läs varukorgens totalsumma/antal efter ALLA tillägg, jämför mot förväntad summa.
- **Batcha aggressivt.** Ett `browser_batch`-anrop med navigate → wait → javascript_tool → wait → navigate → ... för flera varor i rad.

### Artifact-mallen (`.claude/templates/ica-plockista-template.html`)

Redan löst i mallen: UTF-8-charset, textruta-fallback (sendPrompt/clipboard är opålitliga i artifact-kontext), val sparas i `localStorage`. Om du ändå redigerar mallen: testa lokalt (`python3 -m http.server` i en scratch-mapp) innan du publicerar om.

## Butik: Willys

**Viktigt: `mcp__claude-in-chrome__*` är blockerat mot `willys.se`** (upptäckt 2026-07-15 — varje anrop, navigate/read/js/screenshot, ger "Permission denied ... on this domain", oavsett om användaren är inloggad eller inte, oavsett Chrome-omstart eller färsk flik. Detta verkar vara en fast begränsning i verktyget för just den här domänen, inte en inställning som går att ändra). Använd istället **`mcp__Claude_Browser__*`** (Browser-pane-verktyget, en separat inbäddad webbläsare) — det fungerar utan problem mot willys.se.

**Sessionen är INTE beständig mellan konversationer.** Browser-pane-sessionen hör till den pågående konversationen. En ny `/handla`-körning i en helt ny session öppnar en FÄRSK, tom Willys-session — inte samma varukorg som en tidigare körning. Hela Willys-flödet (bygg korg → användaren loggar in och slutför köpet) måste alltså ske inom samma konversation.

1. Öppna `https://www.willys.se` via `mcp__Claude_Browser__preview_start` (eller `navigate` om en preview redan är öppen).
2. Sök varor via `navigate` till `https://www.willys.se/sok?q=<term>`.
3. Extrahera produktkort via `javascript_tool`:
   ```js
   Array.from(document.querySelectorAll('[data-testid="product"]')).slice(0,5).map(c => ({
     text: c.textContent.replace(/\s+/g,' ').trim(),
     img: c.querySelector('img')?.src || null,
   }))
   ```
   `text` innehåller pris, namn, märke/vikt och jämförelsepris ihopklistrat (t.ex. `"1590/stMjölk Längre Hållbarhet 3%Garant 1,5lJmf-pris 10,60 kr/l"`) — parsa ut det du behöver. Bilder fungerar bra och laddar direkt på Willys (till skillnad från ICA), ingen scroll-fördröjning behövs.
4. Bygg samma sorts interaktiva plockista (Artifact) som för ICA — kopiera och anpassa `.claude/templates/ica-plockista-template.html` (byt titel/`ITEMS`/`STORAGE_KEY`), samma flöde för att ta emot användarens val.
5. Lägg varor i varukorgen: varje produktkort har redan en synlig mängd-stepper (`−/antal/+`), ingen separat "Lägg till"-knapp först. Hitta rätt kort, klicka knappen med `aria-label` `"Öka antal till 1 st"` (ökar automatiskt vid varje klick) N gånger för N enheter:
   ```js
   const card = Array.from(document.querySelectorAll('[data-testid="product"]')).find(c => c.textContent.includes('Produktnamn'));
   Array.from(card.querySelectorAll('button')).find(b => b.getAttribute('aria-label')?.startsWith('Öka antal')).click();
   ```
6. Verifiera i slutet via varukorgsknappens `aria-label` (uppdateras direkt):
   ```js
   document.querySelector('[data-testid="mini-cart-button"]').getAttribute('aria-label')
   // t.ex. "Varukorg: 3 varor, 45,70 kr"
   ```
7. **Rör aldrig "Töm varukorg" eller ta bort varor utan att användaren uttryckligen bett om just det** — en tidigare testkörning visade att även en till synes anonym varukorg kan behandlas som kopplad till användarens riktiga konto av säkerhetssystemet. Om du råkar lägga till fel vara: fråga användaren innan du tar bort den.
8. Avsluta med att be användaren klicka på **"Open"**-knappen under Browser-pane-vyn för att själv ta över samma session, logga in och slutföra köpet. Detta måste ske innan konversationen avslutas (se ovan om session-beständighet).

## Kvantitet

Varje rad i användarens svar har formatet `- Varunamn (N enhet): Produktval`. **N är hur många av den valda produkten som ska läggas i varukorgen — inte receptets råvarumängd.** Om N > 1: klicka lägg-till/öka-knappen N gånger för den produkten (med samma ~1.5–2s paus mellan varje klick som mot navigering), inte bara en gång. Räkna med i din förväntade totalsumma vid slutverifieringen (pris × N per vara).

## Viktiga gränser

- **Rör aldrig inloggning eller betalning.** Användaren loggar in och slutför köpet själv efteråt. Skriv aldrig in lösenord, personnummer eller kortuppgifter — oavsett butik, oavsett om ett oofficiellt API existerar som skulle kunna göra det åt dig (Willys har flera sådana på GitHub, alla kräver att man lagrar det riktiga lösenordet i klartext — används inte).
- Lägg bara varor i varukorgen — gå aldrig vidare till kassan/checkout på egen hand.
- **Rör aldrig "töm varukorg"/ta bort varor utan uttrycklig tillåtelse för just den handlingen.**
- Om en vara är tvetydig (t.ex. "mjölk" — vilken fetthalt?) fråga användaren istället för att gissa.

Se `CLAUDE.md` → "Inköpslista" för bakgrund om varför det inte finns en inbyggd e-handelsintegration i själva appen.
