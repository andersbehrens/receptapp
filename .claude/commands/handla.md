Kör en assisterad ICA-handla-runda. Användaren har klistrat in sin inköpslista efter det här kommandot (från "Dela lista"-knappen i receptappen).

Butik (om inget annat sägs): https://handlaprivatkund.ica.se/stores/1004028

## Gör så här

1. Öppna butikens sida i Chrome (Claude in Chrome-tillägget krävs — be användaren koppla in det om det inte redan är anslutet). Om en cookie-modal dyker upp: klicka "Avvisa alla" (integritetsvänligast) — bara en gång i början av sessionen.
2. Sök fram **alla** varor i listan efter varandra (`navigate` till `.../search?q=<term>`), och samla namn/pris/vikt via `javascript_tool` (se "Tokeneffektivitet" nedan) — inte en i taget med väntan på svar mellan varje.
3. Bygg en interaktiv plockista (Artifact, se `artifact-design`-skill) där användaren klickar fram alternativ + mängd per vara, istället för att lista allt som text i chatten. Om en artifact redan finns för samma recept: uppdatera bara `ITEMS`-arrayen i den, återanvänd CSS/logik/URL rakt av.
4. Användaren skickar tillbaka sina val (via textrutan i artifacten, se nedan).
5. Lägg de valda produkterna i den riktiga varukorgen på ICA:s sida.
6. Sammanfatta på slutet: vilka varor som lades i varukorgen, och vilka (om några) användaren hoppade över/behöver lösa själv.

## Tokeneffektivitet (lärt av tidigare körningar — gör så här från början)

- **Läs produktresultat med JS, inte skärmdumpar.** Extrahera text/pris/vikt via `javascript_tool`:
  ```js
  Array.from(document.querySelectorAll('.product-card-container')).slice(0,5).map(c=>{
    const img=c.querySelector('img'); return {image:img?img.src:null, text:c.textContent.replace(/\s+/g,' ').trim()};
  })
  ```
  En skärmdump kostar mångdubbelt fler tokens än samma information som text. Ta bara en skärmdump när du faktiskt behöver se layout/bekräfta något visuellt (t.ex. slutgiltig varukorgskontroll).
- **Lägg i varukorg via JS-klick, inte skärmkoordinater.** Hitta rätt kort via `textContent.includes(produktnamn)`, klicka dess "Lägg till"-knapp direkt (`btn.click()`). Skärmkoordinater är opålitliga (skalskillnad mellan skärmdump och verklig viewport).
- **Vänta ~1.5–2s efter varje "Lägg till"-klick innan du navigerar vidare.** Navigerar du direkt kan lägg-till-anropet hinna avbrytas och varan försvinner tyst ur korgen (hände en hel körning — upptäcktes bara för att totalsumman inte stämde).
- **Verifiera en gång i slutet, inte efter varje vara.** Läs varukorgens totalsumma/antal (liten `zoom` på badge-ikonen, eller `get_page_text`) efter ALLA tillägg, jämför mot förväntad summa. Full skärmdump av hela varukorgen bara om summan inte stämmer.
- **Batcha aggressivt.** Ett `browser_batch`-anrop med navigate → wait → javascript_tool → wait → navigate → ... för flera varor i rad, istället för separata anrop per steg.

## Artifact-specifika lärdomar (gäller om du bygger/uppdaterar plockistan)

- **`<meta charset="UTF-8">` allra först i filen** — annars kan å/ä/ö renderas som mojibake beroende på hur den publicerade sidan serveras.
- **Lita inte på `sendPrompt()` eller `navigator.clipboard.writeText()`** i den publicerade (inloggade) artifact-kontexten — båda kan tystna utan fel. Ha alltid en synlig, förvald `<textarea readonly>` som fallback som användaren kan markera och Cmd+C:a manuellt.
- **Spara val i `localStorage`** (wrappat i try/catch) så att en omdeploy eller omladdning aldrig raderar det användaren redan klickat i.
- Testa lokalt (`python3 -m http.server` i en scratch-mapp) innan du publicerar om — det är gratis och fångar buggar som annars kräver en hel publish-cykel att upptäcka.

## Viktiga gränser

- **Rör aldrig inloggning eller betalning.** Användaren loggar in och slutför köpet själv efteråt. Skriv aldrig in lösenord, personnummer eller kortuppgifter.
- Lägg bara varor i varukorgen — gå aldrig vidare till kassan/checkout på egen hand.
- Om en vara är tvetydig (t.ex. "mjölk" — vilken fetthalt?) fråga användaren istället för att gissa.

Se `CLAUDE.md` → "Inköpslista" för bakgrund om varför det inte finns en inbyggd e-handelsintegration i själva appen.
