Kör en assisterad ICA-handla-runda. Användaren har klistrat in sin inköpslista efter det här kommandot (från "Dela lista"-knappen i receptappen).

Butik (om inget annat sägs): https://handlaprivatkund.ica.se/stores/1004028

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
    const jmf = text.match(/jmf\s*([\d.,]+\s*kr\/(?:kg|l|st))/i);
    return { image: img ? img.src : null, name, jmf: jmf ? jmf[1] : null, text };
  })
  ```
  `text` ger dig fortfarande pris/vikt som förut (parsa ur hela strängen). `jmf` är jämförelsepriset (kr/kg, kr/l eller kr/st) om det finns — visa det i plockistan, det hjälper användaren jämföra förpackningsstorlekar. En skärmdump kostar mångdubbelt fler tokens än samma information som text. Ta bara en skärmdump när du faktiskt behöver se layout/bekräfta något visuellt (t.ex. slutgiltig varukorgskontroll).
- **Produktbilder är opålitliga på ICA:s sida** — `img` blir ofta `null` (fastnar i ett laddningsskelett på deras håll, inte något att felsöka i vår kod). Skicka med `img` när den finns, annars utelämna fältet — mallen visar automatiskt en emoji-ikon (item-nivåns `emoji`-fält) istället, och byter tillbaka till ikonen om en bild-URL går sönder (`onerror`). Vänta inte extra länge på bilder eller försök tvinga fram dem — det är inte värt tiden.
- **Lägg i varukorg via JS-klick, inte skärmkoordinater.** Hitta rätt kort via `textContent.includes(produktnamn)`, klicka dess "Lägg till"-knapp direkt (`btn.click()`). Skärmkoordinater är opålitliga (skalskillnad mellan skärmdump och verklig viewport).
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
