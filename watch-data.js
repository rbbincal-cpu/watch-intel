/* watch-data.js — live data engine for Watch Intel
 * Fetches Gentry (Shopify products.json) + 1TimePiece (Google Sheet, 27 brand tabs),
 * parses, detects brands, caches 6h in localStorage, and keeps a daily value history.
 * Pure business logic — no DOM. Imported by Watch Intel.dc.html via dynamic import().
 */

export const SHEET_ID = '1tu2AhLkUPW4gQLMmKI_YZ7wHZWzIg2hvpBR05Ab15Oc';
export const SHEET_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit';
export const GENTRY_BASE = 'https://www.gentry.ph';

// gid -> brand, validated against the live sheet (tab order = brand legend order)
export const TABS = [
  { gid: '1830962980', brand: 'Rolex', tab: 'Rolex' },
  { gid: '1220512096', brand: 'Rolex', tab: 'Rolex Ladies' },
  { gid: '1598189888', brand: 'Cartier', tab: 'Cartier' },
  { gid: '1021623610', brand: 'Audemars Piguet', tab: 'Audemars Piguet' },
  { gid: '1785709058', brand: 'Tudor', tab: 'Tudor' },
  { gid: '90434138',   brand: 'Patek Philippe', tab: 'Patek Philippe' },
  { gid: '1624634877', brand: 'Richard Mille', tab: 'Richard Mille' },
  { gid: '2130463204', brand: 'Vacheron Constantin', tab: 'Vacheron Constantin' },
  { gid: '1588679872', brand: 'Omega', tab: 'Omega' },
  { gid: '385964687',  brand: 'Panerai', tab: 'Panerai' },
  { gid: '897354193',  brand: 'F.P. Journe', tab: 'F.P. Journe' },
  { gid: '1562949254', brand: 'Hublot', tab: 'Hublot' },
  { gid: '1330951919', brand: 'IWC', tab: 'IWC' },
  { gid: '316630291',  brand: 'Franck Muller', tab: 'Franck Muller' },
  { gid: '1977884082', brand: 'A. Lange & Söhne', tab: 'A. Lange & Söhne' },
  { gid: '728140385',  brand: 'H. Moser', tab: 'H. Moser' },
  { gid: '1044629705', brand: 'Bvlgari', tab: 'Bvlgari' },
  { gid: '629406403',  brand: 'Hermès', tab: 'Hermès' },
  { gid: '322472339',  brand: 'MB&F', tab: 'MB&F' },
  { gid: '218776808',  brand: 'Ming', tab: 'Ming' },
  { gid: '264157255',  brand: 'Girard-Perregaux', tab: 'Girard-Perregaux' },
  { gid: '200406264',  brand: 'Zenith', tab: 'Zenith' },
  { gid: '1259514986', brand: 'Montblanc', tab: 'Montblanc' },
  { gid: '460256903',  brand: 'Maen', tab: 'Maen' },
  { gid: '1151421652', brand: 'Otsuka', tab: 'Otsuka Lotec' },
  { gid: '1426883078', brand: 'Chopard', tab: 'Chopard' },
  { gid: '1289352431', brand: 'Jaeger-LeCoultre', tab: 'Jaeger-LeCoultre' },
];

// Longest-first so multi-word brands win over substrings
const BRANDS = [
  'Audemars Piguet', 'Patek Philippe', 'Richard Mille', 'Vacheron Constantin',
  'Jaeger-LeCoultre', 'Jaeger LeCoultre', 'A. Lange & Söhne', 'A. Lange',
  'Franck Muller', 'Girard-Perregaux', 'Grand Seiko', 'F.P. Journe', 'Tag Heuer',
  'Rolex', 'Cartier', 'Omega', 'Panerai', 'Tudor', 'Hublot', 'Breitling',
  'IWC', 'Zenith', 'Chopard', 'Bvlgari', 'Bulgari', 'Hermès', 'Hermes',
  'Montblanc', 'MB&F', 'Chanel', 'Piaget', 'Breguet', 'H. Moser', 'Ming',
  'Maen', 'Otsuka',
];
const BRAND_CANON = { 'Jaeger LeCoultre': 'Jaeger-LeCoultre', 'Bulgari': 'Bvlgari', 'Hermes': 'Hermès' };

export function detectBrand(title) {
  const t = (title || '').toLowerCase();
  for (const b of BRANDS) {
    if (t.includes(b.toLowerCase())) return BRAND_CANON[b] || b;
  }
  return 'Other';
}

export function extractYear(s) {
  const m = (s || '').match(/\b(19[5-9]\d|20[0-3]\d)\b/);
  return m ? m[0] : null;
}

// Reference number: 5-6+ digits, optional letter suffix / dotted groups; never a year
export function extractRef(s) {
  const matches = (s || '').toUpperCase().match(/\b\d{4,6}[A-Z]{0,8}(?:[-.]\d{2,3}[A-Z]{0,4})?\b/g) || [];
  let best = null;
  for (const m of matches) {
    if (/^(19[5-9]\d|20[0-3]\d)$/.test(m)) continue;      // skip plain years
    if (m.replace(/[^0-9A-Z]/g, '').length < 5) continue;  // too short (sizes etc.)
    if (!best || m.length > best.length) best = m;
  }
  return best;
}
export const normRef = s => (s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

const STATUS_RE = /^(ON HOLD|HOLD|SOLD|RESERVED|PRICE ON REQUEST|POR|INQUIRE|ASK|TBA|N\/A)\b/i;
const INCL_RE = /\b(BOX|CARD|CERTIFICATE|CERT|MANUAL|BOOKLET|PAPERS?|WARRANTY|GUARANTEE|HANG\s?TAG|TAGS?|POUCH|RECEIPT|SERVICE|ARCHIVE)\b/i;

export function normInclusions(cells) {
  const set = new Set();
  cells.forEach(c => {
    const u = (c || '').toUpperCase();
    if (/BOX/.test(u)) set.add('Box');
    if (/CARD|CERT|PAPER|GUARANTEE|ARCHIVE/.test(u)) set.add('Papers');
    if (/MANUAL|BOOKLET/.test(u)) set.add('Manuals');
    if (/WARRANTY/.test(u)) set.add('Warranty');
    if (/SERVICE/.test(u)) set.add('Service');
    if (/TAG/.test(u)) set.add('Tags');
    if (/POUCH/.test(u)) set.add('Pouch');
    if (/RECEIPT/.test(u)) set.add('Receipt');
  });
  const order = ['Box', 'Papers', 'Manuals', 'Warranty', 'Service', 'Tags', 'Pouch', 'Receipt'];
  return order.filter(x => set.has(x));
}

function parseCSV(text) {
  const rows = []; let cur = [], val = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { val += '"'; i++; } else q = false; } else val += c; }
    else if (c === '"') q = true;
    else if (c === ',') { cur.push(val); val = ''; }
    else if (c === '\n') { cur.push(val); rows.push(cur); cur = []; val = ''; }
    else if (c !== '\r') val += c;
  }
  if (val !== '' || cur.length) { cur.push(val); rows.push(cur); }
  return rows;
}

// Parse one brand tab into watch objects. Blocks are delimited by their price/status row.
function parseSheetTab(text, brand, tab) {
  const rows = parseCSV(text);
  const out = []; let fam = '', pending = [], partner = '', incl = [];
  const flush = (cell) => {
    if (!pending.length) { partner = ''; incl = []; return; }
    const raw = pending.join(' · ');
    const name = (pending[0] || '').replace(/\s+/g, ' ').trim();
    const refLine = pending.find(p => /\d{3,}/.test(p) && /\//.test(p)) || pending[1] || '';
    const ref = extractRef(refLine) || extractRef(raw);
    const cond = pending.find(p => /MINT|BRAND NEW|UNWORN|GOOD|EXCELLENT|USED|FAIR|CONDITION/i.test(p)) || '';
    let price = null, status = null;
    const pc = cell.replace(/[₱,\s]/g, '');
    if (/^\d+$/.test(pc) && pc.length >= 4) price = parseInt(pc, 10);
    else status = cell.replace(/\s+/g, ' ').trim().toUpperCase();
    out.push({
      source: '1TimePiece', brand, tab, fam,
      name: name.slice(0, 120), ref, year: extractYear(raw),
      cond: cond.replace(/\s+/g, ' ').trim(), price, status,
      partner: partner || '', incl: normInclusions(incl), url: SHEET_URL,
    });
    pending = []; partner = ''; incl = [];
  };
  let labels = [];
  for (const r of rows) {
    const A = (r[0] || '').trim(), B = (r[1] || '').trim();
    const C = (r[2] || '').trim(), D = (r[3] || '').trim(), E = (r[4] || '').trim();
    if (A && !B && !C && !D) { fam = A; continue; }
    if (!B) continue;
    // checkbox row: B/C/D are TRUE/FALSE — include each label whose box is TRUE
    if (/^(TRUE|FALSE)$/i.test(B)) {
      [B, C, D].forEach((v, i) => { if (/^TRUE$/i.test(v) && labels[i]) incl.push(labels[i]); });
      continue;
    }
    if (B.includes('₱') || STATUS_RE.test(B)) { flush(B); labels = []; continue; }
    if (E && /^\d+$/.test(E)) partner = E;
    // inclusion LABEL row (BOX | CARD / CERTIFICATE | MANUALS) — store per column
    if (INCL_RE.test(B) || INCL_RE.test(C) || INCL_RE.test(D)) {
      labels = [B, C, D];
      continue;
    }
    pending.push(B);
  }
  return out;
}

async function fetchTab(t) {
  const url = SHEET_CSV(t.gid);
  const r = await fetch(url);
  if (!r.ok) throw new Error('sheet tab ' + t.tab + ' ' + r.status);
  return parseSheetTab(await r.text(), t.brand, t.tab);
}
const SHEET_CSV = gid =>
  'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv&gid=' + gid + '&_=' + Date.now();

async function pool(items, n, fn) {
  const out = []; let i = 0;
  const work = async () => { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); } };
  await Promise.all(Array.from({ length: n }, work));
  return out;
}

export async function fetchOneTime() {
  // export endpoint preserves all columns (gviz nulls mixed-type cols); throttle to avoid rate limits
  const results = await pool(TABS, 5, async t => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return { ok: true, value: await fetchTab(t) }; }
      catch (e) { if (attempt === 1) return { ok: false, tab: t.tab }; await new Promise(r => setTimeout(r, 400)); }
    }
  });
  let items = []; const failed = [];
  results.forEach(res => { if (res && res.ok) items = items.concat(res.value); else failed.push(res ? res.tab : '?'); });
  return { items, failed };
}

export function gentryIncl(body) {
  const txt = (body || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const m = txt.match(/Inclusions?\s*:?\s*(.+?)(?:\u2022|\bAll Photos\b|\bActual\b|$)/i);
  if (!m) return [];
  const v = m[1].trim().replace(/[\u2022\-\u2013|,;.\s]+$/, '').trim();
  if (!v || /^(n\/?a|none|tba)$/i.test(v)) return [];
  return [v.slice(0, 40)];
}

export async function fetchGentry() {
  let page = 1, all = [];
  while (page <= 12) {
    const r = await fetch(GENTRY_BASE + '/products.json?limit=250&page=' + page + '&_=' + Date.now());
    if (!r.ok) throw new Error('gentry ' + r.status);
    const j = await r.json();
    const prods = j.products || [];
    all = all.concat(prods);
    if (prods.length < 250) break;
    page++;
  }
  return all.map(p => {
    const v = p.variants && p.variants[0];
    const price = v ? parseFloat(v.price) : 0;
    const img = (p.images && p.images[0] && p.images[0].src) || null;
    return {
      source: 'Gentry', brand: detectBrand(p.title), tab: detectBrand(p.title),
      name: p.title, ref: extractRef(p.title), year: extractYear(p.title),
      cond: /brand new/i.test(p.title) ? 'BRAND NEW' : '',
      price: isNaN(price) ? null : price, status: null,
      partner: '', img,
      available: (p.variants || []).some(x => x.available),
      incl: gentryIncl(p.body_html),
      url: GENTRY_BASE + '/products/' + p.handle,
      created: p.created_at, updated: p.updated_at,
    };
  });
}

// ── aggregation ──
const add = (m, k, price) => { (m[k] = m[k] || { n: 0, v: 0 }); m[k].n++; m[k].v += price || 0; };
const sortMap = m => Object.entries(m).map(([k, x]) => ({ key: k, ...x })).sort((a, b) => b.v - a.v);

export function aggregate(gentry, oneItems) {
  // Gentry — count everything returned (published = in stock)
  const gByBrand = {}; let gVal = 0, gN = 0;
  gentry.forEach(w => { add(gByBrand, w.brand, w.price); gVal += w.price || 0; gN++; });

  // 1TimePiece — exclude SOLD from current inventory; HOLD/RESERVED stay as reserved
  const live = oneItems.filter(w => !/^SOLD/.test(w.status || ''));
  const oByBrand = {}, oByPartner = {}; let oVal = 0, oN = 0, held = 0;
  live.forEach(w => {
    add(oByBrand, w.brand, w.price);
    add(oByPartner, w.partner || 'Unassigned', w.price);
    oVal += w.price || 0; oN++;
    if (w.status) held++;
  });

  return {
    gentry: {
      items: gentry, count: gN, value: gVal,
      avg: gN ? gVal / gN : 0, byBrand: sortMap(gByBrand),
    },
    onetime: {
      items: live, count: oN, value: oVal, held,
      avg: oN ? oVal / oN : 0,
      byBrand: sortMap(oByBrand),
      byPartner: sortMap(oByPartner),
    },
  };
}

// ── caching + daily history ──
const CACHE_KEY = 'wi_cache_v4';
const HIST_KEY = 'wi_history_v1';
export const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const todayPHT = () => {
  const d = new Date(Date.now() + 8 * 3600 * 1000); // UTC+8 Manila
  return d.toISOString().slice(0, 10);
};
const nowPHT = () => {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 16).replace('T', ' ');
};

export function getHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch { return []; }
}
function recordHistory(agg) {
  const hist = getHistory();
  const day = todayPHT();
  const row = {
    d: day,
    gv: agg.gentry.value, gn: agg.gentry.count,
    ov: agg.onetime.value, on: agg.onetime.count,
  };
  const i = hist.findIndex(h => h.d === day);
  if (i >= 0) hist[i] = row; else hist.push(row);
  hist.sort((a, b) => (a.d < b.d ? -1 : 1));
  try { localStorage.setItem(HIST_KEY, JSON.stringify(hist.slice(-180))); } catch {}
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}

// ── automatic sales detection (inventory disappearance = sold) ──
const LIVE_KEY = 'wi_live_v1';
const normName = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 44);
const gentryKey = w => 'G|' + ((w.url || '').split('/products/')[1] || normName(w.name) + '|' + (w.ref || ''));
const oneKey = w => 'O|' + (w.brand || '') + '|' + (w.ref || '') + '|' + normName(w.name) + '|' + (w.partner || '');
function hashCode(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h; }
const snapItem = (w, source) => ({
  source, brand: w.brand || '', model: w.name || '', ref: w.ref || '', year: w.year || '',
  cond: w.cond || '', incl: w.incl || [], price: w.price || null, partner: w.partner || '', tab: w.tab || '',
});
function mkSold(it, date, key) {
  return {
    id: 'auto-' + (it.source === 'Gentry' ? 'G' : 'O') + '-' + date + '-' + Math.abs(hashCode(key)),
    auto: true, srcKey: it.source + '|' + key,
    kind: 'Sold', source: it.source, brand: it.brand, model: it.model, ref: it.ref,
    year: it.year, cond: it.cond, incl: it.incl || [], price: it.price, cost: null,
    date, notes: 'Auto-detected · left ' + it.source + ' inventory',
  };
}

/* Diff this fetch's inventory against the stored snapshot. Anything that left = sold.
   Guards: skip Gentry if the fetch looks unhealthy (<60% of last count); for the sheet,
   only diff brand-tabs that loaded this round so a failed tab never reads as a sell-off. */
function detectSales(gentry, one) {
  const prev = readLive();
  const day = todayPHT();
  const gLive = gentry.filter(w => w.available !== false && !/\bsold\b/i.test(w.name || ''));
  const gMap = {}; gLive.forEach(w => { gMap[gentryKey(w)] = snapItem(w, 'Gentry'); });
  const oMap = {}; one.items.forEach(w => { oMap[oneKey(w)] = snapItem(w, '1TimePiece'); });
  const failed = one.failed || [];
  const loadedTabs = new Set(TABS.map(t => t.tab).filter(t => !failed.includes(t)));

  const prevG = (prev && prev.gentry) || {};
  const prevO = (prev && prev.onetime) || {};
  const gentryHealthy = Object.keys(gMap).length >= Math.max(1, Object.keys(prevG).length * 0.6);

  const sold = [];
  if (prev) {
    if (gentryHealthy) {
      for (const k in prevG) if (!(k in gMap)) sold.push(mkSold(prevG[k], day, k));
    }
    for (const k in prevO) {
      const it = prevO[k];
      if (!loadedTabs.has(it.tab)) continue;       // tab failed to load — don't infer a sale
      if (!(k in oMap)) sold.push(mkSold(it, day, k));
    }
  }

  // next snapshot: replace healthy sources, preserve data we couldn't refresh
  const nextG = gentryHealthy ? gMap : prevG;
  const nextO = {};
  for (const k in prevO) if (!loadedTabs.has(prevO[k].tab)) nextO[k] = prevO[k];
  Object.assign(nextO, oMap);
  try { localStorage.setItem(LIVE_KEY, JSON.stringify({ gentry: nextG, onetime: nextO, at: Date.now() })); } catch {}
  return sold;
}
function readLive() { try { return JSON.parse(localStorage.getItem(LIVE_KEY)); } catch { return null; } }

/* Main entry. Returns { agg, gentry, onetime, generatedAt, fromCache, failed, ageMs, stale } */
export async function fetchAll(force = false) {
  const cached = readCache();
  if (!force && cached && Date.now() - cached.at < TTL_MS) {
    return { ...cached.payload, fromCache: true, ageMs: Date.now() - cached.at, stale: false };
  }
  try {
    const [gentry, one] = await Promise.all([fetchGentry(), fetchOneTime()]);
    const agg = aggregate(gentry, one.items);
    recordHistory(agg);
    const autoSold = detectSales(gentry, one);
    const payload = {
      agg, gentry, onetime: one.items, failed: one.failed,
      generatedAt: nowPHT(),
    };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), payload })); } catch {}
    return { ...payload, autoSold, fromCache: false, ageMs: 0, stale: false };
  } catch (e) {
    if (cached) return { ...cached.payload, fromCache: true, ageMs: Date.now() - cached.at, stale: true, error: String(e) };
    throw e;
  }
}

export const fmtPeso = n => n == null ? '—' :
  '₱' + (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : Math.round(n));
export const fmtFull = n => n == null ? '—' : '₱' + Math.round(n).toLocaleString();
