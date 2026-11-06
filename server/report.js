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

import { CANT_USE } from './events.js';

import { BENCHMARKS } from '../engine/index.js';
const { tfpPerPersonDay: TFP, snapPerPersonDay: SNAP } = BENCHMARKS;

/** Resource ids by role, from a city's resources: { benefits: [...], food_help: [...] }. */
export function rolesOf(resources = []) {
  const out = { benefits: [], food_help: [] };
  for (const r of resources) if (r.role && out[r.role]) out[r.role].push(r.id);
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
    { goal: 'Needs beyond food', intro: 'What else people asked about after getting their plan: a de-identified signal for nonprofit partners.', metrics: ['needs', 'needs_by_zip'] },
    { goal: 'Language', intro: 'Language used.', metrics: ['language'] },
    { goal: 'Outcomes', intro: 'Asked when someone returns to a saved plan or link.', metrics: ['outcome', 'returns'] },
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
  needs: c => c.table('Other needs people asked about', ['Need', 'People'], lab(LABEL.need, countBy(c.events.filter(e => e.event === 'need_tapped'), e => e.data.need)), { note: 'Taps on a need after the plan. No one is contacted and nothing is requested.' }),
  needs_by_zip: c => c.table('Other needs by ZIP code', ['ZIP · need', 'People'], countBy(c.withZip.filter(e => e.event === 'need_tapped'), e => `${e.zip} · ${LABEL.need[e.data.need] || e.data.need}`)),
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
  directory: c => ({ title: 'Food sites in the directory', head: ['Type', 'Organizations'], rows: Object.entries(c.providers.reduce((m, p) => ((m[p.kind] = (m[p.kind] || 0) + 1), m), {})), note: 'Organizations, not people: not suppressed.' }),
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
  const ctx = {
    events, views, visits, planEv, bandOf, bandShort, retail, boxEv, plans, boxes, zipOf, withZip, bandRows, shortfall, providers,
    roles: { benefits: roles.benefits || [], food_help: roles.food_help || [] },
    labels: { ...DEFAULT_FRAMEWORK.labels, ...(framework.labels || {}) },
    routedBenefits, routedFood,
    shortfallBenefits: [...shortfall].filter(s => routedBenefits.has(s)).length,
    shortfallFood: [...shortfall].filter(s => routedFood.has(s)).length,
    cant, cantSessions: new Set(cant.map(e => e.session_id)),
    groupOf: r => Object.keys(CANT_USE).find(g => CANT_USE[g].includes(r)),
    outcome: events.filter(e => e.event === 'plan_outcome'),
    table: (title, head, rows, opts = {}) => ({ title, head, rows: suppress(rows, k, opts), note: opts.note || null }),
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
  const lines = [['section', 'table', 'label', 'value', 'city_indicator'].join(',')];
  for (const [label, v] of r.overview) lines.push([esc('Overview'), esc(''), esc(label), esc(v ?? `<${r.k}`), esc('')].join(','));
  for (const s of r.sections) for (const t of s.tables) for (const [label, v] of t.rows) lines.push([esc(s.goal), esc(t.title), esc(label), esc(v ?? `<${r.k}`), esc(t.indicator || '')].join(','));
  return lines.join('\n') + '\n';
}

/** CTFB handoff: public listing details of approved food sites (never contact details). */
export function directoryCsv(providers) {
  const cols = ['name', 'kind', 'address', 'zip', 'hours', 'access', 'id_required', 'languages', 'offers', 'phone', 'website', 'confirmed_at'];
  const esc = v => `"${String(Array.isArray(v) ? v.join('; ') : v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...providers.map(p => cols.map(c => esc(p[c])).join(','))].join('\n') + '\n';
}
