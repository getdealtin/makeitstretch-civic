// Phase 5: the City report. Aggregated, with small-cell suppression, and organized however
// each city needs it.
//
// Two layers, so any city can adopt it:
//  • METRICS: one shared library of measures (people by ZIP, budget bands, can't-use reasons…).
//    Every city computes them the same way.
//  • A framework: how the measures are grouped and titled. A city's config card can set
//    `report: { title, labels, sections: [{ goal, intro, metrics: [ids] }] }` to match its own
//    plan or grant (Austin maps to its Food Plan goals). Cities without one get DEFAULT_FRAMEWORK.
//  Which links count as "benefits" or "food help" comes from `role` on the city's resources,
//  never from hard-coded ids.
//
// Rules:
//  • Every number counts people (distinct visits), never clicks.
//  • Any number under k (the city's k_anon_threshold, 15 for Austin) is hidden.
//  • Secondary suppression: if a table shows its total and exactly one row is hidden, the next
//    smallest row is hidden too, so the hidden one can't be worked out by subtraction.
//  • Organization counts (food sites in the directory) are not people and are not suppressed.

import { NEED_TERMS, describe } from './taxonomy.js';
import { readFileSync } from 'node:fs';

// ZIP → council district shares (population-weighted; built by scripts/build-zip-districts.py).
const ZIPD = JSON.parse(readFileSync(new URL('../data/zip-districts.json', import.meta.url), 'utf8'));
export const ZIP_DISTRICTS = ZIPD;
const DISTRICT_NOTE = 'Estimated: each person is spread across districts by how their ZIP code’s 2020 residents split (2020 Census blocks placed in City of Austin council districts). ZIP codes cross district lines, so these are estimates, not counts. Grant area: Districts 1–4.';
/** Expected people per district from per-person ZIPs: [[label, n]], districts in order, then outside the city. */
function byDistrict(sessions) {
  const est = new Map();
  const add = (k, v) => est.set(k, (est.get(k) || 0) + v);
  for (const [, zip] of sessions) {
    const z = ZIPD.zips[zip];
    if (!z) { add('outside', 1); continue; }
    for (const [d, sh] of Object.entries(z.shares)) add(d, sh);
  }
  const order = [...Array(10)].map((_, i) => String(i + 1)).concat('outside');
  return order.filter(k => est.has(k) && Math.round(est.get(k)) > 0).map(k => [k === 'outside' ? 'Outside Austin city limits (or ZIP unknown)' : `District ${k}${+k <= 4 ? ' (grant area)' : ''}`, Math.round(est.get(k))]);
}
import { CANT_USE } from './events.js';

import { BENCHMARKS } from '../engine/index.js';
const { tfpPerPersonDay: TFP, snapPerPersonDay: SNAP } = BENCHMARKS;

/** Resource ids by role, from a city's resources: { benefits: [...], food_help: [...] }. */
export function rolesOf(resources = []) {
  const out = { benefits: [], food_help: [], needs: {}, any_need: [] };
  for (const r of resources) {
    if (r.role && out[r.role]) out[r.role].push(r.id);
    for (const n of r.needs || []) (out.needs[n] ||= []).push(r.id);
    if (r.phone === '211') out.any_need.push(r.id); // 2-1-1 is shown with every need
  }
  return out;
}

/** Used when a city has no `report` section in its config card. */
export const DEFAULT_FRAMEWORK = {
  title: 'Food access report',
  labels: { benefits: 'a benefits link', food_help: 'a food help link' },
  sections: [
    { goal: 'Access', intro: 'Where people seek help stretching food money, how short budgets are, and where they can shop.', metrics: ['zip', 'budget_band', 'budget_band_by_zip', 'store', 'store_by_zip', 'cuisine'] },
    { goal: 'Benefits and food help', intro: 'People routed toward benefits and free food. These are link taps, not applications: the tool cannot see who applies.', metrics: ['routed', 'benefits_by_zip'] },
    { goal: 'Food that fits', intro: 'Food-box items people report they cannot use, and dietary needs.', metrics: ['cant_use', 'cant_group', 'cant_reason', 'cant_item', 'unlisted_food', 'diet'] },
    { goal: 'Needs beyond food', intro: 'What else people asked about after getting their plan, and whether they found a source to open: a de-identified signal for nonprofit partners.', metrics: ['needs', 'needs_followthrough', 'needs_supply', 'needs_by_zip', 'needs_gap_by_zip'] },
    { goal: 'Language', intro: 'Language used.', metrics: ['language'] },
    { goal: 'Outcomes', intro: 'Asked when someone returns to a saved plan or link, and the estimated value of food boxes people planned around.', metrics: ['outcome', 'returns', 'box_value'] },
    { goal: 'Participation', intro: 'Organizations taking part through the food directory.', metrics: ['directory'] },
    { goal: 'How people found the tool', intro: 'From source tags on links and printed QR codes.', metrics: ['sources'] },
  ],
};

/** Rows of [label, n] → rows with n replaced by null where hidden. */
export function suppress(rows, k, { total = null } = {}) {
  const out = rows.map(([label, n]) => [label, n < k ? null : n]);
  if (total !== null && total >= k) {
    const hidden = out.filter(r => r[1] === null).length;
    if (hidden === 1) {
      const shown = out.filter(r => r[1] !== null).sort((a, b) => a[1] - b[1]);
      if (shown[0]) shown[0][1] = null;
    }
  }
  return out;
}

const sessionsWhere = (events, pred) => new Set(events.filter(pred).map(e => e.session_id));
const countBy = (events, keyOf) => {
  const m = new Map();
  for (const e of events) for (const key of [].concat(keyOf(e) ?? [])) {
    if (!m.has(key)) m.set(key, new Set());
    m.get(key).add(e.session_id);
  }
  return [...m.entries()].map(([key, s]) => [key, s.size]).sort((a, b) => b[1] - a[1]);
};
const n = (v, k) => (v < k ? null : v);

const longDate = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const LABEL = {
  group: { cultural: 'Culture or religion', medical: 'Health', practical: 'Other reasons' },
  reason: { halal: 'Not halal', kosher: 'Not kosher', unfamiliar: 'Not a familiar food', diabetic: 'Not OK for diabetes', low_sodium: 'Too much salt', allergy: 'Allergy', no_kitchen: 'No way to cook it', dont_know_how: 'Don’t know how to cook it', spoiled: 'Spoiled or expired' },
  store: { full: 'Grocery store', dollar: 'Dollar store', corner: 'Corner store' },
  answer: { yes: 'Yes', some: 'Some of it', no: 'No' },
  need: { rent: 'Rent & utilities', health: 'Health care', childcare: 'Child care & school', jobs: 'Jobs & transportation' },
};
const langName = code => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; } catch { return code; } };
const lab = (map, rows) => rows.map(([k, v]) => [map[k] || k, v]);

/**
 * The shared measure library. Each entry takes the computed context and returns one table.
 * Add a measure here once and any city's framework can list it by id.
 */
// Our needs → Open Eligibility (server/taxonomy.js), so partners can read the counts in a standard vocabulary.
const NEED_BY_LABEL = Object.fromEntries(Object.entries(LABEL.need).map(([id, l]) => [l, id]));
const needOE = label => {
  const id = NEED_BY_LABEL[String(label).split(' · ').pop()];
  return id ? describe(NEED_TERMS[id]).map(t => t.path).join('; ') : '';
};
const NEED_OE_NOTE = Object.entries(LABEL.need).map(([id, l]) => `${l} = ${describe(NEED_TERMS[id]).map(t => t.path).join('; ')}`).join(' · ');

export const METRICS = {
  zip: c => c.table('People by ZIP code', ['ZIP code', 'People'], countBy(c.withZip, e => e.zip)),
  budget_band: c => c.table('Budget per person per day (grocery plans)', ['Band', 'People'], c.bandRows, { total: c.plans.size }),
  budget_band_by_zip: c => c.table('Budget per person per day by ZIP code', ['ZIP · band', 'People'], countBy(c.planEv.filter(p => c.bandOf[p.session_id] && c.zipOf[p.session_id]), p => `${c.zipOf[p.session_id]} · ${c.bandShort[p.session_id]}`)),
  store: c => c.table('Where people can shop most easily', ['Store type', 'People'], lab(LABEL.store, countBy(c.planEv, p => p.data.store || 'full')), { total: c.plans.size }),
  store_by_zip: c => c.table('Store type by ZIP code', ['ZIP · store', 'People'], countBy(c.planEv.filter(p => c.zipOf[p.session_id]), p => `${c.zipOf[p.session_id]} · ${LABEL.store[p.data.store || 'full']}`)),
  cuisine: c => c.table('Food style chosen', ['Cuisine', 'People'], countBy(c.planEv, p => (p.data.cuisine?.length ? p.data.cuisine : ['no preference']))),
  routed: c => c.table('People routed to benefits', ['', 'People'], [
    [`Tapped ${c.labels.benefits}`, c.routedBenefits.size],
    [`Tapped ${c.labels.food_help}`, c.routedFood.size],
    ['Budget below the SNAP average', c.shortfall.size],
    [`…of those, tapped ${c.labels.benefits}`, c.shortfallBenefits],
    [`…of those, tapped ${c.labels.food_help}`, c.shortfallFood],
  ]),
  benefits_by_zip: c => c.table(`Taps on ${c.labels.benefits} by ZIP code`, ['ZIP code', 'People'], countBy(c.withZip.filter(e => e.event === 'help_clicked' && c.roles.benefits.includes(e.data.target)), e => e.zip)),
  cant_use: c => c.table('People reporting food they can’t use', ['', 'People'], [['Entered a food box', c.boxes.size], ['Reported at least one item they can’t use', c.cantSessions.size]]),
  cant_group: c => c.table('Reason group', ['Reason', 'People'], lab(LABEL.group, countBy(c.cant, e => c.groupOf(e.data.reason) || 'other'))),
  cant_reason: c => c.table('Reason', ['Reason', 'People'], lab(LABEL.reason, countBy(c.cant, e => e.data.reason))),
  cant_item: c => c.table('Item', ['Food-box item', 'People'], countBy(c.cant, e => e.data.item)),
  unlisted_food: c => c.table('Foods in boxes that aren’t on our list', ['Food (as typed)', 'People'], countBy(c.boxEv, e => e.data.other || []), { note: 'What people typed in. Shows what pantries hand out that the tool can’t use yet.' }),
  needs: c => c.table('Other needs people asked about', ['Need', 'People'], lab(LABEL.need, countBy(c.events.filter(e => e.event === 'need_tapped'), e => e.data.need)), { oe: needOE, note: `Taps on a need after the plan. No one is contacted and nothing is requested. Standard categories (Open Eligibility, the taxonomy used with HSDS): ${NEED_OE_NOTE}.` }),
  district: c => c.table('People by council district (estimated)', ['District', 'People'], byDistrict(Object.entries(c.zipOf).filter(([sid]) => c.visits.has(sid) || c.plans.has(sid) || c.boxes.has(sid))), { note: DISTRICT_NOTE }),
  budget_band_by_district: c => c.table('Plans below the average SNAP benefit by council district (estimated)', ['District', 'People'], byDistrict([...c.shortfall].filter(sid => c.zipOf[sid]).map(sid => [sid, c.zipOf[sid]])), { note: DISTRICT_NOTE }),
  needs_by_district: c => c.table('People who asked about other needs by council district (estimated)', ['District', 'People'], byDistrict([...new Set(c.needTaps.map(e => e.session_id))].filter(sid => c.zipOf[sid]).map(sid => [sid, c.zipOf[sid]])), { note: DISTRICT_NOTE }),
  // Needs signal: who asked, and whether they opened any source shown for that need. "Opened none" is the
  // closest sign of a gap the tool can see without contacting anyone.
  needs_followthrough: c => c.table('Other needs: did people open a source?', ['Need · result', 'People'], countBy(c.needTaps, e => `${LABEL.need[e.data.need] || e.data.need} · ${c.openedFor(e.session_id, e.data.need) ? 'opened a listed source' : 'opened none'}`), { oe: needOE, note: 'A source counts if it was shown for that need: a City or County program, a directory site offering it, or 2-1-1. One person asking about two needs who opens 2-1-1 counts as opening a source for both. “Opened none” may mean the listing didn’t fit, or that they will come back later.' }),
  needs_gap_by_zip: c => c.table('Other needs with no source opened, by ZIP code', ['ZIP · need', 'People'], countBy(c.needTaps.filter(e => c.zipOf[e.session_id] && !c.openedFor(e.session_id, e.data.need)), e => `${c.zipOf[e.session_id]} · ${LABEL.need[e.data.need] || e.data.need}`), { oe: needOE }),
  // "Dollars stretched" (FACE application, Q7): what the food in people's boxes would cost at the tool's
  // grocery prices, so money a family doesn't have to spend. Each person's latest box counts once.
  box_value: c => {
    const last = new Map();
    for (const e of c.boxEv) if (e.data.value > 0) last.set(e.session_id, e.data.value);
    const vals = [...last.values()].sort((a, b) => a - b);
    const ok = vals.length >= c.k;
    const usd = v => '$' + Math.round(v).toLocaleString('en-US');
    return { title: 'Dollars stretched: estimated store value of food boxes', head: ['Measure', 'Value'], money: true, rows: [
      ['People who entered a food box', ok ? vals.length : null],
      ['Total estimated store value', ok ? usd(vals.reduce((a, b) => a + b, 0)) : null],
      ['Typical (median) box', ok ? usd(vals[Math.floor(vals.length / 2)]) : null],
    ], note: 'What the box’s foods would cost at the tool’s grocery prices (BLS South-region averages where available, otherwise built-in estimates), one package per item listed. An estimate of money a household doesn’t have to spend, not a measured saving. Hidden when fewer people than the report’s threshold entered a box.' };
  },
  needs_supply: c => ({ title: 'Listed help for each need', head: ['Need', 'Sources shown'], rows: Object.entries(LABEL.need).map(([n, l]) => [l, (c.roles.needs?.[n] || []).length + c.providers.filter(p => (p.offers || []).includes(n)).length]), note: 'City and County programs plus approved directory sites that offer it (2-1-1 is shown with every need and not counted). Organizations, not people: not suppressed.', organizations: true }),
  needs_by_zip: c => c.table('Other needs by ZIP code', ['ZIP · need', 'People'], countBy(c.withZip.filter(e => e.event === 'need_tapped'), e => `${e.zip} · ${LABEL.need[e.data.need] || e.data.need}`), { oe: needOE }),
  retail_mix: c => c.retail ? ({ title: `SNAP-authorized stores: focus area vs. rest of Travis County (USDA, as of ${longDate(c.retail.as_of)})`, head: ['', 'Stores'], rows: [
    [`Focus area (${c.retail.focus.zips} ZIP codes): convenience stores`, c.retail.focus.convenience],
    ['Focus area: supermarkets and large grocery stores', c.retail.focus.full],
    ['Focus area: convenience stores for each supermarket or large grocery store', c.retail.focus.ratio],
    [`Rest of Travis County (${c.retail.rest.zips} ZIP codes): convenience stores`, c.retail.rest.convenience],
    ['Rest of county: supermarkets and large grocery stores', c.retail.rest.full],
    ['Rest of county: convenience stores for each supermarket or large grocery store', c.retail.rest.ratio],
    ['Focus area: typical distance from a ZIP code\u2019s center to the nearest supermarket or large grocery store (miles)', c.retail.focus.median_miles],
    ['Rest of county: same distance (miles)', c.retail.rest.median_miles],
  ], note: 'Store counts by USDA store type for stores authorized to take SNAP. Places, not people: not suppressed. Distance is the median across ZIP codes, measured from each ZIP code\u2019s center, so it is approximate.' }) : null,
  food_access: c => c.retail?.access ? ({ title: 'USDA low-income and low-access census tracts in Travis County (Food Access Research Atlas)', head: ['USDA edition', 'Tracts flagged'],
    rows: Object.values(c.retail.access.editions).map(e => [`${e.name}: distance to ${e.counts_distance_to}`, `${e.lila} of ${e.tracts} in Travis County; ${e.lila_focus} mostly in the focus-area ZIP codes`]),
    note: 'USDA measure: low income and low access at 1 mile (cities) or 10 miles (rural). The grant\u2019s figure (26 of 33) comes from the 2015 edition. The editions are not a trend: they use different census years and stores, and the 2025 edition counts every SNAP store, including convenience stores, so it measures nearness to any SNAP store, not to a supermarket. A tract is placed in the ZIP code holding most of its population (2010 tracts) or land (2020 tracts).' }) : null,
  food_access_by_zip: c => c.retail?.access ? ({ title: 'Low-income and low-access tracts in each focus-area ZIP code (USDA)', head: ['ZIP code', '2015 · 2019 · 2025'],
    rows: c.retail.access.focus_zips.map(z => [z, ['2015', '2019', '2025'].map(y => c.retail.access.editions[y]?.lila_by_focus_zip[z] ?? '\u2013').join(' · ')]), note: '2015 and 2019 count distance to supermarkets; 2025 counts distance to any SNAP store.' }) : null,
  retail_by_zip: c => c.retail ? ({ title: 'SNAP-authorized stores in each focus-area ZIP code', head: ['ZIP code', 'Stores (USDA store types)'], rows: c.retail.byZip.map(z => [z.zip,
    `${z.full} supermarket or large grocery · ${z.other_grocery} smaller grocery · ${z.convenience} convenience · ${z.dollar_or_other} dollar or other · ${z.markets} farmers market · nearest supermarket or large grocery about ${z.nearest_full_miles} mi from the ZIP code\u2019s center`]),
    note: 'A store counts in a ZIP code if its address is there. People also shop across ZIP lines, so read the nearest-store distance alongside the counts.' }) : null,
  diet: c => c.table('Dietary needs (plans and boxes)', ['Need', 'People'], countBy([...c.planEv, ...c.boxEv], e => e.data.avoid || [])),
  language: c => c.table('Language used', ['Language', 'People'], countBy(c.views, e => e.lang).map(([code, v]) => [langName(code), v]), { total: c.visits.size }),
  outcome: c => c.table('“Did you use this plan?”', ['Answer', 'People'], lab(LABEL.answer, countBy(c.outcome, e => e.data.answer))),
  returns: c => c.table('Return visits', ['How', 'People'], lab({ saved: 'Reopened a saved plan', link: 'Opened a shared link' }, countBy(c.events.filter(e => e.event === 'plan_reopened'), e => e.data.source))),
  directory: c => ({ title: 'Food sites in the directory', head: ['Type', 'Organizations'], rows: Object.entries(c.providers.reduce((m, p) => ((m[p.kind] = (m[p.kind] || 0) + 1), m), {})), note: 'Organizations, not people: not suppressed.', organizations: true }),
  sources: c => c.table('Visits by source', ['Source', 'People'], countBy(c.views, e => e.data?.src || 'direct'), { total: c.visits.size }),
};

/**
 * @param {object[]} events   raw events for one city and date range (test traffic already excluded)
 * @param {{k:number, providers:object[], from:string, to:string, city:string,
 *          roles?:{benefits:string[], food_help:string[]}, framework?:object}} opts
 */
export function cityReport(events, { k = 15, providers = [], from, to, city, roles = { benefits: [], food_help: [] }, framework = DEFAULT_FRAMEWORK, retail = null }) {
  const views = events.filter(e => e.event === 'page_view');
  const visits = new Set(views.map(e => e.session_id));
  const planEv = events.filter(e => e.event === 'plan_built');
  const boxEv = events.filter(e => e.event === 'box_built');
  const plans = new Set(planEv.map(e => e.session_id));
  const boxes = new Set(boxEv.map(e => e.session_id));

  // Zip per visit (from a plan, a box, or the "add zip" box).
  const zipOf = {};
  for (const e of events) if (e.data?.zip) zipOf[e.session_id] = e.data.zip;
  const withZip = events.filter(e => zipOf[e.session_id]).map(e => ({ ...e, zip: zipOf[e.session_id] }));

  // Budget pressure: one band per plan visit (its latest plan).
  const bandOf = {};
  for (const p of planEv) if (p.data.pppd != null) bandOf[p.session_id] = p.data.pppd < SNAP ? `Below $${SNAP} (average SNAP benefit)` : p.data.pppd < TFP ? `$${SNAP}–$${TFP}` : `$${TFP} or more (Thrifty Food Plan cost, ${BENCHMARKS.tfpAsOf})`;
  const bandShort = {};
  for (const p of planEv) if (p.data.pppd != null) bandShort[p.session_id] = p.data.pppd < SNAP ? 'below SNAP average' : p.data.pppd < TFP ? 'between SNAP and Thrifty' : 'at or above Thrifty';
  const bandRows = countBy(planEv.filter(p => bandOf[p.session_id]), p => bandOf[p.session_id]);
  const shortfall = new Set(planEv.filter(p => p.data.pppd != null && p.data.pppd < SNAP).map(p => p.session_id));
  const helps = events.filter(e => e.event === 'help_clicked');
  const routed = targets => sessionsWhere(helps, h => targets.includes(h.data.target));
  const routedBenefits = routed(roles.benefits || []), routedFood = routed(roles.food_help || []);

  const cant = events.filter(e => e.event === 'cant_use');
  const needTaps = events.filter(e => e.event === 'need_tapped');
  const offers = Object.fromEntries(providers.map(p => [String(p.id), p.offers || []]));
  const openedFor = (sid, need) => helps.some(h => h.session_id === sid && (
    (h.data.kind === 'resource' && ((roles.needs?.[need] || []).includes(h.data.target) || (roles.any_need || []).includes(h.data.target)))
    || (h.data.kind === 'site' && (offers[h.data.target] || []).includes(need))));
  const ctx = {
    k, events, needTaps, openedFor, views, visits, planEv, bandOf, bandShort, retail, boxEv, plans, boxes, zipOf, withZip, bandRows, shortfall, providers,
    roles: { benefits: roles.benefits || [], food_help: roles.food_help || [], needs: roles.needs || {}, any_need: roles.any_need || [] },
    labels: { ...DEFAULT_FRAMEWORK.labels, ...(framework.labels || {}) },
    routedBenefits, routedFood,
    shortfallBenefits: [...shortfall].filter(s => routedBenefits.has(s)).length,
    shortfallFood: [...shortfall].filter(s => routedFood.has(s)).length,
    cant, cantSessions: new Set(cant.map(e => e.session_id)),
    groupOf: r => Object.keys(CANT_USE).find(g => CANT_USE[g].includes(r)),
    outcome: events.filter(e => e.event === 'plan_outcome'),
    table: (title, head, rows, opts = {}) => {
      const kept = suppress(rows, k, opts);
      return { title, head, rows: kept, note: opts.note || null,
        ...(opts.oe ? { oe: Object.fromEntries(kept.map(([l]) => [l, opts.oe(l)]).filter(([, v]) => v)) } : {}) };
    },
  };

  return {
    city, from, to, k,
    title: framework.title || DEFAULT_FRAMEWORK.title,
    generated_at: new Date().toISOString(),
    overview: [
      ['Visits', n(visits.size, k)],
      ['Grocery plans built', n(plans.size, k)],
      ['Food boxes entered', n(boxes.size, k)],
      ['Visits that gave a ZIP code', n(Object.keys(zipOf).length, k)],
      ['Food sites listed in the directory (organizations)', providers.length],
    ],
    sections: framework.sections.map(sec => ({
      goal: sec.goal,
      intro: sec.intro,
      tables: sec.metrics.filter(id => METRICS[id]).map(id => [id, METRICS[id](ctx)]).filter(([, t]) => t).map(([id, t]) => ({ id, ...t, indicator: framework.indicators?.[id] || null })),
    })),
    limits: [
      `Counts are people who used the tool between ${from} and ${to}, not the population. Say “among people who used the tool.”`,
      `Any number under ${k} people is hidden, along with any number that would reveal it.`,
      'Answers are self-reported and not verified. The same person visiting twice is counted twice.',
      'Link taps are not outcomes: the tool cannot see benefit applications or pantry visits.',
      'Dollar figures use U.S. South region BLS average prices for 13 foods and estimates for the rest, until local shelf prices are added.',
      ...(retail ? [`Store findings use USDA's list of stores authorized to take SNAP (as of ${longDate(retail.as_of)}) and USDA's store types. Stores that don't take SNAP aren't counted. The focus area is ${retail.focus.zips} ZIP codes chosen to approximate Council Districts 1\u20134; ZIP codes and districts don't line up exactly.`] : []),
      `Budget benchmarks: the average SNAP benefit is about $${SNAP} per person per day (FY2025), and USDA's Thrifty Food Plan costs $${TFP} per person per day (reference family of four, ${BENCHMARKS.tfpAsOf}). The average SNAP benefit is lower than the Thrifty Food Plan cost. "Below the SNAP average" describes a household's grocery budget compared with what SNAP pays on average; it says nothing about SNAP eligibility or enrollment.`,
    ],
  };
}

/** The report as CSV rows (hidden cells written as "<k"). */
export function reportCsv(r) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  // city_indicator names the row's City indicator, if any, so the City can filter for it.
  // open_eligibility gives the standard category (Open Eligibility) for rows that have one (needs).
  const lines = [['section', 'table', 'label', 'value', 'city_indicator', 'open_eligibility'].join(',')];
  for (const [label, v] of r.overview) lines.push([esc('Overview'), esc(''), esc(label), esc(v ?? `<${r.k}`), esc(''), esc('')].join(','));
  for (const s of r.sections) for (const t of s.tables) for (const [label, v] of t.rows) lines.push([esc(s.goal), esc(t.title), esc(label), esc(v ?? `<${r.k}`), esc(t.indicator || ''), esc(t.oe?.[label] || '')].join(','));
  return lines.join('\n') + '\n';
}

/** Directory download: public listing details of approved food sites (never contact details). */
export function directoryCsv(providers) {
  const cols = ['name', 'kind', 'address', 'city', 'zip', 'hours', 'access', 'id_required', 'languages', 'offers', 'phone', 'website', 'confirmed_at'];
  const esc = v => `"${String(Array.isArray(v) ? v.join('; ') : v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...providers.map(p => cols.map(c => esc(p[c])).join(','))].join('\n') + '\n';
}
