// Engine tests. Three layers:
//   1. Better than the original: on a 360-case grid the satiety engine must be at least as
//      filling as the frozen live reference, keep the calorie floor, and use the budget.
//   2. Goldens: five pinned snapshots of the current engine in fixtures.json.
//   3. Invariants: properties that must hold for any input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allCases } from './cases.js';
import { runNew, runLegacy, RECIPES } from './run-both.js';
import { buildCart, resolvePrices, matchRecipes, planWeeks, groupShoppingList, zipToInfo, FOOD_DB, NUTRITION, SATIETY } from '../engine/index.js';
import { FLOOR_KCAL } from '../engine/cart.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));
const cases = allCases();

// The satiety upgrade deliberately changes the cart, so instead of matching the original tool
// exactly, the new engine must beat it on every input (scored with the same USDA calories):
// at least as filling, never under the calorie floor where the original met it, same budget use.
const kcalOf = cart => cart.reduce((t, [id, qty]) => t + NUTRITION[id].kcal * qty, 0);
const fullOf = cart => cart.reduce((t, [id, qty]) => t + NUTRITION[id].kcal * qty * SATIETY[id], 0) / kcalOf(cart);
test(`satiety upgrade beats the original tool (${cases.length} cases)`, () => {
  let better = 0;
  for (const c of cases) {
    const L = runLegacy(c).cart, N = runNew(c).cart, d = c.people * c.days, tag = JSON.stringify(c);
    assert.ok(fullOf(N) >= fullOf(L) - 0.03, `less filling: ${tag}`);
    if (kcalOf(L) / d >= FLOOR_KCAL) assert.ok(kcalOf(N) / d >= FLOOR_KCAL, `under the calorie floor: ${tag}`);
    const spent = x => x.reduce((t, [, , sub]) => t + sub, 0);
    // Tight budgets (up to $10 a person a day; SNAP is $6.22) must use every dollar. Above that the
    // original spent the extra on more oil and sauces, which the new engine deliberately does not.
    if (c.budget / d <= 10) assert.ok(spent(N) >= spent(L) - 1, `leaves money unspent: ${tag}`);
    if (fullOf(N) > fullOf(L) + 0.005) better++;
  }
  assert.ok(better > cases.length / 4, `only ${better} cases more filling`);
});

test('oil and pantry items are never scaled up', () => {
  for (const c of cases) for (const i of buildCart(c, resolvePrices(c.region)).cart)
    if (i.cat === 'fat' || i.cat === 'pantry') assert.equal(i.qty, 1, `${i.id} ×${i.qty}`);
});

test('every food has USDA nutrition', () => {
  for (const f of FOOD_DB) {
    assert.ok(NUTRITION[f.id]?.fdc > 0, `${f.id} has no FoodData Central id`);
    assert.equal(f.cal, NUTRITION[f.id].kcal, f.id);
    assert.ok(f.sat >= 0.5 && f.sat <= 1.4, f.id);
  }
});

test('multi-word ingredients pull in their recipes (canned tomatoes, sweet potatoes, peanut butter)', () => {
  for (const [id, word] of [['cannedtomatoes', 'canned tomatoes'], ['sweetpotatoes', 'sweet potatoes'], ['peanutbutter', 'peanut butter']]) {
    const hits = Object.values(matchRecipes(RECIPES, { ingredients: [id] })).flat();
    assert.ok(hits.some(r => r.ingredients.includes(word)), `${id} found no recipe with "${word}"`);
  }
});

for (const [name, { input, expected }] of Object.entries(fixtures)) {
  test(`golden: ${name}`, () => assert.deepEqual(runNew(input), expected));
}

test('never spends more than the budget', () => {
  for (const c of cases) {
    const r = buildCart(c, resolvePrices(c.region));
    const total = r.cart.reduce((s, i) => s + i.subtotal, 0);
    assert.ok(total <= c.budget + 0.01, `${total} > ${c.budget}`);
    assert.ok(r.remaining >= 0);
  }
});

test('dietary exclusions are always respected', () => {
  for (const c of cases.filter(c => c.avoid.length)) {
    const r = buildCart(c, resolvePrices(c.region));
    for (const item of r.cart) assert.ok(!item.avoid.some(a => c.avoid.includes(a)), `${item.id} in ${c.avoid}`);
    const bySlot = matchRecipes(RECIPES, { ingredients: r.cart.map(i => i.id), cuisine: c.cuisine, avoid: c.avoid });
    for (const recipe of Object.values(bySlot).flat())
      assert.ok(!(recipe.avoid || []).some(a => c.avoid.includes(a)), `${recipe.title}`);
  }
});

test('staples already at home are not bought', () => {
  for (const c of cases.filter(c => c.have.length)) {
    const r = buildCart(c, resolvePrices(c.region));
    for (const item of r.cart) assert.ok(!(item.hasProp && c.have.includes(item.hasProp)), item.id);
  }
});

test('no meal repeats within a week when the recipe pool is big enough', () => {
  // Known, preserved behavior: a tiny budget + narrow cuisine shrinks the pool and
  // meals then cycle. With 14+ candidates (7 days x 2 options) there must be no repeats.
  let checked = 0;
  for (const c of cases) {
    const r = buildCart(c, resolvePrices(c.region));
    const bySlot = matchRecipes(RECIPES, { ingredients: r.cart.map(i => i.id), cuisine: c.cuisine, avoid: c.avoid });
    const weeks = planWeeks(bySlot, c);
    for (const slot of ['breakfast', 'lunch', 'dinner']) {
      if ((bySlot[slot] || []).length < 14) continue;
      for (const w of weeks) {
        const ids = w.filter(d => !d.leftover).flatMap(d => d[slot].map(x => x.id));
        assert.equal(new Set(ids).size, ids.length, `${slot} ${JSON.stringify(c)}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 100, `only ${checked} weeks checked`);
});

test('plan covers exactly the requested days', () => {
  for (const c of cases) {
    const r = buildCart(c, resolvePrices(c.region));
    const weeks = planWeeks(matchRecipes(RECIPES, { ingredients: r.cart.map(i => i.id), cuisine: c.cuisine, avoid: c.avoid }), c);
    assert.equal(weeks.flat().length, c.days);
  }
});

test('engine is deterministic', () => {
  for (const c of cases.slice(0, 40)) assert.deepEqual(runNew(c), runNew(c));
});

test('shopping list keeps every cart item, grouped by category', () => {
  const c = cases.find(c => c.budget === 120 && c.days === 14);
  const r = buildCart(c, resolvePrices(c.region));
  const groups = groupShoppingList(r.cart);
  assert.equal(groups.flatMap(g => g.items).length, r.cart.length);
  for (const g of groups) assert.ok(g.items.every(i => i.cat === g.cat));
});

test('local prices override regional fallbacks (the city price seam)', () => {
  const base = resolvePrices('south');
  const local = resolvePrices('south', { rice: 1.11, eggs: 0, bogus: null });
  assert.equal(local.rice, 1.11);
  assert.equal(local.eggs, base.eggs, 'zero/empty overrides are ignored');
  assert.equal(FOOD_DB.length, 58);
});

test('zip lookup', () => {
  assert.deepEqual(zipToInfo('78702'), { state: 'TX', region: 'south' });
  assert.equal(zipToInfo('00'), null);
});
