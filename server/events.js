// Phase 4: anonymous activity events.
// Every event is checked against a strict schema; unknown events and fields are dropped.
// Never stored: name, email, phone, address, IP address, device identifiers.
// session_id is a random per-visit token from browser memory (gone when the tab closes).

import { BOX_GROUPS, cleanFoodWord } from '../engine/box.js';
import { BENCHMARKS } from '../engine/index.js';
import { PARTNERS } from '../cities/index.js';
import { zipToInfo } from '../engine/zip-map.js';
import { FOOD_DB } from '../engine/food-db.js';

const FOOD_IDS = FOOD_DB.map(f => f.id);

const BOX_ITEMS = BOX_GROUPS.flatMap(g => g.items);
export const AVOID = ['gluten', 'dairy', 'meat', 'pork', 'eggs', 'peanuts', 'fish', 'halal', 'kosher', 'diabetic', 'low_sodium'];
// "Can't use this" reasons, grouped the way the Food Plan's Goal 4 indicators split them.
export const CANT_USE = {
  cultural: ['halal', 'kosher', 'unfamiliar'],
  medical: ['diabetic', 'low_sodium', 'allergy'],
  practical: ['no_kitchen', 'dont_know_how', 'spoiled'],
};
// 'unsaid': the person picked a food they won't use but didn't give a reason (the step's reasons are optional).
const REASONS = [...Object.values(CANT_USE).flat(), 'unsaid'];

// ── Field validators: return a clean value or undefined (field dropped) ──
const num = (min, max, dp = 2) => v => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? +n.toFixed(dp) : undefined; };
const int = (min, max) => v => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : undefined; };
const oneOf = list => v => (list.includes(v) ? v : undefined);
const listOf = (list, max = 20) => v => (Array.isArray(v) ? [...new Set(v.filter(x => list.includes(x)))].slice(0, max) : undefined);
const zip = v => (/^\d{5}$/.test(String(v ?? '')) ? String(v) : undefined);
// Recipe numbers (meals in a plan), at most `max`, whole numbers only.
const ids = max => v => (Array.isArray(v) ? [...new Set(v.filter(x => Number.isInteger(x) && x >= 1 && x <= 100000))].slice(0, max) : undefined);
// The website that sent a visit: a site name only (threads.net), never a page or anything after it.
const site = v => { const h = String(v ?? '').toLowerCase(); return /^[a-z0-9-]{1,40}(\.[a-z0-9-]{1,40}){1,4}$/.test(h) && h.length <= 60 && !h.endsWith('makeitstretch.org') ? h : undefined; };
const slug = v => (/^[a-z0-9][a-z0-9_-]{0,59}$/i.test(String(v ?? '')) ? String(v) : undefined);
const LANGS = ['en', 'es', 'vi', 'zh-Hans'];
// Foods typed in that aren't on the box list: letters only, 2–30 characters, at most 5. Anything else is dropped.
const foodWords = v => (Array.isArray(v) ? [...new Set(v.map(cleanFoodWord).filter(Boolean))].slice(0, 5) : undefined);

/**
 * One anonymous event as stored (table public.events, db/phase4-events.sql).
 * @typedef {object} EventRow
 * @property {string} city_id     'austin', 'national' (the main site); a later partner ZIP can move it (see below)
 * @property {string} session_id  random 12-character code for one visit, held only in the browser's memory
 * @property {string} event       one of SCHEMA's keys
 * @property {string} lang        'en', 'es', 'vi', 'zh-Hans'
 * @property {object} data        only the fields SCHEMA allows for that event, each checked
 * @property {string} created_at  server time (ISO)
 */

/** Allowed events and, for each, the only fields kept (anything else is dropped). */
export const SCHEMA = {
  page_view: { src: slug, ref: site },  // source tag (checked against the city's list in the route); referring site's name
  step_completed: { step: oneOf(['budget', 'days', 'people', 'zip', 'prefs']) },
  plan_built: {
    budget: num(1, 9999), days: int(1, 31), people: int(1, 20), zip,
    store: oneOf(['full', 'dollar', 'corner']),
    cuisine: listOf(['american', 'latin', 'asian', 'southern', 'mediterranean']),
    avoid: listOf(AVOID),
    have: listOf(['rice', 'beans', 'oats', 'eggs', 'potatoes', 'bread', 'pasta', 'oil']),
    leftover: oneOf(['yes', 'sometimes', 'no']),
    pppd: num(0, 9999), cal_pct: int(0, 1000), items: int(0, 200), spent: num(0, 9999),
    // What's in the plan (owner decision, Nov 22 2026): recipe numbers and the foods on the list.
    meals: ids(20), foods: listOf(FOOD_IDS, 45), // capped so an event stays under the 2,000-byte limit (db/phase4-events.sql)
  },
  box_built: { items: listOf(BOX_ITEMS, 60), other: foodWords, avoid: listOf(AVOID), meals: int(0, 200), zip, value: num(0, 9999),
    cant_step: oneOf(['picked', 'none', 'skipped']), cant: int(0, 60) }, // the "won't use" step: what the person did, how many foods
  recipe_opened: { recipe: int(1, 100000), flow: oneOf(['plan', 'box']) },
  meal_swapped: { recipe: int(1, 100000), from: int(1, 100000) },  // the meal chosen, and the one it replaced
  help_clicked: { target: slug, kind: oneOf(['resource', 'site', 'store']), action: oneOf(['call', 'directions', 'website', 'bus', 'wic_finder']),
    // Store taps (Nov 22 2026): USDA's kind of store (full grocery, other grocery, farmers market) and about how far.
    store: oneOf(['full', 'grocery', 'market']), mi: num(0, 100) },
  zip_added_later: { zip },
  plan_kept: { how: oneOf(['save', 'text', 'email', 'copy']), kind: oneOf(['plan', 'box']) },
  language_changed: { from: oneOf(LANGS), to: oneOf(LANGS) },
  // item: a food from the box list; food: one typed by the person (cleaned: letters only, so no numbers or emails).
  cant_use: { item: oneOf(BOX_ITEMS), food: v => cleanFoodWord(v) || undefined, reason: oneOf(REASONS) },
  plan_reopened: { source: oneOf(['saved', 'link']), kind: oneOf(['plan', 'box']) },
  plan_outcome: { answer: oneOf(['yes', 'some', 'no']), kind: oneOf(['plan', 'box']) },
  need_tapped: { need: oneOf(['rent', 'health', 'childcare', 'jobs', 'id']) },
  list_switched: { to: oneOf(['short', 'full']), short: int(0, 200), full: int(0, 200) },
};

/** Untrusted request body → { event, session_id, lang, data } or null. */
export function cleanEvent(b) {
  if (!b || typeof b !== 'object') return null;
  const spec = SCHEMA[b.event];
  if (!spec || !/^[a-z0-9]{12}$/.test(String(b.session_id || ''))) return null;
  const data = {};
  const src = b.data && typeof b.data === 'object' ? b.data : {};
  for (const [k, check] of Object.entries(spec)) {
    if (!(k in src) || src[k] === null) continue;
    const v = check(src[k]);
    if (v !== undefined) data[k] = v;
  }
  return { event: b.event, session_id: b.session_id, lang: LANGS.includes(b.lang) ? b.lang : 'en', data };
}

// ── Totals for the admin Activity section (operator's private view: nothing hidden) ──
const { tfpPerPersonDay: TFP, snapPerPersonDay: SNAP } = BENCHMARKS;

const BANDS = [[1, 'Under 1 mi'], [3, '1 to 3 mi'], [10, '3 to 10 mi'], [Infinity, '10 mi or more']];
const bandOf = mi => BANDS.find(([max]) => mi < max)[1];

/**
 * @param {{benefits:string[], food_help:string[]}} roles  resource ids by role (from the city's resources)
 * @param {(zip: string) => ({nearest_full_miles:number|null, full:number, other_grocery:number, markets:number,
 *   convenience:number, dollar_or_other:number}|null)} mixFor  a ZIP code's store mix (server/stores.js storeMix)
 */
export function summarize(events, roles = { benefits: [], food_help: [] }, names = { recipes: {}, foods: {} }, mixFor = () => null) {
  const by = e => events.filter(x => x.event === e);
  const count = (rows, f) => rows.reduce((m, r) => { for (const k of [].concat(f(r) ?? [])) m[k] = (m[k] || 0) + 1; return m; }, {});
  const top = (m, n = 15) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
  const sessions = new Set(events.map(e => e.session_id));
  const plans = by('plan_built'), boxes = by('box_built'), helps = by('help_clicked');

  // Visits per day (last 30 days present in the data)
  const perDay = count(by('page_view'), e => e.created_at.slice(0, 10));
  const per_day = Object.keys(perDay).sort().slice(-30).map(d => [d, perDay[d]]);

  // Shortfall sessions: built a plan under the SNAP benchmark; of those, how many tapped benefits or food help
  const shortfall = new Set(plans.filter(p => p.data.pppd != null && p.data.pppd < SNAP).map(p => p.session_id));
  const routedTo = targets => new Set(helps.filter(h => shortfall.has(h.session_id) && targets.includes(h.data.target)).map(h => h.session_id)).size;
  const zipOf = {};
  for (const e of events) if (e.data?.zip) zipOf[e.session_id] = e.data.zip;

  const cant = by('cant_use');
  const groupOf = r => Object.keys(CANT_USE).find(g => CANT_USE[g].includes(r));
  const boxItemCount = boxes.reduce((n, b) => n + (b.data.items?.length || 0), 0);

  return {
    events: events.length,
    sessions: sessions.size,
    visits: new Set(by('page_view').map(e => e.session_id)).size,
    per_day,
    plans: plans.length,
    boxes: boxes.length,
    returns: count(by('plan_reopened'), e => e.data.source || 'unknown'),
    steps: ['zip', 'budget', 'days', 'people', 'prefs'].map(s => [s, by('step_completed').filter(e => e.data.step === s).length]),
    zips: top(count(events.filter(e => e.event === 'plan_built' || e.event === 'box_built' || e.event === 'zip_added_later'), e => e.data.zip || 'none'), 20),
    budget_total: +plans.reduce((s, p) => s + (p.data.budget || 0), 0).toFixed(2),
    box_value_total: +boxes.reduce((s, b) => s + (b.data.value || 0), 0).toFixed(2),
    pressure: {
      // The average SNAP benefit is below the Thrifty Food Plan cost, so bands run SNAP → TFP.
      under_snap: plans.filter(p => p.data.pppd != null && p.data.pppd < SNAP).length,
      snap_to_tfp: plans.filter(p => p.data.pppd >= SNAP && p.data.pppd < TFP).length,
      over_tfp: plans.filter(p => p.data.pppd >= TFP).length,
    },
    shortfall: { sessions: shortfall.size, routed_benefits: routedTo(roles.benefits || []), routed_food: routedTo(roles.food_help || []) },
    store_by_zip: top(count(plans, p => `${p.data.zip || 'none'} · ${p.data.store || 'full'}`), 30),
    store: count(plans, p => p.data.store || 'full'),
    avoid: top(count([...plans, ...boxes], e => e.data.avoid || [])),
    cuisine: top(count(plans, p => (p.data.cuisine?.length ? p.data.cuisine : ['any']))),
    help: top(count(helps, h => `${h.data.kind || 'resource'}: ${h.data.target}`), 20),
    cant_use: {
      reports: cant.length,
      box_items: boxItemCount,
      by_group: count(cant, c => (c.data.reason === 'unsaid' ? 'unsaid' : groupOf(c.data.reason) || 'other')),
      // How people answered the "won't use" step (boxes from before Nov 17 have no answer recorded).
      step: count(boxes, b => b.data.cant_step || 'not_asked'),
      by_reason: top(count(cant, c => c.data.reason)),
      by_item: top(count(cant.filter(c => c.data.item), c => c.data.item)),
      by_typed: top(count(cant.filter(c => c.data.food), c => c.data.food)),
    },
    unlisted: top(count(boxes, b => b.data.other || []), 30),
    needs: count(by('need_tapped'), e => e.data.need),
    languages: count(events.filter(e => e.event === 'page_view'), e => e.lang),
    kept: count(by('plan_kept'), e => e.data.how),
    by_zip_session: Object.keys(zipOf).length,
    // Owner decision, Nov 22 2026 (plans made since then carry these).
    meals_in_plans: top(count(plans.filter(p => p.data.meals), p => p.data.meals.map(id => names.recipes[id] || `Recipe ${id}`)), 20),
    foods_on_lists: top(count(plans.filter(p => p.data.foods), p => p.data.foods.map(id => names.foods[id] || id)), 20),
    plans_with_meals: plans.filter(p => p.data.meals).length,
    swaps: top(count(by('meal_swapped').filter(e => e.data.from), e => `${names.recipes[e.data.from] || e.data.from} → ${names.recipes[e.data.recipe] || e.data.recipe}`), 15),
    referrers: top(count(by('page_view').filter(e => e.data.ref), e => e.data.ref), 15),
    // Where to shop (owner decision, Nov 22 2026). Store taps: which kind of store people looked up, and how far.
    store_taps: (() => {
      const taps = helps.filter(h => h.data.kind === 'store' && h.data.store);
      return { taps: taps.length, by_kind: count(taps, h => h.data.store),
        by_distance: BANDS.map(([, b]) => [b, taps.filter(h => h.data.mi != null && bandOf(h.data.mi) === b).length]) };
    })(),
    // Food access where plans are made, from each plan's ZIP code (USDA's SNAP store list): how far its center
    // is from a full grocery store, and how many plans there were below the average SNAP benefit.
    access: (() => {
      const rows = plans.filter(p => p.data.zip).map(p => ({ p, m: mixFor(p.data.zip) })).filter(x => x.m && x.m.nearest_full_miles != null);
      const zips = [...new Set(rows.map(x => x.p.data.zip))].map(z => mixFor(z));
      const sum = k => zips.reduce((n, m) => n + (m[k] || 0), 0);
      return {
        plans: rows.length,
        by_distance: BANDS.map(([, b]) => {
          const inBand = rows.filter(x => bandOf(x.m.nearest_full_miles) === b);
          return [b, inBand.length, inBand.filter(x => x.p.data.pppd != null && x.p.data.pppd < SNAP).length];
        }),
        zips: zips.length,
        mix: { full: sum('full'), other_grocery: sum('other_grocery'), markets: sum('markets'), convenience: sum('convenience'), dollar_or_other: sum('dollar_or_other') },
      };
    })(),
  };
}

// ── Routes ──────────────────────────────────────────────────────
/**
 * @param {import('express').Express} app
 * @param {{getDb: () => object, oneSite?: boolean}} opts  oneSite: the main site switches cities by ZIP code
 */
export function mountEvents(app, { getDb, oneSite = false }) {
  // Spam limit only: 300 requests per visitor per 10 minutes. The IP is used in memory here and never stored.
  const hits = new Map();
  setInterval(() => hits.clear(), 10 * 60e3).unref();
  const overLimit = req => { const n = (hits.get(req.ip) || 0) + 1; hits.set(req.ip, n); return n > 300; };

  app.post('/api/event', async (req, res) => {
    if (overLimit(req)) return res.status(429).end();
    const ev = cleanEvent(req.body);
    if (!ev) return res.status(400).end();
    if (ev.data.src && !(req.city.sources || []).includes(ev.data.src)) delete ev.data.src;
    try { await getDb().insertEvent({ ...ev, city_id: req.city.id }); } catch (e) { console.error(e.message); }
    res.status(204).end();
  });

  // One site (owner decision, Nov 19 2026): someone on makeitstretch.org who skipped the ZIP question and
  // later types a partner city's ZIP code (in "Free food & help") belongs to that city. Their plan or box,
  // and everything they did since starting it, moves from the main site's totals to the city's, so it is
  // counted once, in the right place. Only from the main site, only to the partner city that ZIP code
  // belongs to, only that visit's own events (its random visit code), and only since the plan or box began.
  // Body: { session_id: 12-character visit code, zip: '78702', since: ISO time the plan or box began (within
  // the last day) }. Anything else is refused with 400; nothing about the person is sent or stored.
  app.post('/api/event/move', async (req, res) => {
    if (overLimit(req)) return res.status(429).end();
    const b = req.body || {};
    const sinceMs = Date.parse(b.since);
    const to = PARTNERS.find(c => c.zips.includes(String(b.zip)));
    if (!oneSite || req.city.id !== 'national' || !to || !/^[a-z0-9]{12}$/.test(String(b.session_id || ''))
      || !Number.isFinite(sinceMs) || sinceMs < Date.now() - 864e5 || sinceMs > Date.now() + 60e3) return res.status(400).end();
    try { await getDb().moveSession(b.session_id, 'national', to.id, new Date(sinceMs).toISOString()); } catch (e) { console.error(e.message); }
    res.status(204).end();
  });
}

// ── Recent visits for /admin (owner request, Nov 21 2026): one row per visit, newest first ─────────
// Laid out like the food.getdealtin.com dashboard (When · City · ZIP · Events · Plan). The operator's
// private view, behind the admin sign-in; never in the City report or its downloads, which stay totals
// only with small numbers hidden. A visit is one random visit code; when it started on makeitstretch.org
// and moved to a partner city, both parts count as one visit.
/**
 * @param {Array<{session_id:string, city_id:string, event:string, data:object, created_at:string}>} events
 *   every event of the visits to show (any city)
 * @param {number} limit
 * @returns {Array<{at:string, zip:?string, area:?string, events:number, made:?('plan'|'box')}>}
 *   area: the partner city ("Austin") or the state for a ZIP code, used when the city-name lookup fails
 */
export function recentVisits(events, limit = 50) {
  const bySession = new Map();
  for (const e of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!bySession.has(e.session_id)) bySession.set(e.session_id, []);
    bySession.get(e.session_id).push(e);
  }
  const rows = [...bySession.values()].map(ev => {
    const zip = [...ev].reverse().find(e => e.data?.zip)?.data.zip || null;
    const partner = zip && PARTNERS.find(c => c.zips.includes(zip));
    const made = ev.some(e => e.event === 'plan_built') ? 'plan' : ev.some(e => e.event === 'box_built') ? 'box' : null;
    return { at: ev[0].created_at, zip, area: partner ? partner.place : zip ? (zipToInfo(zip)?.state || null) : null, events: ev.length, made };
  });
  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

// City names for the ZIP codes in Recent visits, from the free zippopotam.us lookup (the same one the
// food.getdealtin.com dashboard uses). Only the ZIP code is sent, from the server; answers are kept for a
// week. If the lookup fails, the row shows the partner city or the state instead.
const cityCache = new Map();
export async function cityForZip(zip, fetchImpl = fetch) {
  if (!/^\d{5}$/.test(zip || '')) return null;
  const hit = cityCache.get(zip);
  if (hit && hit.at > Date.now() - 7 * 864e5) return hit.name;
  try {
    const r = await fetchImpl(`https://api.zippopotam.us/us/${zip}`, { signal: AbortSignal.timeout(4000) });
    const p = r.ok ? (await r.json()).places?.[0] : null;
    const name = p ? `${p['place name']}, ${p['state abbreviation']}` : null;
    cityCache.set(zip, { name, at: Date.now() });
    return name;
  } catch { return null; }
}
