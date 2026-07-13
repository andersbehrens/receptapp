# Recept – Projektbeskrivning för Claude

## Vad är detta?

En Progressive Web App (PWA) med familjens recept – en del avfotograferade ur en kokbok, en del handskrivna lappar. Appen låter dig bläddra/söka recept, bygga en inköpslista (avbockningsbar) och öppna ett "laga-läge" med stor text i två spalter, tänkt att castas till en Nest Hub Max eller liknande skärm i köket.

## Teknisk stack

- Ren HTML/CSS/JS – ingen ram, ingen bundler
- Hash-baserad routing – `#`, `#recept/<id>`, `#inkopslista`, `#laga/<id>`
- PWA med service worker (`sw.js`) – cache-first, installerbar
- Markdown-rendering av receptfiler via `marked.lexer()` (client-side, ingen build-process)
- Lokal dev-server: `python3 -m http.server 8420` i projektmappen

## Filstruktur

```
receptApp/
├── index.html            # Appskal: header (inkl. google-cast-launcher), sök, #app-root, #cook-root
├── receiver.html          # Custom Cast Receiver – körs på Nest Hub Max, se "Casting" nedan
├── sw.js                 # Service worker (cache: recept-v1, öka vid varje ändring)
├── manifest.json          # PWA-manifest (Tomat-tema, theme_color #A8322D)
├── css/style.css          # Allt CSS – Tomat-tema
├── js/
│   ├── app.js             # Router, markdown-parser, alla vyer, inköpslista, laga-läge, cast
│   └── marked.min.js      # Markdown-lexer (samma version som neuroApp)
├── recept/*.md             # Ett recept per fil – källan till sanning
├── icons/                 # icon.svg, icon-192.png, icon-512.png
└── moodboard.html          # Designmoodboard (ej del av appen)
```

## Receptformat (recept/*.md)

Varje fil har frontmatter + tre möjliga sektioner. Se valfri fil i `recept/` som mall.

```markdown
---
title: "Receptnamn"
category: "Middag"        # Middag | Soppa | Bakverk | Bröd & deg
portioner: 4
tid: "ca 30 min"
taggar: [tagg1, tagg2]
källa: "PXL_....jpg"
---

## Om receptet
(valfritt) intro-text.

## Ingredienser
- ingrediens 1
- ingrediens 2

### Undergrupp (valfritt, t.ex. "Pajdeg", "Fyllning")
- ingrediens 3

## Gör så här
1. steg ett
2. steg två

> (valfritt) tips/anteckning som blockquote
```

`js/app.js` parsar detta med `marked.lexer()` (se `parseFrontmatter` / `parseRecipeBody`). Rubrikerna `## Om receptet`, `## Ingredienser`, `## Gör så här` styr vilken sektion som tolkas – ändra inte deras ordalydelse utan att uppdatera parsern.

## Lägga till ett nytt recept

1. Skapa `recept/nytt-recept.md` enligt formatet ovan.
2. Lägg till filnamnet i `RECIPE_FILES`-arrayen i `js/app.js`.
3. Lägg till samma sökväg (`recept/nytt-recept.md`) i `ASSETS`-arrayen i `sw.js` och **öka `CACHE_NAME`**.
4. Om det är en ny kategori: lägg till ikon i `CATEGORY_ICONS` i `js/app.js`.
5. (Valfritt) lägg till en specifik receptikon i `RECIPE_ICONS`.

## Inköpslista

Lagras i `localStorage` under nyckeln `recept_shoppinglist_v1`. Ingredienser dedupliceras på normaliserad text (`normalize()`) – samma ingrediens från flera recept slås ihop och visar alla källor. `checked` betyder "behöver inte köpas" – används både för "har redan hemma" (bockas av innan handling) och "redan lagt i vagnen" (bockas av under handling).

**"Dela lista"-knappen** (`shareList()`) tar de obockade varorna, bygger en textlista, och använder `navigator.share()` (native delningsruta på mobil) med fallback till `navigator.clipboard.writeText()` (skrivbord). Tänkt användning: dela listan till sig själv för att sedan klistra in den i ett Claude-samtal på en annan enhet.

**Varför ingen inbyggd e-handelsintegration (t.ex. ICA):** utforskat 2026-07-11. ICA:s handla-sida skickar `Content-Security-Policy: frame-ancestors 'self'`, så den går inte att bädda in i en iframe i appen. De har inget publikt API en statisk GitHub Pages-sida kan anropa (CORS), och deras varukorg är knuten till session-cookies på deras egen domän – appen kan alltså tekniskt inte lägga varor i en riktig ICA-varukorg själv. Rätt lösning istället: en assisterad "handla-runda" där Claude (med Chrome-tillägget anslutet) går igenom ICA:s riktiga sida live, matchar produkter mot listan, och lägger dem i användarens riktiga varukorg – inte kod som ligger i appen. Willys undersöktes också (se `willys-agent`-projektet på GitHub) men kräver personnummer + lösenord via ett oofficiellt reverse-engineerat API – inget Claude ska hantera.

## Laga-läge (`#laga/<id>`)

Helskärmsvy (`.cook-view`, `position:fixed; inset:0`) med två spalter (ingredienser/steg). `fitCookView()` i `app.js` mäter `view.scrollHeight` mot `view.clientHeight` och minskar `font-size` på `.cook-scale` i en loop tills allt innehåll får plats utan scroll (golv: 11px). I **stående läge** (`orientation:portrait` – oavsett bredd) stängs auto-fit av och vyn tillåter scroll istället (en spalt). Liggande läge (även på en smal telefon) får alltid tvåspalts-auto-fit.

## Casting till Nest Hub Max

Två lager, i den ordning `startCast()` i `app.js` provar dem:

1. **Egen registrerad Google Cast Custom Receiver** (`receiver.html`) – riktig en-tryck-cast via `google-cast-launcher` i headern. Kräver `CAST_APP_ID` (konstant längst upp i "Casta till skärm"-sektionen i `app.js`) satt till ett App ID från [cast.google.com/publish](https://cast.google.com/publish). **Är aktiverat sedan 2026-07-11** med `CAST_APP_ID = '41D888A8'` (appnamn "Recept", status Unpublished). Nest Hub Max är registrerad som testenhet under Devices-fliken (serienummer `03280YCAB04WTH`).
   - `receiver.html` laddar Cast Receiver-SDK:n, lyssnar på det anpassade namespace:t `urn:x-cast:com.receptrosso.cast`, och när den får ett meddelande `{hash: "laga/<id>"}` sätter den `iframe.src = 'index.html#' + hash` – dvs den återanvänder hela laga-läget (auto-fit, mörkt tema) rakt av. Ingen egen renderingskod i receiver.html.
   - Sändarsidan (`initCastSdk`, `sendCastMessage`, `syncCastToCurrentRoute`) laddar `cast_sender.js`, initierar `CastContext` med `CAST_APP_ID`, och skickar aktuellt recepts hash så fort en session startar **eller** när man navigerar till `#laga/<id>` medan en session redan är aktiv (så att bläddring lokalt speglas live på skärmen).
   - **Så länge appen är "Unpublished"** kan den bara casta till enheter registrerade under Devices-fliken (serienummer, hittas i Google Home-appen: håll in enhetens platta → inställningar → enhetsinformation, eller ingraverat på baksidan under G-loggan). Att lägga till en ny enhet kan ta ~15 min innan det slår igenom.
   - **Känd fälla (löst 2026-07-11):** en **installerad** PWA (hemskärmsikon) räknas av Android som en egen app, skild från "vanliga" Chrome, med egna behörigheter. Om castknappen visar **"Inga tillgängliga enheter"** i den installerade appen men fungerar fint i en vanlig Chrome-flik (testa t.ex. youtube.com för att verifiera att nätverk/wifi inte är problemet) – kontrollera att appen fått behörigheten **"Enheter i närheten"/"Lokalt nätverk"** i telefonens Inställningar → Appar. `showCastGuide()`s tipsruta nämner samma sak.
2. **Fallback (`navigator.presentation.requestSession`)** – provas tyst om lager 1 inte är konfigurerat/tillgängligt. Opålitligt i praktiken (särskilt Android Chrome, se `showCastGuide`-kommentaren), men kostar inget att försöka.
3. **Instruktionsguide (`showCastGuide()`)** – sista fallback, visas alltid om 1 och 2 misslyckas. En modal med steg-för-steg för webbläsarens egna inbyggda "Casta…"-funktion. Fungerar alltid, oavsett webbläsarstöd.

## Publicering på GitHub Pages

Samma mönster som neuroApp. Appen hostar på `https://andersbehrens.github.io/receptapp/`. Repot är publikt (`andersbehrens/receptapp`).

```bash
git add <filer>
git commit -m "Beskrivande meddelande"
git push
```

GitHub Pages deployas automatiskt inom ~1 minut. Testa i inkognitofönster.

**Alla sökvägar måste vara relativa** (ingen ledande `/`) – annars fungerar de inte på GitHub Pages. Gäller `sw.js` (`ASSETS`), `js/app.js` (`fetch('recept/...')`), `index.html`/`manifest.json`.

**Bumpa service worker-version:** varje gång filer läggs till eller ändras måste `CACHE_NAME` i `sw.js` ökas, annars använder installerade appar gammal cache.
