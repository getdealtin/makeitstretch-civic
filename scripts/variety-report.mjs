// Value and variety report: the same random households run through one version of the engine.
//
//   node scripts/variety-report.mjs <engine root> [--draw] [--households 400] [--weeks 4] > out.json
//
// <engine root> is a checkout of this repository (for the version live before Nov 19 2026:
//   git worktree add /tmp/before 3269f0c   then   node scripts/variety-report.mjs /tmp/before).
// --draw gives each new plan a random draw (input.seed), as the site does since Nov 19 2026; without it every
// plan is planned the way it was before (no draw). Households come from a fixed pseudo-random sequence, so two
// runs on the same version give the same numbers.
//
// Value: within budget, calories and protein per person per day, days covered, list length, principles kept,
// the balance foods added with money left (vegetable side, second fruit, milk), the budget left, time per plan.
// Variety: different meals in a week, the same breakfast all week, how many different recipes reach households,
// the share of all meals taken by the 10 most common, cuisine mix by budget level, and for a returning family
// (same answers, a new plan each week, the last plan's meals passed back as a saved plan would) how many meals
// are new from one week to the next.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const ROOT = args.find((a, i) => !a.startsWith('--') && !/^\d+$/.test(a) && args[i - 1] !== '--community');
const flag = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : Number(args[i + 1]); };
const DRAW = args.includes('--draw'), N = flag('--households', 400), WEEKS = flag('--weeks', 4);
// --community <file>: extra recipes marked community: true (a JSON { recipes: [...] }), to measure how often
// neighbors' recipes reach plans (option A, Nov 22 2026). The same file runs on any version of the engine.
const COMMUNITY_FILE = (() => { const i = args.indexOf('--community'); return i < 0 ? null : args[i + 1]; })();
const E = await import(`${ROOT}/engine/index.js`);
const { checkPrinciples } = await import(`${ROOT}/engine/principles.js`);
const read = f => JSON.parse(readFileSync(`${ROOT}/data/${f}`, 'utf8'));
const recipes = [...E.indexRecipes(read('seed-recipes.json')), ...read('nih-recipes.json').recipes.map(({ es, key, ...r }) => r), ...read('simple-meals.json').recipes];
if (COMMUNITY_FILE) recipes.push(...JSON.parse(readFileSync(COMMUNITY_FILE, 'utf8')).recipes);
const byId = new Map(recipes.map(r => [r.id, r]));
const { snapPerPersonDay: SNAP, tfpPerPersonDay: TFP } = E.BENCHMARKS;

let s = 20261119; const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
let d = 777; const drawRnd = () => { d = (Math.imul(d, 1103515245) + 12345) >>> 0; return d % 2147483647; }; // the draws, separate from households
const CUIS = ['american', 'latin', 'asian', 'southern', 'mediterranean'];
const AVOID = ['gluten', 'dairy', 'meat', 'pork', 'eggs', 'peanuts', 'fish', 'halal', 'kosher', 'diabetic', 'low_sodium'];

const household = () => {
  const people = 1 + Math.floor(rnd() * 6), days = pick([7, 7, 7, 14, 4, 30]);
  const perDay = 2 + rnd() * 10; // dollars per person per day, $2–$12
  return { budget: Math.round(perDay * people * days), days, people, leftover: pick(['yes', 'sometimes', 'no']),
    cuisine: rnd() < 0.25 ? [pick(CUIS)] : [], avoid: rnd() < 0.3 ? [pick(AVOID)] : [], have: [], menu: rnd() < 0.15 ? 'short' : 'full',
    region: pick(['northeast', 'midwest', 'south', 'west']) };
};
const plan = (h, extra = {}) => E.planMeals({ ...h, ...(DRAW ? { seed: drawRnd() } : {}), ...extra }, E.resolvePrices(h.region), recipes);
const served = r => (r.weeks || []).flatMap(wk => wk.flatMap(dd => ['breakfast', 'lunch', 'dinner'].map(sl => dd[sl]?.[0]?.id))).filter(Boolean);
const band = h => { const p = h.budget / h.people / h.days; return p < SNAP ? 'below SNAP' : p < TFP ? 'SNAP to Thrifty' : 'Thrifty and up'; };

const out = { version: ROOT, draw: DRAW, households: N, principleFails: 0, overBudget: 0, value: [], weekDifferent: [], sameBreakfastAllWeek: 0, weeksChecked: 0,
  counts: {}, cuisine: {}, returning: [] };
for (let k = 0; k < N; k++) {
  const h = household();
  const t0 = performance.now();
  const r = plan(h);
  const fails = checkPrinciples(r).failed;
  if (fails.length) { out.principleFails++; (out.failDetails ||= []).push({ household: h, failed: fails }); }
  if (r.spent > h.budget + 0.005) out.overBudget++;
  const st = r.state;
  out.value.push({ band: band(h), cppd: r.cppd, calPct: r.calPct, protein: st?.assigned ? st.assigned.reduce((a, x) => a + (x.rec.protein || 0) * (x.servings || 0), 0) / h.people / Math.max(1, r.coveredDays) : 0,
    covered: r.coveredDays / h.days, items: r.cart.length, leftPct: (h.budget - r.spent) / h.budget,
    balance: Object.keys(st?.balance || {}).length, community: served(r).some(id => byId.get(id)?.community), ms: performance.now() - t0 });
  const ids = served(r);
  for (const id of ids) {
    out.counts[id] = (out.counts[id] || 0) + 1;
    const c = byId.get(id)?.cuisine || 'any', b = band(h);
    ((out.cuisine[b] ||= {})[c] = (out.cuisine[b][c] || 0) + 1);
  }
  const w1 = r.weeks?.[0];
  if (h.days >= 7 && w1) {
    out.weeksChecked++;
    out.weekDifferent.push(new Set(w1.flatMap(dd => ['breakfast', 'lunch', 'dinner'].map(sl => dd[sl]?.[0]?.id)).filter(Boolean)).size);
    const bf = w1.filter(dd => !dd.leftover && !dd.uncovered && dd.breakfast?.[0]).map(dd => dd.breakfast[0].id);
    if (bf.length >= 6 && new Set(bf).size === 1) out.sameBreakfastAllWeek++;
  }
}
// A returning family: the same answers each week; with the draw, the last plan's meals are passed back.
let r2 = 4242; const famRnd = () => { r2 = (Math.imul(r2, 1664525) + 1013904223) >>> 0; return r2 / 4294967296; };
for (let f = 0; f < Math.min(100, N); f++) {
  const people = 1 + Math.floor(famRnd() * 5), perDay = 3 + famRnd() * 7;
  const h = { budget: Math.round(perDay * people * 7), days: 7, people, leftover: 'sometimes', cuisine: [], avoid: [], have: [], region: ['northeast', 'midwest', 'south', 'west'][f % 4] };
  let last = [], newShare = [], seen = new Set();
  for (let w = 0; w < WEEKS; w++) {
    const r = plan(h, DRAW ? { recent: [...new Set(last)].slice(0, 30) } : {});
    const ids = served(r), uniq = new Set(ids);
    if (w > 0) newShare.push([...uniq].filter(id => !new Set(last).has(id)).length / Math.max(uniq.size, 1));
    for (const id of uniq) seen.add(id);
    last = ids;
  }
  out.returning.push({ newEachWeek: newShare.reduce((a, b) => a + b, 0) / Math.max(newShare.length, 1), differentInMonth: seen.size });
}

const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1);
const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const total = Object.values(out.counts).reduce((a, b) => a + b, 0);
const sorted = Object.entries(out.counts).sort((a, b) => b[1] - a[1]);
const share = n => sorted.slice(0, n).reduce((a, x) => a + x[1], 0) / total;
const original = recipes.filter(r => r.id <= 161);
const byBand = b => out.value.filter(v => v.band === b);
const valueOf = vs => ({ plans: vs.length, caloriesPerPersonDay: Math.round(avg(vs.map(v => v.cppd))), metCalorieGoal: +(vs.filter(v => v.calPct >= 99).length / Math.max(vs.length, 1) * 100).toFixed(1),
  proteinGramsPerPersonDay: Math.round(avg(vs.map(v => v.protein))), daysCovered: +(avg(vs.map(v => v.covered)) * 100).toFixed(1), listItems: med(vs.map(v => v.items)),
  // the vegetable side, second fruit and cup of milk a day added with money left (0–3 per plan)
  balanceAddsPerPlan: +avg(vs.map(v => v.balance)).toFixed(2), budgetLeftPct: +(avg(vs.map(v => v.leftPct)) * 100).toFixed(1),
  msPerPlanMedian: Math.round(med(vs.map(v => v.ms))),
  plansWithACommunityRecipe: +(vs.filter(v => v.community).length / Math.max(vs.length, 1) * 100).toFixed(1) });
console.log(JSON.stringify({
  version: out.version, draw: out.draw, households: N,
  failDetails: (out.failDetails || []).slice(0, 5),
  value: { principleFailures: out.principleFails, overBudget: out.overBudget, all: valueOf(out.value),
    belowSNAP: valueOf(byBand('below SNAP')), snapToThrifty: valueOf(byBand('SNAP to Thrifty')), thriftyAndUp: valueOf(byBand('Thrifty and up')) },
  variety: {
    differentMealsInAWeek: +avg(out.weekDifferent).toFixed(1), sameBreakfastAllWeek: `${out.sameBreakfastAllWeek} of ${out.weeksChecked}`,
    recipesReachingHouseholds: `${sorted.length} of ${recipes.length}`, originalRecipesReaching: `${original.filter(r => out.counts[r.id]).length} of ${original.length}`,
    top10ShareOfMeals: +(share(10) * 100).toFixed(1), top25ShareOfMeals: +(share(25) * 100).toFixed(1),
    communityRecipesReaching: `${recipes.filter(r => r.community && out.counts[r.id]).length} of ${recipes.filter(r => r.community).length}`,
    communityByRecipe: recipes.filter(r => r.community).map(r => `${r.title}: ${out.counts[r.id] || 0}`),
    communityShareOfMeals: +(sorted.filter(([id]) => byId.get(Number(id))?.community).reduce((a, x) => a + x[1], 0) / total * 100).toFixed(1),
    mostServed: sorted.slice(0, 5).map(([id, n]) => `${byId.get(Number(id))?.title} (${(n / total * 100).toFixed(1)}%)`),
    cuisineByBudget: Object.fromEntries(Object.entries(out.cuisine).map(([b, c]) => { const t = Object.values(c).reduce((x, y) => x + y, 0); return [b, Object.fromEntries(Object.entries(c).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, +(v / t * 100).toFixed(1)]))]; })),
    returningFamily: { families: out.returning.length, weeks: WEEKS, newMealsEachWeekPct: +(avg(out.returning.map(x => x.newEachWeek)) * 100).toFixed(1), differentMealsOverTheWeeks: +avg(out.returning.map(x => x.differentInMonth)).toFixed(1) },
  },
}, null, 1));
