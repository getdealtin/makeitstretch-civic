// Make It Stretch, civic edition: one server, every city.
// The request's host selects a city config card (cities/); the shared engine
// (engine/) does the math. Nothing city-specific is hard-wired here.

import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  planMeals, resolvePrices, indexRecipes,
  groupShoppingList, zipToInfo, BENCHMARKS, FALLBACK_PRICES,
} from './engine/index.js';
import QRCode from 'qrcode';
import { seriesFor, toPackagePrices, BLS_REGION } from './server/prices.js';
import { storesNear } from './server/stores.js';
import { BOX_GROUPS, BOX_SYNONYMS, foodLabel } from './engine/box.js';
import { resolveCity, publicConfig, partnerFor, CITIES } from './cities/index.js';
import { makeDb } from './server/db.js';
import { mountDirectory } from './server/directory.js';
import { makeLivePrices } from './server/live-prices.js';
import { mountHsds } from './server/hsds.js';
import { mountEvents, AVOID } from './server/events.js';
import { mountConnect } from './server/connect.js';
import { mountCommunity, initRecipes, allRecipes, recipesJson } from './server/community.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const BLS_KEY = process.env.BLS_KEY || '';
const DEFAULT_CITY = process.env.DEFAULT_CITY || 'national';
// ?city= overrides are for local testing; off in production unless explicitly allowed.
const ALLOW_CITY_OVERRIDE = process.env.ALLOW_CITY_OVERRIDE === '1' || process.env.NODE_ENV !== 'production';
// One site (owner decision, Nov 19 2026): makeitstretch.org runs the tool for everyone, and a partner city's
// ZIP code switches a visitor onto that city. Rollback: set ONE_SITE=off in Render (Environment) and the
// bare domain shows the old landing page again, with no ZIP switching. Nothing else changes either way.
const ONE_SITE = process.env.ONE_SITE !== 'off';

// The 161 seed recipes (ids 1–161), the NHLBI main dishes, word for word (ids 1001+, data/nih-recipes.json),
// and the simple meals from everyday staples (ids 2001+, data/simple-meals.json).
const NIH = JSON.parse(readFileSync(path.join(__dirname, 'data', 'nih-recipes.json'), 'utf8'));
const SIMPLE = JSON.parse(readFileSync(path.join(__dirname, 'data', 'simple-meals.json'), 'utf8')).recipes;
const RECIPES = [...indexRecipes(JSON.parse(readFileSync(path.join(__dirname, 'data', 'seed-recipes.json'), 'utf8'))),
  ...NIH.recipes.map(({ es, key, ...r }) => r), ...SIMPLE];

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind Render's proxy: req.ip is the visitor (used only for rate limits, never stored)
app.use(express.json({ limit: '10kb' }));

// Attach the city to every request.
app.use((req, res, next) => {
  const override = ALLOW_CITY_OVERRIDE ? req.query.city : undefined;
  req.city = resolveCity(req.headers.host, override, DEFAULT_CITY);
  // On the main site, a partner city the browser switched to by ZIP code (?city=austin).
  if (ONE_SITE) req.city = partnerFor(req.city, req.query.city) || req.city;
  // Rollback (ONE_SITE=off): the main site's addresses get DEFAULT_CITY again, as before Nov 19.
  else if (req.city.id === 'national' && !override) req.city = CITIES[DEFAULT_CITY] || req.city;
  next();
});

// ── Per-city theme: design tokens + self-hosted fonts ───────────
const FONT_FACES = `
@font-face{font-family:'Zilla Slab';font-weight:500;font-display:swap;src:url(/fonts/zilla-slab-latin-500-normal.woff2) format('woff2')}
@font-face{font-family:'Zilla Slab';font-weight:600;font-display:swap;src:url(/fonts/zilla-slab-latin-600-normal.woff2) format('woff2')}
@font-face{font-family:'Zilla Slab';font-weight:700;font-display:swap;src:url(/fonts/zilla-slab-latin-700-normal.woff2) format('woff2')}
@font-face{font-family:'Source Serif 4';font-weight:200 900;font-display:swap;src:url(/fonts/source-serif-4-latin-wght-normal.woff2) format('woff2')}
@font-face{font-family:'Source Serif 4';font-style:italic;font-weight:200 900;font-display:swap;src:url(/fonts/source-serif-4-latin-wght-italic.woff2) format('woff2')}
@font-face{font-family:'Inter';font-weight:100 900;font-display:swap;src:url(/fonts/inter-latin-wght-normal.woff2) format('woff2')}`;

app.get('/theme.css', (req, res) => {
  const { tokens, fonts } = req.city.branding;
  const vars = Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  res.type('text/css').set('Cache-Control', 'public, max-age=300').send(
    `${FONT_FACES}\n:root{\n${vars}\n  --font-display: '${fonts.display}', Georgia, serif;\n` +
    `  --font-body: '${fonts.body}', Georgia, serif;\n  --font-label: '${fonts.label}', system-ui, sans-serif;\n}\n`
  );
});

app.get('/api/config', (req, res) => res.json(publicConfig(req.city, { oneSite: ONE_SITE })));

// ── Install on a phone (owner request, Nov 11 2026) ─────────────
// Each city site can be added to a phone's home screen: this web app manifest names it and points
// to the icon (public/icons, drawn for the project). /sw.js keeps what's been opened working offline.
app.get('/manifest.webmanifest', (req, res) => {
  const c = req.city, t = c.branding?.tokens || {};
  res.type('application/manifest+json').set('Cache-Control', 'public, max-age=3600').json({
    name: c.place ? `${c.name} ${c.place}` : c.name,
    short_name: c.name,
    description: 'Turn the grocery money you have into a shopping list and meal plan that lasts.',
    lang: 'en', dir: 'ltr',
    start_url: '/', scope: '/', id: '/',
    display: 'standalone',
    background_color: t['--page'] || '#FFFFFF',
    theme_color: t['--violet'] || '#38377E',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  });
});
// The offline helper must be served from the site root (so it covers every page) and never cached
// by the browser itself, so a new version reaches phones on their next visit.
// Browsers and link previews still ask for /favicon.ico by name: give them the app icon.
app.get('/favicon.ico', (req, res) => res.type('image/png').set('Cache-Control', 'public, max-age=86400').sendFile(path.join(__dirname, 'public', 'icons', 'icon-192.png')));
app.get('/sw.js', (req, res) => res.type('text/javascript').set('Cache-Control', 'no-cache').sendFile(path.join(__dirname, 'public', 'sw.js')));

// ── Prices ──────────────────────────────────────────────────────
// BLS average prices exist per Census region (kept by server/live-prices.js). City local_prices
// (Data Steward shelf captures) override BLS item by item.
// Verified series codes, pound→package conversion and the safety check live in server/prices.js.
// Each region's series are asked for alongside the national ones; a food a region doesn't
// publish falls back to the national average.
// One ask to BLS; null on any failure. server/live-prices.js decides when to ask and what to keep.
async function fetchBlsPrices(region) {
  if (!BLS_KEY) return null;
  const year = String(new Date().getFullYear());
  try {
    const r = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesid: [...new Set([...seriesFor(region), ...seriesFor('national')])],
        startyear: String(+year - 1), endyear: year, registrationkey: BLS_KEY,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json();
    if (d.status !== 'REQUEST_SUCCEEDED') return null;
    const bySeries = {};
    for (const s of d.Results?.series || []) {
      const v = parseFloat(s.data?.[0]?.value);
      if (v > 0) bySeries[s.seriesID] = v;
    }
    const estimates = FALLBACK_PRICES[region] || FALLBACK_PRICES.national;
    return { ...toPackagePrices(bySeries, 'national', estimates), ...toPackagePrices(bySeries, region, estimates) };
  } catch { return null; }
}

// Fresh for 24 hours; through a BLS outage, the last good prices (saved in the database, so a
// restart keeps them) instead of waiting on BLS for every visitor.
const livePrices = makeLivePrices({
  fetchPrices: fetchBlsPrices,
  store: BLS_KEY ? { load: region => db.getPriceCache(region), save: (region, prices, at) => db.savePriceCache(region, prices, at) } : null,
});
const blsPrices = region => (BLS_KEY ? livePrices.get(region) : Promise.resolve(null));

// ── Data for the in-browser engine (instant preview, works if the connection drops) ──
/** Region → merged prices: fallback ← live BLS ← city local shelf prices. */
async function pricesFor(city, zipRegion) {
  const region = city.price_region || zipRegion || 'national';
  const live = await blsPrices(region);
  return {
    region,
    prices: resolvePrices(region, { ...(live || {}), ...city.local_prices }),
    label: city.price_region_label || `${region} region averages (BLS)`,
    live: !!live,
    local: Object.keys(city.local_prices).length > 0,
  };
}

app.get('/api/prices', async (req, res) => {
  const zipRegion = BLS_REGION[req.query.region] ? req.query.region : null;
  res.set('Cache-Control', 'public, max-age=3600').json(await pricesFor(req.city, zipRegion));
});

// Every recipe the site uses: the built-in ones plus approved community recipes (server/community.js),
// which join within 10 minutes of approval (browsers keep the list for 10 minutes).
initRecipes(RECIPES, r => ({
  id: r.id, title: r.title, slot: r.slot, cuisine: r.cuisine, ingredients: r.ingredients,
  instructions: r.instructions, tags: r.tags, avoid: r.avoid, srv: r.srv,
  ...(r.extras?.length ? { extras: r.extras } : {}), // seasonings under "You'll also need" (Nov 19 2026)
  ...(r.uses ? { uses: r.uses, lines: r.lines, note: r.note, steps: r.steps, extra: r.extra, source: r.source } : {}),
  ...(r.community ? { community: true, shared_by: r.shared_by, origin: r.origin, amounts: r.amounts, lang: r.lang } : {}),
}));
app.get('/api/recipes', (req, res) => res.type('json').set('Cache-Control', 'public, max-age=600').send(recipesJson()));

app.use('/engine', express.static(path.join(__dirname, 'engine'), { maxAge: '1h' }));

// ── The plan ────────────────────────────────────────────────────
const LIST = /^[a-z,]{0,120}$/;
const ALLOWED = {
  cuisine: ['american', 'latin', 'asian', 'southern', 'mediterranean'],
  avoid: AVOID,
  have: ['rice', 'beans', 'oats', 'eggs', 'potatoes', 'bread', 'pasta', 'oil'],
  stores: ['full', 'dollar', 'corner'],
};
const pickList = (v, key) => (Array.isArray(v) ? v : String(v || '').split(','))
  .filter(x => typeof x === 'string' && ALLOWED[key].includes(x));

app.post('/api/plan', async (req, res) => {
  const b = req.body || {};
  const budget = Number(b.budget), days = Number(b.days), people = Number(b.people);
  if (!(budget >= 1 && budget <= 9999) || !(days >= 1 && days <= 31) || !(people >= 1 && people <= 20)) {
    return res.status(400).json({ error: 'budget (1–9999), days (1–31) and people (1–20) are required' });
  }
  const zip = /^\d{5}$/.test(b.zip || '') ? b.zip : null;
  const input = {
    budget, days, people,
    cuisine: pickList(b.cuisine, 'cuisine'),
    avoid: pickList(b.avoid, 'avoid'),
    have: pickList(b.have, 'have'),
    stores: pickList(b.stores, 'stores'),
    leftover: ['yes', 'no', 'sometimes'].includes(b.leftover) ? b.leftover : 'sometimes',
  };

  const city = req.city;
  const zipInfo = zip ? zipToInfo(zip) : null;
  const priced = await pricesFor(city, zipInfo?.region);
  const { region, prices } = priced;

  // Meals first, then the list from those meals (engine/meals.js).
  const result = planMeals(input, prices, allRecipes());
  // Every plan is checked against the engine's principles (engine/principles.js); a failure is a bug to fix.
  if (!result.principles.ok) console.warn('[principles]', JSON.stringify({ input: { budget, days, people, avoid: input.avoid, cuisine: input.cuisine }, failed: result.principles.failed }));
  const weeks = result.weeks;

  const slim = r => ({ id: r.id, title: r.title, cuisine: r.cuisine, ingredients: r.ingredients, instructions: r.instructions, tags: r.tags, srv: r.srv,
    ...(r.uses ? { lines: r.lines, note: r.note, steps: r.steps, extra: r.extra, source: r.source } : {}),
    ...(r.community ? { community: true, shared_by: r.shared_by, origin: r.origin, amounts: r.amounts, extras: r.extras } : {}) });
  res.json({
    input,
    summary: {
      spent: result.spent, remaining: result.remaining, pppd: result.pppd, ppmeal: result.ppmeal,
      cppd: result.cppd, calPct: result.calPct, benchmarks: BENCHMARKS,
    },
    shopping: groupShoppingList(result.cart).map(g => ({
      cat: g.cat,
      items: g.items.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price, subtotal: i.subtotal, tier: i.tier, note: i.note, tip: i.tip })),
    })),
    covered_days: result.coveredDays,
    have: result.have,
    weeks: weeks.map(w => w.map(d => d.leftover || d.uncovered ? d : {
      dayName: d.dayName, leftover: false,
      breakfast: d.breakfast.map(slim), lunch: d.lunch.map(slim), dinner: d.dinner.map(slim),
    })),
    prices: { region, label: priced.label, live: priced.live, local: priced.local },
  });
});

// ── Ops ─────────────────────────────────────────────────────────
// Anonymous usage events live in server/events.js (strict schema, matching the privacy policy).
app.get('/api/health', (req, res) => res.json({ status: 'ok', city: req.city.id, one_site: ONE_SITE, recipes: allRecipes().length, bls: !!BLS_KEY, db: db.kind, admin: !!process.env.ADMIN_KEY }));
app.get('/api/ping', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── Food directory + admin (server/directory.js) ────────────────
// The database is chosen from env: Supabase when SUPABASE_URL + SUPABASE_SECRET_KEY are set,
// otherwise in-memory (tests, local runs). Tests can swap it with app.locals.setDb().
let db = makeDb();
app.locals.setDb = d => { db = d; };
mountDirectory(app, { getDb: () => db, priceStatus: () => (BLS_KEY ? livePrices.status() : null) });
mountHsds(app, { getProviders: city => db.listProviders(city, ['approved']) });
mountEvents(app, { getDb: () => db, oneSite: ONE_SITE });
mountConnect(app, { getDb: () => db });
mountCommunity(app, { getDb: () => db });
const page = name => (req, res) => res.sendFile(path.join(__dirname, 'public', name));
// ── Cities that are live, and share links / QR codes for partners (landing + /share) ──
const liveCities = () => Object.values(CITIES).filter(c => c.place && c.hosts?.length).map(c => ({
  id: c.id, place: c.place, region: c.region || '', url: `https://${c.hosts[0]}/`, sources: c.sources || [], source_labels: c.source_labels || {},
}));
app.get('/api/cities', (req, res) => res.json(liveCities()));

// Where to shop: nearest SNAP-authorized grocery stores and farmers markets for a ZIP (USDA data).
app.get('/api/stores', (req, res) => {
  if (!req.city.local?.stores || !/^\d{5}$/.test(String(req.query.zip || ''))) return res.json(null);
  res.set('Cache-Control', 'public, max-age=3600').json(storesNear(req.city, req.query.zip));
});

// Every name a box food goes by (English, synonyms, es/vi/zh), for the "Something else?" box field.
const BOX_WORDS = (() => {
  const data = ['es', 'vi', 'zh-Hans'].map(l => { try { return JSON.parse(readFileSync(path.join(__dirname, 'public/i18n/data', l + '.json'), 'utf8')); } catch { return {}; } });
  return Object.fromEntries(BOX_GROUPS.flatMap(g => g.items).map(id => [id, [foodLabel(id), ...(BOX_SYNONYMS[id] || []), ...data.map(d => d.foods?.[id]?.name).filter(Boolean)]]));
})();
app.get('/api/box-words', (req, res) => res.set('Cache-Control', 'public, max-age=3600').json(BOX_WORDS));
app.get('/share/qr.svg', async (req, res) => {
  const c = liveCities().find(x => x.id === req.query.city);
  if (!c) return res.status(404).end();
  const src = c.sources.includes(req.query.src) ? req.query.src : '';
  const svg = await QRCode.toString(c.url + (src ? `?src=${src}` : ''), { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#26264F', light: '#FFFFFF' } });
  res.type('image/svg+xml');
  if (req.query.download) res.attachment(`make-it-stretch-${c.id}${src ? '-' + src : ''}.svg`);
  res.send(svg);
});

// QR code back to a plan, for the print packet. Only this site's own plan links (#p=… / #b=…),
// so it can't be used as a general QR maker. ?src=packet lets the City report count packet reach.
app.get('/qr.svg', async (req, res) => {
  const h = String(req.query.h || '');
  if (!/^#[pb]=[A-Za-z0-9_\-.~%]{1,1800}$/.test(h)) return res.status(400).end();
  const proto = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
  const svg = await QRCode.toString(`${proto}://${req.headers.host}/?src=packet${h}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'L', color: { dark: '#000000', light: '#FFFFFF' } });
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
});

// makeitstretch.org (the bare domain) runs the tool for everyone (ONE_SITE, the default). With ONE_SITE=off
// it shows the old project landing page instead (public/landing.html, kept unchanged for that). City
// subdomains always show their tool. Outside production, /?site=landing previews the landing page.
const LANDING_HOSTS = ['makeitstretch.org', 'www.makeitstretch.org'];
app.get('/', (req, res, next) => {
  const host = (req.headers.host || '').toLowerCase().split(':')[0];
  if ((!ONE_SITE && LANDING_HOSTS.includes(host)) || (ALLOW_CITY_OVERRIDE && req.query.site === 'landing')) return page('landing.html')(req, res);
  next();
});
app.get('/share', page('share.html'));
app.get('/packet', page('index.html'));
app.get('/join/:token', page('provider.html'));
app.get('/add-site', page('provider.html'));
app.get('/admin', page('admin.html'));
app.get('/privacy', page('privacy.html'));
app.get('/how-plans-work', page('principles.html'));
app.get('/about', page('about.html'));
app.get('/share-a-meal', page('share-meal.html'));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`Make It Stretch on :${PORT} (default city: ${DEFAULT_CITY})`));
}
export default app;
