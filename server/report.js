// Phase 5: the City report. Aggregated, organized by Food Plan goal, with small-cell suppression.
//
// Rules:
//  • Every number counts people (distinct visits), never clicks.
//  • Any number under k (the city's k_anon_threshold, 15 for Austin) is hidden.
//  • Secondary suppression: if a table shows its total and exactly one row is hidden, the next
//    smallest row is hidden too, so the hidden one can't be worked out by subtraction.
//  • Organization counts (food sites in the directory) are not people and are not suppressed.

import { CANT_USE } from './events.js';

const TFP = 5.36, SNAP = 6.22;
const BENEFITS = ['tx-snap', 'tx-wic', 'snap', 'wic'];
const FOOD_HELP = ['ctfb-find-food', '211-texas', 'foodbank', '211'];

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

/**
 * @param {object[]} events   raw events for one city and date range (test traffic already excluded)
 * @param {{k:number, providers:object[], from:string, to:string, city:string}} opts
 */
export function cityReport(events, { k = 15, providers = [], from, to, city }) {
  const visits = sessionsWhere(events, e => e.event === 'page_view');
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
  const routedBenefits = routed(BENEFITS), routedFood = routed(FOOD_HELP);
  const shortfallBenefits = [...shortfall].filter(s => routedBenefits.has(s)).length;
  const shortfallFood = [...shortfall].filter(s => routedFood.has(s)).length;

  const cant = events.filter(e => e.event === 'cant_use');
  const groupOf = r => Object.keys(CANT_USE).find(g => CANT_USE[g].includes(r));
  const cantSessions = new Set(cant.map(e => e.session_id));
  const outcome = events.filter(e => e.event === 'plan_outcome');
  const LABEL = {
    group: { cultural: 'Culture or religion', medical: 'Health', practical: 'Other reasons' },
    reason: { halal: 'Not halal', kosher: 'Not kosher', unfamiliar: 'Not a familiar food', diabetic: 'Not OK for diabetes', low_sodium: 'Too much salt', allergy: 'Allergy', no_kitchen: 'No way to cook it', dont_know_how: 'Don’t know how to cook it', spoiled: 'Spoiled or expired' },
    store: { full: 'Grocery store', dollar: 'Dollar store', corner: 'Corner store' },
    answer: { yes: 'Yes', some: 'Some of it', no: 'No' },
    lang: { en: 'English', es: 'Spanish', vi: 'Vietnamese', 'zh-Hans': 'Chinese' },
  };
  const lab = (map, rows) => rows.map(([k2, v]) => [map[k2] || k2, v]);
  const table = (title, head, rows, opts = {}) => ({ title, head, rows: suppress(rows, k, opts), note: opts.note || null });

  return {
    city, from, to, k,
    generated_at: new Date().toISOString(),
    overview: [
      ['Visits', n(visits.size, k)],
      ['Grocery plans built', n(plans.size, k)],
      ['Food boxes entered', n(boxes.size, k)],
      ['Visits that gave a ZIP code', n(Object.keys(zipOf).length, k)],
      ['Food sites listed in the directory (organizations)', providers.length],
    ],
    sections: [
      {
        goal: 'Goal 6 · Access',
        intro: 'Where people seek help stretching food money, how short budgets are, and where they can shop.',
        tables: [
          table('People by ZIP code', ['ZIP code', 'People'], countBy(withZip, e => e.zip)),
          table('Budget per person per day (grocery plans)', ['Band', 'People'], bandRows, { total: plans.size }),
          table('Where people can shop most easily', ['Store type', 'People'], lab(LABEL.store, countBy(planEv, p => p.data.store || 'full')), { total: plans.size }),
          table('Store type by ZIP code', ['ZIP · store', 'People'], countBy(planEv.filter(p => zipOf[p.session_id]), p => `${zipOf[p.session_id]} · ${LABEL.store[p.data.store || 'full']}`)),
          table('Food style chosen', ['Cuisine', 'People'], countBy(planEv, p => (p.data.cuisine?.length ? p.data.cuisine : ['no preference']))),
        ],
      },
      {
        goal: 'Strategy 6.6 · Benefits navigation',
        intro: 'People routed toward SNAP and WIC. These are link taps, not applications: the tool cannot see who applies.',
        tables: [
          table('People routed to benefits', ['', 'People'], [
            ['Tapped SNAP or WIC', routedBenefits.size],
            ['Tapped a food bank or 2-1-1', routedFood.size],
            ['Budget below the SNAP benchmark', shortfall.size],
            ['…of those, tapped SNAP or WIC', shortfallBenefits],
            ['…of those, tapped a food bank or 2-1-1', shortfallFood],
          ]),
          table('SNAP or WIC taps by ZIP code', ['ZIP code', 'People'], countBy(withZip.filter(e => e.event === 'help_clicked' && BENEFITS.includes(e.data.target)), e => e.zip)),
        ],
      },
      {
        goal: 'Goal 4 · Preparedness (strategy 4.2)',
        intro: 'Food-box items recipients report they cannot use, and dietary needs. A recipient-reported proxy for the Food Plan’s culturally relevant and medically necessary food indicators, not a measure of food in storage.',
        tables: [
          table('People reporting food they can’t use', ['', 'People'], [['Entered a food box', boxes.size], ['Reported at least one item they can’t use', cantSessions.size]]),
          table('Reason group', ['Reason', 'People'], lab(LABEL.group, countBy(cant, c => groupOf(c.data.reason) || 'other'))),
          table('Reason', ['Reason', 'People'], lab(LABEL.reason, countBy(cant, c => c.data.reason))),
          table('Item', ['Food-box item', 'People'], countBy(cant, c => c.data.item)),
          table('Dietary needs (plans and boxes)', ['Need', 'People'], countBy([...planEv, ...boxEv], e => e.data.avoid || [])),
        ],
      },
      {
        goal: 'Strategy 6.7 · Language and technology barriers',
        intro: 'Language used, and whether people kept plans to use later.',
        tables: [
          table('Language used', ['Language', 'People'], lab(LABEL.lang, countBy(events.filter(e => e.event === 'page_view'), e => e.lang)), { total: visits.size }),
        ],
      },
      {
        goal: 'Outcomes',
        intro: 'Asked when someone returns to a saved plan or link.',
        tables: [
          table('“Did you use this plan?”', ['Answer', 'People'], lab(LABEL.answer, countBy(outcome, e => e.data.answer))),
          table('Return visits', ['How', 'People'], lab({ saved: 'Reopened a saved plan', link: 'Opened a shared link' }, countBy(events.filter(e => e.event === 'plan_reopened'), e => e.data.source))),
        ],
      },
      {
        goal: 'Goal 9 · Empower (participation)',
        intro: 'Organizations taking part through the food directory.',
        tables: [
          { title: 'Food sites in the directory', head: ['Type', 'Organizations'], rows: Object.entries(providers.reduce((m, p) => ((m[p.kind] = (m[p.kind] || 0) + 1), m), {})), note: 'Organizations, not people: not suppressed.' },
        ],
      },
      {
        goal: 'How people found the tool',
        intro: 'From source tags on links and printed QR codes.',
        tables: [table('Visits by source', ['Source', 'People'], countBy(events.filter(e => e.event === 'page_view'), e => e.data?.src || 'direct'), { total: visits.size })],
      },
    ],
    limits: [
      `Counts are people who used the tool between ${from} and ${to}, not the population. Say “among people who used the tool.”`,
      `Any number under ${k} people is hidden, along with any number that would reveal it.`,
      'Answers are self-reported and not verified. The same person visiting twice is counted twice.',
      'Link taps are not outcomes: the tool cannot see SNAP applications or pantry visits.',
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
