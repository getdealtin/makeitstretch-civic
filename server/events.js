// Phase 4: anonymous activity events.
// Every event is checked against a strict schema; unknown events and fields are dropped.
// Never stored: name, email, phone, address, IP address, device identifiers.
// session_id is a random per-visit token from browser memory (gone when the tab closes).

import { BOX_GROUPS, cleanFoodWord } from '../engine/box.js';
import { BENCHMARKS } from '../engine/index.js';

const BOX_ITEMS = BOX_GROUPS.flatMap(g => g.items);
export const AVOID = ['gluten', 'dairy', 'meat', 'eggs', 'peanuts', 'fish', 'halal', 'kosher', 'diabetic', 'low_sodium'];
// "Can't use this" reasons, grouped the way the Food Plan's Goal 4 indicators split them.
export const CANT_USE = {
  cultural: ['halal', 'kosher', 'unfamiliar'],
  medical: ['diabetic', 'low_sodium', 'allergy'],
  practical: ['no_kitchen', 'dont_know_how', 'spoiled'],
};
const REASONS = Object.values(CANT_USE).flat();

// ── Field validators: return a clean value or undefined (field dropped) ──
const num = (min, max, dp = 2) => v => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? +n.toFixed(dp) : undefined; };
const int = (min, max) => v => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : undefined; };
const oneOf = list => v => (list.includes(v) ? v : undefined);
const listOf = (list, max = 20) => v => (Array.isArray(v) ? [...new Set(v.filter(x => list.includes(x)))].slice(0, max) : undefined);
const zip = v => (/^\d{5}$/.test(String(v ?? '')) ? String(v) : undefined);
const slug = v => (/^[a-z0-9][a-z0-9_-]{0,59}$/i.test(String(v ?? '')) ? String(v) : undefined);
const LANGS = ['en', 'es', 'vi', 'zh-Hans'];
// Foods typed in that aren't on the box list: letters only, 2–30 characters, at most 5. Anything else is dropped.
const foodWords = v => (Array.isArray(v) ? [...new Set(v.map(cleanFoodWord).filter(Boolean))].slice(0, 5) : undefined);

export const SCHEMA = {
  page_view: { src: slug },  // source tag; checked against the city's list in the route
  step_completed: { step: oneOf(['budget', 'days', 'people', 'zip', 'prefs']) },
  plan_built: {
    budget: num(1, 9999), days: int(1, 31), people: int(1, 20), zip,
    store: oneOf(['full', 'dollar', 'corner']),
    cuisine: listOf(['american', 'latin', 'asian', 'southern', 'mediterranean']),
    avoid: listOf(AVOID),
    have: listOf(['rice', 'beans', 'oats', 'eggs', 'potatoes', 'bread', 'pasta', 'oil']),
    leftover: oneOf(['yes', 'sometimes', 'no']),
    pppd: num(0, 9999), cal_pct: int(0, 1000), items: int(0, 200), spent: num(0, 9999),
  },
  box_built: { items: listOf(BOX_ITEMS, 60), other: foodWords, avoid: listOf(AVOID), meals: int(0, 200), zip, value: num(0, 9999) },
  recipe_opened: { recipe: int(1, 100000), flow: oneOf(['plan', 'box']) },
  meal_swapped: { recipe: int(1, 100000) },
  help_clicked: { target: slug, kind: oneOf(['resource', 'site', 'store']), action: oneOf(['call', 'directions', 'website', 'bus', 'wic_finder']) },
  zip_added_later: { zip },
  plan_kept: { how: oneOf(['save', 'text', 'email', 'copy']), kind: oneOf(['plan', 'box']) },
  language_changed: { from: oneOf(LANGS), to: oneOf(LANGS) },
  cant_use: { item: oneOf(BOX_ITEMS), reason: oneOf(REASONS) },
  plan_reopened: { source: oneOf(['saved', 'link']), kind: oneOf(['plan', 'box']) },
  plan_outcome: { answer: oneOf(['yes', 'some', 'no']), kind: oneOf(['plan', 'box']) },
  need_tapped: { need: oneOf(['rent', 'health', 'childcare', 'jobs']) },
  list_switched: { to: oneOf(['short', 'full']), short: int(0, 200), full: int(0, 200) },
  // "Fill it out once": counts only, never the summary's contents.
  summary_made: { needs: int(0, 10), fields: int(0, 10), kept: oneOf(['yes', 'no']) },
  summary_shared: { method: oneOf(['copy', 'share', 'text', 'email', 'print']) },
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

/** @param {{benefits:string[], food_help:string[]}} roles  resource ids by role (from the city's resources) */
export function summarize(events, roles = { benefits: [], food_help: [] }) {
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
    steps: ['budget', 'days', 'people', 'zip', 'prefs'].map(s => [s, by('step_completed').filter(e => e.data.step === s).length]),
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
      by_group: count(cant, c => groupOf(c.data.reason) || 'other'),
      by_reason: top(count(cant, c => c.data.reason)),
      by_item: top(count(cant, c => c.data.item)),
    },
    unlisted: top(count(boxes, b => b.data.other || []), 30),
    needs: count(by('need_tapped'), e => e.data.need),
    languages: count(events.filter(e => e.event === 'page_view'), e => e.lang),
    kept: count(by('plan_kept'), e => e.data.how),
    by_zip_session: Object.keys(zipOf).length,
  };
}

// ── Routes ──────────────────────────────────────────────────────
export function mountEvents(app, { getDb }) {
  const hits = new Map();
  setInterval(() => hits.clear(), 10 * 60e3).unref();
  app.post('/api/event', async (req, res) => {
    // Spam limit only: the IP is used in memory here and never stored.
    const n = (hits.get(req.ip) || 0) + 1; hits.set(req.ip, n);
    if (n > 300) return res.status(429).end();
    const ev = cleanEvent(req.body);
    if (!ev) return res.status(400).end();
    if (ev.data.src && !(req.city.sources || []).includes(ev.data.src)) delete ev.data.src;
    try { await getDb().insertEvent({ ...ev, city_id: req.city.id }); } catch (e) { console.error(e.message); }
    res.status(204).end();
  });
}
