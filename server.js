// Make It Stretch, civic edition: one server, every city.
// The request's host selects a city config card (cities/); the shared engine
// (engine/) does the math. Nothing city-specific is hard-wired here.

import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  buildCart, resolvePrices, indexRecipes, matchRecipes, planWeeks,
  groupShoppingList, zipToInfo, BENCHMARKS,
} from './engine/index.js';
import { resolveCity, publicConfig } from './cities/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const BLS_KEY = process.env.BLS_KEY || '';
const DEFAULT_CITY = process.env.DEFAULT_CITY || 'national';
// ?city= overrides are for local testing; off in production unless explicitly allowed.
const ALLOW_CITY_OVERRIDE = process.env.ALLOW_CITY_OVERRIDE === '1' || process.env.NODE_ENV !== 'production';

const RECIPES = indexRecipes(JSON.parse(readFileSync(path.join(__dirname, 'data', 'seed-recipes.json'), 'utf8')));

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

// Attach the city to every request.
app.use((req, res, next) => {
  req.city = resolveCity(req.headers.host, ALLOW_CITY_OVERRIDE ? req.query.city : undefined, DEFAULT_CITY);
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

app.get('/api/config', (req, res) => res.json(publicConfig(req.city)));

// ── Prices ──────────────────────────────────────────────────────
// BLS average prices exist per Census region. Cached 24h. City local_prices
// (Data Steward shelf captures) override BLS item by item.
const blsCache = new Map();
const BLS_REGION = { northeast: '0200', midwest: '0300', south: '0400', west: '0500', national: '0000' };
const BLS_ITEMS = {
  chicken: '703511', eggs: '708111', milk: '710211', rice: '712112', drybeans: '716114',
  bread: '702111', oats: '702421', potatoes: '711311', bananas: '711412', peanutbutter: '715211',
  cannedtomatoes: '717311', tuna: '703612', pasta: '714212', flour: '714232',
};

async function blsPrices(region) {
  if (!BLS_KEY) return null;
  const hit = blsCache.get(region);
  if (hit && Date.now() - hit.at < 24 * 3600e3) return hit.prices;
  const code = BLS_REGION[region] || '0000';
  const year = String(new Date().getFullYear());
  try {
    const r = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesid: Object.values(BLS_ITEMS).map(i => `APU${code}${i}`),
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
    const prices = Object.fromEntries(Object.entries(BLS_ITEMS)
      .map(([food, item]) => [food, bySeries[`APU${code}${item}`]]).filter(([, v]) => v));
    blsCache.set(region, { at: Date.now(), prices });
    return prices;
  } catch { return null; }
}

// ── The plan ────────────────────────────────────────────────────
const LIST = /^[a-z,]{0,120}$/;
const ALLOWED = {
  cuisine: ['american', 'latin', 'asian', 'southern', 'mediterranean'],
  avoid: ['gluten', 'dairy', 'meat', 'eggs', 'peanuts', 'fish'],
  have: ['rice', 'beans', 'oats', 'eggs', 'potatoes', 'bread', 'pasta', 'oil'],
  stores: ['full', 'walmart', 'aldi', 'dollar', 'corner'],
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
  const region = city.price_region || zipInfo?.region || 'national';
  const live = await blsPrices(region);
  const prices = resolvePrices(region, { ...(live || {}), ...city.local_prices });

  const result = buildCart(input, prices);
  const bySlot = matchRecipes(RECIPES, { ingredients: result.cart.map(i => i.id), cuisine: input.cuisine, avoid: input.avoid });
  const weeks = planWeeks(bySlot, input);

  const slim = r => ({ id: r.id, title: r.title, cuisine: r.cuisine, ingredients: r.ingredients, instructions: r.instructions, tags: r.tags, srv: r.srv });
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
    weeks: weeks.map(w => w.map(d => d.leftover ? d : {
      dayName: d.dayName, leftover: false,
      breakfast: d.breakfast.map(slim), lunch: d.lunch.map(slim), dinner: d.dinner.map(slim),
    })),
    prices: {
      region, label: city.price_region_label || `${region} region averages (BLS)`,
      live: !!live, local: Object.keys(city.local_prices).length > 0,
    },
  });
});

// ── Ops ─────────────────────────────────────────────────────────
// Event logging is deliberately absent until Phase 4 (privacy + schema reset):
// no Austin data is collected before the policy matches the schema.
app.get('/api/health', (req, res) => res.json({ status: 'ok', city: req.city.id, recipes: RECIPES.length, bls: !!BLS_KEY }));
app.get('/api/ping', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`Make It Stretch on :${PORT} (default city: ${DEFAULT_CITY})`));
}
export default app;
