Kör en assisterad ICA-handla-runda. Användaren har klistrat in sin inköpslista efter det här kommandot (från "Dela lista"-knappen i receptappen).

Butik (om inget annat sägs): https://handlaprivatkund.ica.se/stores/1004028

## Gör så här

1. Öppna butikens sida i Chrome (Claude in Chrome-tillägget krävs — be användaren koppla in det om det inte redan är anslutet).
2. Gå igenom listan en vara i taget. Sök fram varan i butikens sökfält.
3. Visa användaren de bästa träffarna (namn, bild, pris) — högst 3-4 alternativ, inte hela sökresultatet.
4. Användaren väljer ett alternativ, ber om ny sökning, eller hoppar över varan.
5. När ett val är bekräftat: lägg produkten i den riktiga varukorgen på ICA:s sida.
6. Om ingen rimlig matchning hittas efter ett par försök: hoppa vidare, notera varan som olöst, fortsätt med nästa.
7. Sammanfatta på slutet: vilka varor som lades i varukorgen, och vilka (om några) användaren behöver lösa själv.

## Viktiga gränser

- **Rör aldrig inloggning eller betalning.** Användaren loggar in och slutför köpet själv efteråt. Skriv aldrig in lösenord, personnummer eller kortuppgifter.
- Lägg bara varor i varukorgen — gå aldrig vidare till kassan/checkout på egen hand.
- Om en vara är tvetydig (t.ex. "mjölk" — vilken fetthalt?) fråga användaren istället för att gissa.

Se `CLAUDE.md` → "Inköpslista" för bakgrund om varför det inte finns en inbyggd e-handelsintegration i själva appen.
