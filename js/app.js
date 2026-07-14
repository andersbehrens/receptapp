/* ==========================================================
   Recept — app.js
   Router + markdown-parser + vyer + inköpslista + laga-läge
   ========================================================== */

// GitHub Pages cachar sw.js i sitt CDN i 10 minuter (cache-control: max-age=600).
// Utan cache-busting kan en telefon fortsätta använda en gammal service worker
// i upp till 10 minuter efter en deploy, oavsett hur många gånger appen
// stängs/öppnas. Bumpa den här strängen vid varje deploy så registreringen
// alltid hämtar sw.js färskt (query-strängen kringgår CDN-cachen helt).
const SW_REG_VERSION = 'v15';

const RECIPE_FILES = [
  'basic-pizzadeg.md',
  'belugalasagne.md',
  'kottfarspaj-picknick.md',
  'snabbaste-biffen.md',
  'salsicciafars-spaghetti.md',
  'goda-soppan-elsass.md',
  'banankaka.md',
  'glasstarta.md',
  'potatis-purjoloekssoppa.md',
];

const CATEGORY_ORDER = ['Middag', 'Soppa', 'Bakverk', 'Bröd & deg'];
const CATEGORY_ICONS = { 'Middag': '🍽️', 'Soppa': '🍲', 'Bakverk': '🍰', 'Bröd & deg': '🍞' };
const RECIPE_ICONS = {
  'kottfarspaj-picknick': '🥧',
  'belugalasagne': '🥬',
  'basic-pizzadeg': '🍕',
  'snabbaste-biffen': '🥩',
  'salsicciafars-spaghetti': '🌭',
  'goda-soppan-elsass': '🍲',
  'potatis-purjoloekssoppa': '🥔',
  'banankaka': '🍌',
  'glasstarta': '🍨',
};

const SHOPLIST_KEY = 'recept_shoppinglist_v1';

// Synkar inköpslistan till en liten Cloudflare Worker (+ KV-lagring) så
// /handla kan läsa den direkt utan att användaren behöver dela listan till
// sig själv och klistra in den. Ingen hemlighet inblandad — Workern är
// öppen (ingen auth), eftersom en inköpslista inte är känslig data och detta
// helt undviker att bädda in någon nyckel i publik klientkod (se CLAUDE.md
// → "Inköpslista" → "Synk via Cloudflare Worker").
const SYNC_WORKER_URL = 'https://receptapp-list.andersbehrens.workers.dev';

let RECIPES = [];
const state = { query: '', category: 'Alla' };

const root = document.getElementById('app-root');
const cookRoot = document.getElementById('cook-root');

/* ---------- Helpers ---------- */

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function normalize(text) {
  return String(text).trim().toLowerCase().replace(/\s+/g, ' ');
}

let toastTimer;
function showToast(msg, duration = 2200) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

/* ---------- Casta till skärm ----------
   Riktig Google Cast-integration mot en egen registrerad Custom Receiver
   (receiver.html i det här repot). Kräver ett App ID från
   https://cast.google.com/publish (engångsregistrering, $5) — sätt det
   nedan i CAST_APP_ID. Tills dess (CAST_APP_ID === null) faller allt
   tillbaka på ett tyst försök med navigator.presentation och därefter en
   instruktionsruta som alltid fungerar, oavsett webbläsarstöd. */

const CAST_APP_ID = '41D888A8'; // registrerad på cast.google.com/publish, receiver.html
const CAST_NAMESPACE = 'urn:x-cast:com.receptrosso.cast';
let castContext = null;
let castReady = false;
let castAckListenerSession = null;
let castPendingHash = null;
let castRetryTimer = null;

// Mottagaren (receiver.html) hinner inte alltid registrera sin
// meddelandelyssnare innan sessionen anses "startad" — då försvinner det
// första meddelandet i tomma intet och mottagaren fastnar på tomat-vänteskärmen.
// Skickar därför om med jämna mellanrum tills mottagaren bekräftar (ack).
function ensureCastAckListener(session) {
  if (castAckListenerSession === session) return;
  castAckListenerSession = session;
  session.addMessageListener(CAST_NAMESPACE, (_ns, message) => {
    let data = message;
    if (typeof message === 'string') {
      try { data = JSON.parse(message); } catch (e) { return; }
    }
    if (data && data.ack && data.ack === castPendingHash) {
      castPendingHash = null;
      clearTimeout(castRetryTimer);
    }
  });
}

// Riktig Cast-hårdvara kan ta betydligt mer än ett par sekunder att starta
// mottagarappen (kallstart av receiver.html på själva Nest Hub Max-enheten),
// så vi håller ut i nästan en minut innan vi ger upp — att skicka om samma
// meddelande är ofarligt (idempotent) så det kostar inget att vara tålmodig.
const CAST_RETRY_INTERVAL_MS = 1200;
const CAST_RETRY_MAX_ATTEMPTS = 40; // ~48s

function sendCastMessage(hash, attempt) {
  if (!castContext) return false;
  const session = castContext.getCurrentSession();
  if (!session) return false;
  ensureCastAckListener(session);
  castPendingHash = hash;
  session.sendMessage(CAST_NAMESPACE, { hash }).catch(() => {});
  clearTimeout(castRetryTimer);
  const nextAttempt = (attempt || 0) + 1;
  if (nextAttempt < CAST_RETRY_MAX_ATTEMPTS) {
    castRetryTimer = setTimeout(() => {
      if (castPendingHash === hash) sendCastMessage(hash, nextAttempt);
    }, CAST_RETRY_INTERVAL_MS);
  }
  return true;
}

function syncCastToCurrentRoute() {
  const hash = currentRoute();
  if (hash.startsWith('laga/')) sendCastMessage(hash);
}

function stopCasting() {
  castPendingHash = null;
  clearTimeout(castRetryTimer);
  if (!castContext) return;
  const session = castContext.getCurrentSession();
  if (session) session.endSession(true).catch(() => {});
}

function initCastSdk() {
  if (!CAST_APP_ID) return;
  window['__onGCastApiAvailable'] = (isAvailable) => {
    if (!isAvailable || !window.cast || !window.chrome) return;
    castContext = cast.framework.CastContext.getInstance();
    castContext.setOptions({
      receiverApplicationId: CAST_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    castReady = true;
    const launcher = document.getElementById('cast-launcher');
    if (launcher) launcher.hidden = false;
    castContext.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (e) => {
      if (e.sessionState === cast.framework.SessionState.SESSION_STARTED
        || e.sessionState === cast.framework.SessionState.SESSION_RESUMED) {
        syncCastToCurrentRoute();
      } else if (e.sessionState === cast.framework.SessionState.SESSION_ENDED) {
        castPendingHash = null;
        castAckListenerSession = null;
        clearTimeout(castRetryTimer);
      }
    });
  };
  const script = document.createElement('script');
  script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
  document.head.appendChild(script);
}

function closeCastGuide() {
  const el = document.getElementById('cast-guide');
  if (el) el.classList.remove('show');
}

/* ---------- Info-guide ---------- */

function closeInfoGuide() {
  const el = document.getElementById('info-guide');
  if (el) el.classList.remove('show');
}

function showInfoGuide() {
  let el = document.getElementById('info-guide');
  if (!el) {
    el = document.createElement('div');
    el.id = 'info-guide';
    el.className = 'info-guide-overlay';
    el.addEventListener('click', (e) => { if (e.target === el) closeInfoGuide(); });
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div class="info-guide">
      <button class="info-guide-close" data-action="close-info-guide" aria-label="Stäng">✕</button>
      <div class="info-guide-title">ℹ️ Så funkar appen</div>
      <div class="info-section">
        <h4>🛒 Inköpslistan</h4>
        <p>Öppna ett recept och tryck "Lägg till i inköpslistan". Bocka av det du redan har hemma. Listan sparas automatiskt på din telefon och synkas i bakgrunden till en liten molntjänst varje gång den ändras — inget du behöver göra själv.</p>
      </div>
      <div class="info-section">
        <h4>🧑‍🍳 Handla (på en dator)</h4>
        <p>Öppna Claude Code i receptApp-mappen på en dator och skriv <code>/handla</code>. Din senaste inköpslista hämtas automatiskt (samma lista som på telefonen), och Claude hjälper till att lägga varorna i din riktiga ICA-varukorg — du loggar in och betalar själv efteråt.</p>
      </div>
      <div class="info-section">
        <h4>📅 Veckans recept</h4>
        <p>Skriv <code>/veckans-recept</code> i samma Claude Code-samtal för ett förslag på vad som är värt att laga denna vecka, baserat på ICA:s aktuella erbjudanden.</p>
      </div>
      <div class="info-section">
        <h4>📡 Casta till skärm</h4>
        <p>Öppna ett recepts laga-läge och tryck på castknappen (📡) för att visa stegen på en Nest Hub Max eller liknande skärm i köket.</p>
      </div>
      <div class="info-section">
        <h4>👥 Dela med familjen</h4>
        <p>Vem som helst kan installera appen på sin egen telefon via samma adress. Recept, laga-läge och casting fungerar oberoende på varje telefon. Inköpslistan delas dock via samma synk — den senaste ändringen (oavsett vems telefon) är den som <code>/handla</code> hämtar.</p>
      </div>
    </div>
  `;
  requestAnimationFrame(() => el.classList.add('show'));
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function showCastGuide() {
  let el = document.getElementById('cast-guide');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cast-guide';
    el.className = 'cast-guide-overlay';
    el.addEventListener('click', (e) => { if (e.target === el) closeCastGuide(); });
    document.body.appendChild(el);
  }

  // Installerad app (standalone) har ingen webbläsarmeny/adressfält alls – då
  // är "öppna menyn och tryck Casta" ett omöjligt steg. Ge en annan väg tills
  // den riktiga castknappen (CAST_APP_ID) är aktiverad.
  const steps = isStandalone()
    ? `
      <li>Vrid gärna telefonen till <b>liggande läge</b> – då får laga-läget plats utan att scrolla på skärmen.</li>
      <li>Den installerade appen saknar webbläsarmeny, så öppna istället <b>samma adress i vanliga Chrome</b> (inte hem­skärms­ikonen).</li>
      <li>Tryck på menyn (⋮) i Chrome → <b>"Casta…"</b> → välj <b>Nest Hub Max</b>.</li>
    `
    : `
      <li>Vrid gärna telefonen till <b>liggande läge</b> – då får laga-läget plats utan att scrolla på skärmen.</li>
      <li>Öppna webbläsarens meny (de tre punkterna ⋮ eller castikonen i adressfältet).</li>
      <li>Tryck på <b>"Casta…"</b>.</li>
      <li>Välj <b>Nest Hub Max</b> i listan.</li>
    `;

  el.innerHTML = `
    <div class="cast-guide">
      <button class="cast-guide-close" data-action="close-cast-guide" aria-label="Stäng">✕</button>
      <div class="cast-guide-title">📡 Så castar du till Nest Hub Max</div>
      <ol class="cast-guide-steps">${steps}</ol>
      <div class="cast-guide-tip">💡 Telefonen och Nest Hub Max måste vara på samma wifi-nätverk. Hittar castknappen "Inga tillgängliga enheter" i den installerade appen: kolla att Chrome/appen har fått behörighet till "Enheter i närheten"/"Lokalt nätverk" i telefonens appinställningar.</div>
    </div>
  `;
  requestAnimationFrame(() => el.classList.add('show'));
}

async function startCast(id) {
  const hash = `laga/${encodeURIComponent(id)}`;

  if (castReady && castContext) {
    const existing = castContext.getCurrentSession();
    if (existing) {
      sendCastMessage(hash);
      showToast('Skickar till Nest Hub Max…');
      return;
    }
    try {
      await castContext.requestSession();
      sendCastMessage(hash);
      showToast('Castar laga-läget…');
      return;
    } catch (err) {
      // Cast-SDK:n finns och laddades, men just det här anslutningsförsöket
      // misslyckades (t.ex. tillfälligt strul med enheten). Visa det riktiga
      // felet och låt användaren trycka på castknappen igen — att istället
      // hoppa till "casta manuellt"-guiden här är förvirrande och gömmer
      // vad som faktiskt gick fel.
      if (err === 'cancel') return;
      console.error('Cast requestSession misslyckades:', err);
      showToast(`Kunde inte ansluta till Nest Hub Max (${err}). Testa castknappen igen.`, 5000);
      return;
    }
  }

  const url = `${location.origin}${location.pathname}#${hash}`;
  if (navigator.presentation && navigator.presentation.requestSession) {
    try {
      await navigator.presentation.requestSession(url);
      showToast('Castar laga-läget…');
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  showCastGuide();
}

/* ---------- Markdown → recept-parser ---------- */

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  m[1].split('\n').forEach((line) => {
    if (!line.trim()) return;
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      meta[key] = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
    } else {
      meta[key] = val.replace(/^"|"$/g, '').replace(/"$/, '');
    }
  });
  return { meta, body: m[2] };
}

function parseRecipeBody(body) {
  const tokens = marked.lexer(body);
  const result = { intro: '', ingredientGroups: [], steps: [], note: '' };
  let section = null;
  let currentGroup = null;
  const introParts = [];

  tokens.forEach((tok) => {
    if (tok.type === 'heading' && tok.depth === 2) {
      const t = tok.text.toLowerCase();
      if (t.indexOf('ingrediens') !== -1) { section = 'ingredienser'; currentGroup = null; }
      else if (t.indexOf('gör så här') !== -1) { section = 'steg'; }
      else if (t.indexOf('om receptet') !== -1) { section = 'om'; }
      else { section = null; }
      return;
    }
    if (tok.type === 'heading' && tok.depth === 3 && section === 'ingredienser') {
      currentGroup = { name: tok.text, items: [] };
      result.ingredientGroups.push(currentGroup);
      return;
    }
    if (tok.type === 'list') {
      if (section === 'ingredienser') {
        if (!currentGroup) { currentGroup = { name: null, items: [] }; result.ingredientGroups.push(currentGroup); }
        tok.items.forEach((li) => currentGroup.items.push(li.text));
      } else if (section === 'steg') {
        tok.items.forEach((li) => result.steps.push(li.text));
      }
      return;
    }
    if (tok.type === 'paragraph' && section === 'om') {
      introParts.push(tok.text);
      return;
    }
    if (tok.type === 'blockquote') {
      let text = tok.text;
      if (!text && tok.tokens) text = tok.tokens.map((t2) => t2.text || '').join(' ');
      result.note = text;
      return;
    }
  });

  result.intro = introParts.join('\n\n');
  return result;
}

function buildRecipe(id, raw) {
  const { meta, body } = parseFrontmatter(raw);
  const parsed = parseRecipeBody(body);
  const taggar = Array.isArray(meta.taggar) ? meta.taggar : [];
  const category = meta.category || 'Övrigt';
  const allIngredientText = parsed.ingredientGroups.flatMap((g) => g.items).join(' ');
  return {
    id,
    title: meta.title || id,
    category,
    portioner: meta.portioner || '',
    tid: meta.tid || '',
    taggar,
    source: meta['källa'] || '',
    intro: parsed.intro,
    note: parsed.note,
    ingredientGroups: parsed.ingredientGroups,
    steps: parsed.steps,
    icon: RECIPE_ICONS[id] || CATEGORY_ICONS[category] || '🍴',
    _searchBlob: [meta.title, category, taggar.join(' '), allIngredientText]
      .join(' ').toLowerCase(),
  };
}

async function loadAllRecipes() {
  const list = await Promise.all(RECIPE_FILES.map(async (fname) => {
    const res = await fetch(`recept/${fname}`);
    const raw = await res.text();
    return buildRecipe(fname.replace(/\.md$/, ''), raw);
  }));
  list.sort((a, b) => a.title.localeCompare(b.title, 'sv'));
  return list;
}

/* ---------- Inköpslista (localStorage) ---------- */

function getList() {
  try { return JSON.parse(localStorage.getItem(SHOPLIST_KEY)) || []; }
  catch (e) { return []; }
}

function saveList(list) {
  localStorage.setItem(SHOPLIST_KEY, JSON.stringify(list));
  updateCartBadge();
  scheduleWorkerSync();
}

let workerSyncTimer;
function scheduleWorkerSync() {
  clearTimeout(workerSyncTimer);
  workerSyncTimer = setTimeout(syncListToWorker, 1500);
}

// Skriver de obockade varorna till Workern (och därmed KV) vid varje
// ändring, så /handla alltid kan hämta senaste listan direkt. Tyst fel —
// funkar appen ändå utan nätverk/synk är det bara bekvämligheten som uteblir.
async function syncListToWorker() {
  try {
    const items = getList().filter((x) => !x.checked).map((x) => x.text);
    await fetch(SYNC_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updated: new Date().toISOString(), items }),
    });
  } catch (err) {
    console.error('Synk av inköpslistan misslyckades', err);
  }
}

function updateCartBadge() {
  const remaining = getList().filter((x) => !x.checked).length;
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  if (remaining > 0) { badge.textContent = String(remaining); badge.hidden = false; }
  else { badge.hidden = true; }
}

function addRecipeToShoppingList(recipe) {
  const list = getList();
  let added = 0;
  recipe.ingredientGroups.forEach((g) => g.items.forEach((raw) => {
    const key = normalize(raw);
    const existing = list.find((x) => x.id === key);
    if (existing) {
      if (!existing.sources.includes(recipe.title)) existing.sources.push(recipe.title);
    } else {
      list.push({ id: key, text: raw, sources: [recipe.title], checked: false });
      added += 1;
    }
  }));
  saveList(list);
  showToast(added > 0 ? `${added} ingredienser tillagda i inköpslistan` : 'Ingredienserna fanns redan i listan');
}

function toggleItem(id) {
  const list = getList();
  const item = list.find((x) => x.id === id);
  if (!item) return;
  item.checked = !item.checked;
  saveList(list);
  if (currentRoute() === 'inkopslista') renderShoppingList();
}

function removeItem(id) {
  saveList(getList().filter((x) => x.id !== id));
  if (currentRoute() === 'inkopslista') renderShoppingList();
}

function clearChecked() {
  saveList(getList().filter((x) => !x.checked));
  if (currentRoute() === 'inkopslista') renderShoppingList();
}

function clearAll() {
  if (!getList().length) return;
  if (!confirm('Rensa hela inköpslistan?')) return;
  saveList([]);
  if (currentRoute() === 'inkopslista') renderShoppingList();
}

function addCustomItem(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const list = getList();
  const key = normalize(trimmed);
  if (list.find((x) => x.id === key)) { showToast('Finns redan i listan'); return; }
  list.push({ id: key, text: trimmed, sources: ['Eget tillägg'], checked: false });
  saveList(list);
  if (currentRoute() === 'inkopslista') renderShoppingList();
}

async function shareList() {
  const items = getList().filter((x) => !x.checked);
  if (!items.length) { showToast('Inget kvar att handla — allt är avbockat.'); return; }
  const text = `Inköpslista:\n${items.map((x) => `- ${x.text}`).join('\n')}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Inköpslista', text }); return; }
    catch (err) { if (err && err.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Listan kopierad — klistra in där du vill skicka den.', 3500);
  } catch (err) {
    showToast('Kunde inte dela eller kopiera listan.');
  }
}

/* ---------- Router ---------- */

function currentRoute() {
  return location.hash.replace(/^#/, '');
}

function router() {
  const hash = currentRoute();
  if (hash.startsWith('laga/')) {
    renderCook(decodeURIComponent(hash.slice(5)));
    syncCastToCurrentRoute();
    return;
  }
  cookRoot.innerHTML = '';
  if (hash.startsWith('recept/')) renderRecipeDetail(decodeURIComponent(hash.slice(7)));
  else if (hash === 'inkopslista') renderShoppingList();
  else renderHome();
  window.scrollTo(0, 0);
}

/* ---------- Vy: Startsida / bläddra & sök ---------- */

function renderHome() {
  const presentCats = [...new Set(RECIPES.map((r) => r.category))];
  const ordered = CATEGORY_ORDER.filter((c) => presentCats.includes(c));
  const rest = presentCats.filter((c) => !CATEGORY_ORDER.includes(c)).sort((a, b) => a.localeCompare(b, 'sv'));
  const cats = ['Alla', ...ordered, ...rest];

  root.innerHTML = `
    <div class="chips" id="chips">
      ${cats.map((c) => `<button class="chip${c === state.category ? ' active' : ''}" data-cat="${escapeHtml(c)}">${c === 'Alla' ? 'Alla' : `${CATEGORY_ICONS[c] || ''} ${escapeHtml(c)}`}</button>`).join('')}
    </div>
    <div class="section-title" id="grid-title"></div>
    <div class="recipe-grid" id="grid"></div>
  `;
  updateGrid();
  document.querySelectorAll('#chips .chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.category = btn.dataset.cat;
      document.querySelectorAll('#chips .chip').forEach((b) => b.classList.toggle('active', b === btn));
      updateGrid();
    });
  });
}

function updateGrid() {
  const q = state.query.trim().toLowerCase();
  const list = RECIPES.filter((r) => (state.category === 'Alla' || r.category === state.category)
    && (!q || r._searchBlob.includes(q)));
  const gridTitle = document.getElementById('grid-title');
  const grid = document.getElementById('grid');
  if (!gridTitle || !grid) return;
  if (!list.length) {
    gridTitle.textContent = '';
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="big">🔍</div>Inga recept hittades.</div>`;
    return;
  }
  gridTitle.textContent = `${list.length} recept`;
  grid.innerHTML = list.map((r) => `
    <a class="recipe-card" href="#recept/${encodeURIComponent(r.id)}">
      <div class="recipe-card-icon">${r.icon}</div>
      <div class="recipe-card-title">${escapeHtml(r.title)}</div>
      <div class="recipe-card-meta">${[r.tid, r.portioner].filter(Boolean).map(escapeHtml).join(' · ')}</div>
      ${r.taggar.length ? `<div class="recipe-card-tags">${r.taggar.slice(0, 3).map((t) => `<span class="recipe-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    </a>
  `).join('');
}

/* ---------- Vy: Receptdetalj ---------- */

function renderRecipeDetail(id) {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) {
    root.innerHTML = `<div class="empty-state"><div class="big">🍅</div>Receptet hittades inte.<br><br><a class="btn btn-primary" href="#">Till startsidan</a></div>`;
    return;
  }
  const groupsHtml = r.ingredientGroups.map((g) => `
    ${g.name ? `<h3>${escapeHtml(g.name)}</h3>` : ''}
    <ul class="ingr-list">${g.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
  `).join('');
  const stepsHtml = `<ol class="steps-list">${r.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`;

  root.innerHTML = `
    <a class="back-link" href="#">← Alla recept</a>
    <div class="recipe-header">
      <h1>${escapeHtml(r.title)}</h1>
      <div class="recipe-meta-row">
        <span>${r.icon}</span>
        ${[r.tid, r.portioner].filter(Boolean).map(escapeHtml).join(' <span class="dot">·</span> ')}
      </div>
      ${r.taggar.length ? `<div class="recipe-card-tags" style="margin-bottom:14px">${r.taggar.map((t) => `<span class="recipe-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    </div>
    ${r.intro ? `<div class="recipe-intro">${escapeHtml(r.intro).replace(/\n\n/g, '<br><br>')}</div>` : ''}
    <div class="action-row">
      <button class="btn btn-primary" data-action="add-to-list" data-id="${escapeHtml(r.id)}">🛒 Lägg till i inköpslistan</button>
      <a class="btn btn-gold" href="#laga/${encodeURIComponent(r.id)}">📺 Öppna laga-läge</a>
      <button class="btn btn-outline" data-action="cast" data-id="${escapeHtml(r.id)}">📡 Casta till Nest Hub Max</button>
    </div>
    <div class="recipe-block">
      <h2>Ingredienser</h2>
      ${groupsHtml}
    </div>
    <div class="recipe-block">
      <h2>Gör så här</h2>
      ${stepsHtml}
      ${r.note ? `<div class="recipe-note">💡 ${escapeHtml(r.note)}</div>` : ''}
    </div>
    ${r.source ? `<div class="recipe-source">Källa: ${escapeHtml(r.source)}</div>` : ''}
  `;
}

/* ---------- Vy: Inköpslista ---------- */

function shopItemHtml(item) {
  return `
    <div class="shop-item ${item.checked ? 'checked' : ''}">
      <button class="shop-check" data-action="toggle-item" data-id="${escapeHtml(item.id)}">✓</button>
      <div class="shop-text">
        <div class="shop-item-name">${escapeHtml(item.text)}</div>
        ${item.sources && item.sources.length ? `<div class="shop-item-source">Från: ${escapeHtml(item.sources.join(', '))}</div>` : ''}
      </div>
      <button class="shop-remove" data-action="remove-item" data-id="${escapeHtml(item.id)}" aria-label="Ta bort">✕</button>
    </div>
  `;
}

function renderShoppingList() {
  const list = getList();
  const sorted = [...list].sort((a, b) => (a.checked === b.checked
    ? a.text.localeCompare(b.text, 'sv')
    : (a.checked ? 1 : -1)));

  root.innerHTML = `
    <h1 style="font-size:1.4rem;margin-bottom:16px">🛒 Inköpslista</h1>
    ${list.length ? `
      <div class="shop-bar">
        <button class="btn btn-gold" data-action="share-list">📤 Dela lista</button>
        <button class="btn btn-outline" data-action="clear-checked">Rensa avbockade</button>
        <button class="btn btn-outline" data-action="clear-all">Rensa allt</button>
      </div>
      <div class="shop-list">${sorted.map(shopItemHtml).join('')}</div>
    ` : `
      <div class="empty-state"><div class="big">🛒</div>Din inköpslista är tom.<br>Öppna ett recept och tryck på "Lägg till i inköpslistan".</div>
    `}
    <div class="shop-add-row">
      <input id="shop-add-input" type="text" placeholder="Lägg till egen vara…">
      <button class="btn btn-primary" data-action="add-custom-item">Lägg till</button>
    </div>
  `;
  const input = document.getElementById('shop-add-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { addCustomItem(input.value); input.value = ''; }
  });
}

/* ---------- Vy: Laga-läge (cast-optimerad) ---------- */

function cookViewHtml(r) {
  const groupsHtml = r.ingredientGroups.map((g) => `
    ${g.name ? `<div class="cook-ingr-group-name">${escapeHtml(g.name)}</div>` : ''}
    <ul class="cook-ingr-list">${g.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
  `).join('');
  const stepsHtml = `<ol class="cook-steps-list">${r.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`;

  return `
    <div class="cook-view">
      <button class="cook-close" data-action="close-cook" data-id="${escapeHtml(r.id)}" aria-label="Stäng laga-läge">✕</button>
      <button class="cook-cast-btn" data-action="cast" data-id="${escapeHtml(r.id)}" aria-label="Casta till Nest Hub Max">📡</button>
      <div class="cook-scale">
        <div class="cook-label">📺 Laga-läge</div>
        <div class="cook-title">${escapeHtml(r.title)}</div>
        ${(r.portioner || r.tid) ? `<div class="cook-portions">${[r.portioner, r.tid].filter(Boolean).map(escapeHtml).join(' · ')}</div>` : ''}
        <div class="cook-cols">
          <div class="cook-ingr">
            <div class="cook-h">Ingredienser</div>
            ${groupsHtml}
          </div>
          <div class="cook-steps">
            <div class="cook-h">Gör så här</div>
            ${stepsHtml}
          </div>
        </div>
        ${r.note ? `<div class="cook-note">💡 ${escapeHtml(r.note)}</div>` : ''}
      </div>
    </div>
  `;
}

function fitCookView() {
  const view = cookRoot.querySelector('.cook-view');
  const scaleEl = cookRoot.querySelector('.cook-scale');
  if (!view || !scaleEl) return;
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  if (isPortrait) { scaleEl.style.fontSize = ''; return; }

  let fontSize = Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.05);
  fontSize = Math.max(18, Math.min(fontSize, 42));
  scaleEl.style.fontSize = `${fontSize}px`;
  let guard = 0;
  while (view.scrollHeight > view.clientHeight + 2 && fontSize > 11 && guard < 60) {
    fontSize -= 1;
    scaleEl.style.fontSize = `${fontSize}px`;
    guard += 1;
  }
}

function renderCook(id) {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) { cookRoot.innerHTML = ''; location.hash = ''; return; }
  cookRoot.innerHTML = cookViewHtml(r);
  requestAnimationFrame(() => requestAnimationFrame(fitCookView));
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (currentRoute().startsWith('laga/')) fitCookView();
  }, 150);
});

/* ---------- Delegerad klick-hantering ---------- */

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'add-to-list') {
    const recipe = RECIPES.find((r) => r.id === btn.dataset.id);
    if (recipe) addRecipeToShoppingList(recipe);
  } else if (action === 'toggle-item') {
    toggleItem(btn.dataset.id);
  } else if (action === 'remove-item') {
    removeItem(btn.dataset.id);
  } else if (action === 'clear-checked') {
    clearChecked();
  } else if (action === 'clear-all') {
    clearAll();
  } else if (action === 'share-list') {
    shareList();
  } else if (action === 'add-custom-item') {
    const input = document.getElementById('shop-add-input');
    addCustomItem(input.value);
    input.value = '';
    input.focus();
  } else if (action === 'close-cook') {
    stopCasting();
    location.hash = `#recept/${encodeURIComponent(btn.dataset.id)}`;
  } else if (action === 'cast') {
    startCast(btn.dataset.id);
  } else if (action === 'close-cast-guide') {
    closeCastGuide();
  } else if (action === 'show-info') {
    showInfoGuide();
  } else if (action === 'close-info-guide') {
    closeInfoGuide();
  }
});

/* ---------- Init ---------- */

document.getElementById('search-input').addEventListener('input', (e) => {
  state.query = e.target.value;
  if (currentRoute() !== '' && currentRoute() !== '#') {
    location.hash = '';
  } else {
    updateGrid();
  }
});

window.addEventListener('hashchange', router);

async function init() {
  root.innerHTML = `<div class="empty-state"><div class="big">🍅</div>Laddar recept…</div>`;
  try {
    RECIPES = await loadAllRecipes();
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><div class="big">⚠️</div>Kunde inte ladda recepten.</div>`;
    return;
  }
  updateCartBadge();
  router();
}

init();
initCastSdk();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`sw.js?v=${SW_REG_VERSION}`, { updateViaCache: 'none' }).then((reg) => {
      reg.update().catch(() => {});
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            showToast('Ny version hämtad – ladda om appen för uppdateringen.', 5000);
          }
        });
      });
    }).catch(() => {});
  });
}
