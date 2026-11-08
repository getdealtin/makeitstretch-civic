// Meal-first planner (engine/meals.js): the list comes from the meals, fits the budget, feeds the
// household, respects what they leave out and the diets they follow, and stays right after a swap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planMeals, rebuildList, resolvePrices, indexRecipes, INGREDIENT_FOODS, PANTRY_BASICS, FOOD_DB } from '../engine/index.js';
import { _test as D } from '../engine/diets.js';

const recipes = indexRecipes(JSON.parse(readFileSync(new URL('../data/seed-recipes.json', import.meta.url), 'utf8')));
const prices = resolvePrices('south');
const run = c => planMeals({ leftover: 'sometimes', cuisine: [], avoid: [], have: [], ...c }, prices, recipes);
const GRID = [
  { budget: 25, days: 7, people: 1 }, { budget: 25, days: 7, people: 2 }, { budget: 60, days: 7, people: 2 },
  { budget: 100, days: 7, people: 4 }, { budget: 500, days: 14, people: 4 }, { budget: 150, days: 14, people: 3 },
  { budget: 60, days: 7, people: 2, avoid: ['gluten', 'dairy'] }, { budget: 80, days: 7, people: 3, cuisine: ['latin'] },
  { budget: 60, days: 7, people: 2, have: ['rice', 'oil'] }, { budget: 40, days: 3, people: 5, leftover: 'no' },
];
const meals = r => r.weeks.flat().filter(d => !d.leftover && !d.uncovered).flatMap(d => ['breakfast', 'lunch', 'dinner'].map(sl => d[sl]));
const missing = (r, picks) => {
  const on = new Set([...r.cart.map(i => i.id), ...r.have]);
  return picks.flatMap(rec => rec.ingredients.filter(w => !PANTRY_BASICS.has(w) && !(INGREDIENT_FOODS[w] || []).some(id => on.has(id))).map(w => `${rec.title}: ${w}`));
};

test('every meal in the plan can be cooked from the list (plus salt, water, cinnamon and what she has)', () => {
  for (const c of GRID) {
    const r = run(c);
    assert.deepEqual(missing(r, meals(r).map(o => o[0])), [], JSON.stringify(c));
  }
});

test('the list fits the budget and buys what the meals use, not piles of one staple', () => {
  for (const c of GRID) {
    const r = run(c);
    assert.ok(r.spent <= c.budget + 1e-9, `${JSON.stringify(c)} spent ${r.spent}`);
    for (const i of r.cart) assert.ok(i.qty * i.srv - i.servings < i.srv, `${JSON.stringify(c)} ${i.id}: ${i.qty} packages for ${i.servings} servings`);
  }
  // The reported case: $500, 14 days, a family of 4 never gets 9 bags of cornmeal.
  const big = run({ budget: 500, days: 14, people: 4 });
  assert.ok(!(big.cart.find(i => i.id === 'cornmeal')?.qty > 3));
});

test('a workable budget feeds everyone about 2,000 calories a day; a tight one says how many days it covers', () => {
  for (const c of [{ budget: 60, days: 7, people: 2 }, { budget: 100, days: 7, people: 4 }, { budget: 500, days: 14, people: 4 }]) {
    const r = run(c);
    assert.equal(r.coveredDays, c.days); assert.ok(r.calPct >= 95, `${JSON.stringify(c)}: ${r.calPct}%`);
  }
  const tight = run({ budget: 10, days: 7, people: 4 });
  assert.ok(tight.coveredDays < 7 || tight.reason === 'budget_too_small');
  if (tight.state) assert.ok(tight.weeks.flat().some(d => d.uncovered));
});

test('extra money buys better meals and food groups, and the rest is left over, not spent on one food', () => {
  const r = run({ budget: 500, days: 14, people: 2 });
  assert.ok(r.remaining > 0);
  const cats = new Set(r.cart.map(i => i.cat));
  for (const c of ['grain', 'protein', 'vegetable', 'fruit', 'dairy']) assert.ok(cats.has(c), c);
  const ample = new Set(r.cart.map(i => i.id)), lean = new Set(run({ budget: 40, days: 14, people: 2 }).cart.map(i => i.id));
  assert.notDeepEqual([...ample].sort(), [...lean].sort(), 'different budgets, different lists');
});

test('lists follow the household: cuisine, foods on hand and foods left out change the plan', () => {
  const ids = c => run({ budget: 80, days: 7, people: 2, ...c }).cart.map(i => i.id).sort().join();
  assert.notEqual(ids({ cuisine: ['latin'] }), ids({ cuisine: ['asian'] }));
  const have = run({ budget: 60, days: 7, people: 2, have: ['rice', 'oil'] });
  assert.ok(!have.cart.some(i => i.id === 'rice' || i.id === 'oil'), 'not bought: she has them');
});

test('foods left out and diets are respected in the list and every meal', () => {
  const tagged = (r, tag) => r.cart.filter(i => (FOOD_DB.find(f => f.id === i.id).avoid || []).includes(tag)).map(i => i.id);
  for (const tag of ['gluten', 'dairy', 'meat', 'eggs', 'peanuts', 'fish']) {
    const r = run({ budget: 80, days: 7, people: 2, avoid: [tag] });
    assert.deepEqual(tagged(r, tag), [], tag);
    assert.ok(meals(r).flat().every(rec => !(rec.avoid || []).includes(tag)), tag);
  }
  for (const diet of ['pork', 'halal', 'kosher']) {
    const r = run({ budget: 120, days: 7, people: 2, avoid: [diet] });
    assert.ok(!r.cart.some(i => D.PORK_FOODS.includes(i.id)), diet);
    assert.ok(meals(r).flat().every(rec => !rec.ingredients.includes('pork')), diet);
  }
  const kosher = run({ budget: 150, days: 7, people: 2, avoid: ['kosher'] });
  assert.ok(meals(kosher).flat().every(rec => !(rec.ingredients.some(w => ['chicken', 'ground beef', 'pork'].includes(w)) && rec.ingredients.some(w => ['milk', 'butter'].includes(w)))), 'no meat with dairy');
  const salt = run({ budget: 80, days: 7, people: 2, avoid: ['low_sodium'] });
  assert.ok(!salt.cart.some(i => D.SALTY_FOODS.includes(i.id))); assert.ok(meals(salt).flat().every(rec => !rec.ingredients.includes('soy sauce')));
  const sugar = run({ budget: 200, days: 7, people: 2, avoid: ['diabetic'] });
  assert.ok(!sugar.cart.some(i => D.SUGARY_FOODS.includes(i.id)));
});

test('swapping meals keeps the list complete and within budget', () => {
  for (const c of GRID) {
    const r = run(c);
    if (!r.state) continue;
    const keys = r.state.assigned.map(x => x.key);
    const swapped = rebuildList(r.state, keys);
    const picks = r.weeks.flatMap((w, wi) => w.flatMap((d, di) => (d.leftover || d.uncovered ? [] : ['breakfast', 'lunch', 'dinner'].map(sl => d[sl][1] || d[sl][0]))));
    assert.deepEqual(missing(swapped, picks), [], JSON.stringify(c));
    // Extras give way first; if the chosen meals alone cost more, the plan says by how much.
    assert.ok(swapped.spent <= c.budget + 1e-9 || swapped.overBudget === +(swapped.spent - c.budget).toFixed(2), `${JSON.stringify(c)} after swaps: ${swapped.spent}`);
  }
});

test('same inputs, same plan', () => {
  const a = run({ budget: 75, days: 10, people: 3 }), b = run({ budget: 75, days: 10, people: 3 });
  assert.deepEqual(a.cart.map(i => [i.id, i.qty]), b.cart.map(i => [i.id, i.qty]));
  assert.deepEqual(a.weeks, b.weeks);
});

test('variety cap: no ingredient but staples and seasonings in more than about 1 in 4 meals', async () => {
  const { capExcess, CAP_EXEMPT } = await import('../engine/meals.js');
  for (const c of GRID.filter(c => c.budget >= 60)) {
    const r = run(c);
    assert.equal(capExcess(r.state.assigned).excess, 0, JSON.stringify(c));
  }
  for (const id of ['rice', 'drybeans', 'onions', 'oil', 'garlic']) assert.ok(CAP_EXEMPT.has(id), id);
  // The reported case: 17 cans of tomatoes for a family of 5 over two weeks. Now about half: 3 stews over
  // two weeks (9 cans since meals also count fullness, Nov 8, and tomato stews are filling per calorie).
  const fam = run({ budget: 500, days: 14, people: 5, avoid: ['halal'] });
  assert.ok(fam.cart.find(i => i.id === 'cannedtomatoes').qty <= 9);
});

test('plans over a week get one list per week that adds up to the whole plan', () => {
  for (const c of [{ budget: 500, days: 14, people: 5 }, { budget: 150, days: 14, people: 3 }, { budget: 300, days: 21, people: 4 }]) {
    const r = run(c);
    assert.equal(r.byWeek.length, Math.ceil(r.coveredDays / 7));
    for (const i of r.cart) assert.equal(r.byWeek.reduce((a, w) => a + (w.cart.find(x => x.id === i.id)?.qty || 0), 0), i.qty, `${JSON.stringify(c)} ${i.id}`);
    assert.equal(+r.byWeek.reduce((a, w) => a + w.spent, 0).toFixed(2), r.spent);
  }
  assert.equal(run({ budget: 60, days: 7, people: 2 }).byWeek.length, 0, 'a one-week plan has one list');
});

test('the shorter list repeats fewer different meals', () => {
  const distinct = r => new Set(r.state.assigned.map(x => x.rec.id)).size;
  const c = { budget: 120, days: 14, people: 3 };
  const full = run(c), short = run({ ...c, menu: 'short' });
  assert.ok(distinct(short) < distinct(full));
  assert.ok(short.cart.length <= full.cart.length);
});

test('tightest budgets: the plan still recommends meals and says when foods repeat', () => {
  const r = run({ budget: 60, days: 14, people: 5 });
  assert.ok(r.state && r.cart.length > 0);
  assert.equal(r.repeats, true);
  assert.equal(run({ budget: 120, days: 7, people: 2 }).repeats, false);
});

// Government guidance and satiety (the principles the original engine was built on, now enforced on the
// meal planner itself). Budgets at or above the average SNAP benefit ($6.22 per person per day) must give
// each person about 2,000 calories, enough protein and fiber, a fruit and two vegetable servings a day, and
// calories that are filling (calorie-weighted satiety ≥ 1.0: protein, fiber and water, engine/satiety.js).
test('plans meet the calorie floor, food groups and fullness at or above the SNAP average', () => {
  const F = Object.fromEntries(FOOD_DB.map(f => [f.id, f]));
  for (const people of [1, 2, 4]) for (const pppd of [6.22, 8.44, 12]) {
    const c = { budget: +(pppd * people * 7).toFixed(2), days: 7, people };
    const r = run(c), pd = people * r.coveredDays, tag = JSON.stringify(c);
    assert.equal(r.coveredDays, 7, `covers the week: ${tag}`);
    let kcal = 0, protein = 0, fiber = 0, filling = 0; const groups = { fruit: 0, vegetable: 0 };
    for (const i of r.cart) {
      const f = F[i.id], k = (f.cal / f.srv) * i.servings;
      kcal += k; filling += k * f.sat;
      protein += ((f.protein || 0) / f.srv) * i.servings; fiber += ((f.fiber || 0) / f.srv) * i.servings;
      if (f.cat in groups && !['onions', 'garlic'].includes(f.id)) groups[f.cat] += i.servings;
    }
    assert.ok(kcal / pd >= 1950, `calories ${Math.round(kcal / pd)}: ${tag}`);
    assert.ok(protein / pd >= 50, `protein ${Math.round(protein / pd)} g: ${tag}`);
    assert.ok(fiber / pd >= 25, `fiber ${Math.round(fiber / pd)} g: ${tag}`);
    assert.ok(groups.fruit / pd >= 0.75, `fruit ${(groups.fruit / pd).toFixed(1)}: ${tag}`);
    assert.ok(groups.vegetable / pd >= 2, `vegetables ${(groups.vegetable / pd).toFixed(1)}: ${tag}`);
    assert.ok(filling / kcal >= 1.0, `satiety ${(filling / kcal).toFixed(2)}: ${tag}`);
  }
});

test('extra money buys more filling meals, never fewer calories', () => {
  const satiety = r => { const F = Object.fromEntries(FOOD_DB.map(f => [f.id, f]));
    let k = 0, s = 0; for (const i of r.cart) { const kc = (F[i.id].cal / F[i.id].srv) * i.servings; k += kc; s += kc * F[i.id].sat; } return s / k; };
  const tight = run({ budget: 44, days: 7, people: 2 }), roomy = run({ budget: 120, days: 7, people: 2 });
  assert.ok(roomy.cppd >= tight.cppd - 50, 'no fewer calories with more money');
  assert.ok(satiety(roomy) >= satiety(tight), 'more money, more filling food');
});
