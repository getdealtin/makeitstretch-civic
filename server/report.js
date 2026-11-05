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

const TFP = 5.36, SNAP = 6.22;

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
    { goal: 'Access', intro: 'Where people seek help stretching food money, how short budgets are, and where they can shop.', metrics: ['zip', 'budget_band', 'store', 'store_by_zip', 'cuisine'] },
    { goal: 'Benefits and food help', intro: 'People routed toward benefits and free food. These are link taps, not applications: the tool cannot see who applies.', metrics: ['routed', 'benefits_by_zip'] },
    { goal: 'Food that fits', intro: 'Food-box items people report they cannot use, and dietary needs.', metrics: ['cant_use', 'cant_group', 'cant_reason', 'cant_item', 'unlisted_food', 'diet'] },
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

const LABEL = {
  group: { cultural: 'Culture or religion', medical: 'Health', practical: 'Other reasons' },
  reason: { halal: 'Not halal', kosher: 'Not kosher', unfamiliar: 'Not a familiar food', diabetic: 'Not OK for diabetes', low_sodium: 'Too much salt', allergy: 'Allergy', no_kitchen: 'No way to cook it', dont_know_how: 'Don’t know how to cook it', spoiled: 'Spoiled or expired' },
  store: { full: 'Grocery store', dollar: 'Dollar store', corner: 'Corner store' },
  answer: { yes: 'Yes', some: 'Some of it', no: 'No' },
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
  store: c => c.table('Where people can shop most easily', ['Store type', 'People'], lab(LABEL.store, countBy(c.planEv, p => p.data.store || 'full')), { total: c.plans.size }),
  store_by_zip: c => c.table('Store type by ZIP code', ['ZIP · store', 'People'], countBy(c.planEv.filter(p => c.zipOf[p.session_id]), p => `${c.zipOf[p.session_id]} · ${LABEL.store[p.data.store || 'full']}`)),
  cuisine: c => c.table('Food style chosen', ['Cuisine', 'People'], countBy(c.planEv, p => (p.data.cuisine?.length ? p.data.cuisine : ['no preference']))),
  routed: c => c.table('People routed to benefits', ['', 'People'], [
    [`Tapped ${c.labels.benefits}`, c.routedBenefits.size],
    [`Tapped ${c.labels.food_help}`, c.routedFood.size],
    ['Budget below the SNAP benchmark', c.shortfall.size],
    [`…of those, tapped ${c.labels.benefits}`, c.shortfallBenefits],
    [`…of those, tapped ${c.labels.food_help}`, c.shortfallFood],
  ]),
  benefits_by_zip: c => c.table(`Taps on ${c.labels.benefits} by ZIP code`, ['ZIP code', 'People'], countBy(c.withZip.filter(e => e.event === 'help_clicked' && c.roles.benefits.includes(e.data.target)), e => e.zip)),
  cant_use: c => c.table('People reporting food they can’t use', ['', 'People'], [['Entered a food box', c.boxes.size], ['Reported at least one item they can’t use', c.cantSessions.size]]),
  cant_group: c => c.table('Reason group', ['Reason', 'People'], lab(LABEL.group, countBy(c.cant, e => c.groupOf(e.data.reason) || 'other'))),
  cant_reason: c => c.table('Reason', ['Reason', 'People'], lab(LABEL.reason, countBy(c.cant, e => e.data.reason))),
  cant_item: c => c.table('Item', ['Food-box item', 'People'], countBy(c.cant, e => e.data.item)),
  unlisted_food: c => c.table('Foods in boxes that aren’t on our list', ['Food (as typed)', 'People'], countBy(c.boxEv, e => e.data.other || []), { note: 'What people typed in. Shows what pantries hand out that the tool can’t use yet.' }),
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
export function cityReport(events, { k = 15, providers = [], from, to, city, roles = { benefits: [], food_help: [] }, framework = DEFAULT_FRAMEWORK }) {
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
  for (const p of planEv) if (p.data.pppd != null) bandOf[p.session_id] = p.data.pppd < TFP ? 'Below $5.36 (Thrifty Food Plan)' : p.data.pppd < SNAP ? '$5.36–$6.22' : '$6.22 or more (SNAP benchmark)';
  const bandRows = countBy(planEv.filter(p => bandOf[p.session_id]), p => bandOf[p.session_id]);
  const shortfall = new Set(planEv.filter(p => p.data.pppd != null && p.data.pppd < SNAP).map(p => p.session_id));
  const helps = events.filter(e => e.event === 'help_clicked');
  const routed = targets => sessionsWhere(helps, h => targets.includes(h.data.target));
  const routedBenefits = routed(roles.benefits || []), routedFood = routed(roles.food_help || []);

  const cant = events.filter(e => e.event === 'cant_use');
  const ctx = {
    events, views, visits, planEv, boxEv, plans, boxes, zipOf, withZip, bandRows, shortfall, providers,
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
      tables: sec.metrics.filter(id => METRICS[id]).map(id => ({ id, ...METRICS[id](ctx) })),
    })),
    limits: [
      `Counts are people who used the tool between ${from} and ${to}, not the population. Say “among people who used the tool.”`,
      `Any number under ${k} people is hidden, along with any number that would reveal it.`,
      'Answers are self-reported and not verified. The same person visiting twice is counted twice.',
      'Link taps are not outcomes: the tool cannot see benefit applications or pantry visits.',
      'Dollar figures use regional BLS average prices until local Data Steward prices are added.',
    ],
  };
}

/** The report as CSV rows (hidden cells written as "<k"). */
export function reportCsv(r) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['section', 'table', 'label', 'value'].join(',')];
  for (const [label, v] of r.overview) lines.push([esc('Overview'), esc(''), esc(label), esc(v ?? `<${r.k}`)].join(','));
  for (const s of r.sections) for (const t of s.tables) for (const [label, v] of t.rows) lines.push([esc(s.goal), esc(t.title), esc(label), esc(v ?? `<${r.k}`)].join(','));
  return lines.join('\n') + '\n';
}

/** CTFB handoff: public listing details of approved food sites (never contact details). */
export function directoryCsv(providers) {
  const cols = ['name', 'kind', 'address', 'zip', 'hours', 'access', 'id_required', 'languages', 'offers', 'phone', 'website', 'confirmed_at'];
  const esc = v => `"${String(Array.isArray(v) ? v.join('; ') : v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...providers.map(p => cols.map(c => esc(p[c])).join(','))].join('\n') + '\n';
}
