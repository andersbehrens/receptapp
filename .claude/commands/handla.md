Kör en assisterad ICA-handla-runda.

Butik (om inget annat sägs): https://handlaprivatkund.ica.se/stores/1004028

## Hämta inköpslistan

Om användaren klistrat in en lista direkt efter kommandot: använd den. Annars hämta den automatiskt (ingen anledning att fråga användaren om detta):

```
GET https://receptapp-list.andersbehrens.workers.dev
```

Svaret är `{ "updated": "<ISO-tidsstämpel eller null>", "items": ["vara 1", "vara 2", ...] }`. Appen synkar dit automatiskt (en liten Cloudflare Worker + KV-lagring, ingen auth) varje gång listan ändras (se `CLAUDE.md` → "Inköpslista" → "Synk via Cloudflare Worker"), så det här är alltid senaste listan från telefonen — inget delnings-/klistra in-steg behövs längre. Om `items` är tom eller anropet misslyckas: be användaren klistra in listan manuellt som fallback (gamla flödet via "Dela lista"-knappen).

## Gör så här

1. Öppna butikens sida i Chrome (Claude in Chrome-tillägget krävs — be användaren koppla in det om det inte redan är anslutet). Om en cookie-modal dyker upp: klicka "Avvisa alla" (integritetsvänligast) — bara en gång i början av sessionen.
2. Sök fram **alla** varor i listan efter varandra (`navigate` till `.../search?q=<term>`), och samla namn/pris/vikt via `javascript_tool` (se "Tokeneffektivitet" nedan) — inte en i taget med väntan på svar mellan varje.
3. Bygg en interaktiv plockista: kopiera `.claude/templates/ica-plockista-template.html`, byt bara ut titel/`ITEMS`/`STORAGE_KEY` (se kommentaren överst i filen), publicera som Artifact. Bygg INTE en ny sida från grunden — mallen har redan alla fixar (UTF-8, textruta-fallback, localStorage) från tidigare körningar.
4. Användaren skickar tillbaka sina val (klistrar in innehållet i textrutan från artifacten).
5. Lägg de valda produkterna i den riktiga varukorgen på ICA:s sida — **i rätt mängd** (se "Kvantitet" nedan, detta missades en hel körning).
6. Sammanfatta på slutet: vilka varor som lades i varukorgen (med mängd), och vilka (om några) användaren hoppade över/behöver lösa själv.

## Kvantitet

Varje rad i användarens svar har formatet `- Varunamn (N enhet): Produktval`. **N är hur många av den valda produkten som ska läggas i varukorgen — inte receptets råvarumängd.** Om N > 1: klicka "Lägg till" N gånger för den produkten (med samma ~1.5–2s paus mellan varje klick som mot navigering, se nedan), inte bara en gång. Detta missades i en tidigare körning — "2 gula lökar" (N=2 efter användarens justering) fick bara 1 st i varukorgen eftersom endast ett klick gjordes. Räkna med i din förväntade totalsumma vid slutverifieringen (pris × N per vara).

## Tokeneffektivitet (lärt av tidigare körningar — gör så här från början)

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
  Notera: jämförelsepriset står bara inom parentes efter vikten (t.ex. `(21,80 kr/kg)`), inte prefixat med ordet "jmf" — en tidigare version av regexen letade efter `jmf\s*(...)` vilket aldrig matchade något (rättat 2026-07-14). `text` ger dig fortfarande pris/vikt/ursprungsland som förut (parsa ur hela strängen — ta gärna med ursprungsland/märke i plockistan, se `.claude/templates/ica-plockista-template.html`). En skärmdump kostar mångdubbelt fler tokens än samma information som text. Ta bara en skärmdump när du faktiskt behöver se layout/bekräfta något visuellt (t.ex. slutgiltig varukorgskontroll, eller verifiera ett JS-klick som inte gav effekt).
- **Produktbilder laddar lat, de är inte trasiga** (rättat 2026-07-14 — tidigare version av denna fil påstod att de "ofta är `null`", vilket var fel). `querySelector('img')` direkt efter navigering ger ofta `null` eftersom bilderna laddas in efter en kort stund/efter att sidan "settlat", inte för att ICA saknar bilder. Scrolla ner en bit (`window.scrollBy(0, 400)` eller motsvarande) och vänta ~1s innan du läser av `img.src` om du vill ha med riktiga bild-URL:er. Skicka med `img` när den finns, annars utelämna fältet — mallen visar en emoji-ikon (item-nivåns `emoji`-fält) som fallback och byter tillbaka till den om en bild-URL ändå går sönder (`onerror`).
- **JS-klick (`btn.click()`) kan misslyckas helt tyst för vissa produktkort** (upptäckt 2026-07-14) — särskilt "styckvis"/viktvarukort (t.ex. "Lök gul ca 180g") verkar inte reagera på syntetiska klick alls, utan att kasta något fel. Två klick på en sådan vara gav noll effekt på varukorgen; upptäcktes bara för att slutsumman inte stämde. Föredra fortfarande `btn.click()` först (billigare), men **verifiera** genom att läsa kortets tillstånd direkt efter (dök en mängd-stepper `−/antal/+` upp där "Lägg till"-knappen satt, eller ändrades varukorgens totalsumma med rätt belopp?). Om inget hände: ta en skärmdump, hitta knappen visuellt, och klicka på riktiga koordinater istället — det fungerade tillförlitligt när JS-klicket inte gjorde det. När en vara redan blivit en mängd-stepper (efter ett lyckat första klick): klicka på **"+"-knappen** för efterföljande enheter, inte "Lägg till" (den finns inte kvar).
- **Vänta ~1.5–2s efter varje "Lägg till"-klick innan du navigerar vidare.** Navigerar du direkt kan lägg-till-anropet hinna avbrytas och varan försvinner tyst ur korgen (hände en hel körning — upptäcktes bara för att totalsumman inte stämde).
- **Verifiera en gång i slutet, inte efter varje vara.** Läs varukorgens totalsumma/antal (liten `zoom` på badge-ikonen, eller `get_page_text`) efter ALLA tillägg, jämför mot förväntad summa. Full skärmdump av hela varukorgen bara om summan inte stämmer.
- **Batcha aggressivt.** Ett `browser_batch`-anrop med navigate → wait → javascript_tool → wait → navigate → ... för flera varor i rad, istället för separata anrop per steg.

## Artifact-mallen (`.claude/templates/ica-plockista-template.html`)

Redan löst i mallen, så det här är bara bakgrund — behöver inte göras om: UTF-8-charset (annars mojibake på å/ä/ö), `sendPrompt()`/`navigator.clipboard.writeText()` är opålitliga i den publicerade artifact-kontexten så mallen går direkt på en synlig förvald textruta istället, och val sparas i `localStorage` så en omdeploy/omladdning inte raderar användarens klick. Om du ändå redigerar mallen: testa lokalt (`python3 -m http.server` i en scratch-mapp) innan du publicerar om.

## Viktiga gränser

- **Rör aldrig inloggning eller betalning.** Användaren loggar in och slutför köpet själv efteråt. Skriv aldrig in lösenord, personnummer eller kortuppgifter.
- Lägg bara varor i varukorgen — gå aldrig vidare till kassan/checkout på egen hand.
- Om en vara är tvetydig (t.ex. "mjölk" — vilken fetthalt?) fråga användaren istället för att gissa.

Se `CLAUDE.md` → "Inköpslista" för bakgrund om varför det inte finns en inbyggd e-handelsintegration i själva appen.
