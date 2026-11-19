// Variety across plans (owner decision, Nov 19 2026): a plan never changes once made (its draw is in its link),
// and a new plan draws among meals that are equally good for the budget (within PRICE_MARGIN). Nothing about the
// person decides the draw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planMeals, resolvePrices, indexRecipes } from '../engine/index.js';
import { checkPrinciples } from '../engine/principles.js';
import { PRICE_MARGIN, drawOrder } from '../engine/meals.js';

const read = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const recipes = [...indexRecipes(read('seed-recipes.json')), ...read('nih-recipes.json').recipes.map(({ es, key, ...r }) => r), ...read('simple-meals.json').recipes];
const prices = resolvePrices('south');
const base = { budget: 90, days: 7, people: 3, leftover: 'sometimes', cuisine: [], avoid: [], have: [] };
const run = c => planMeals({ ...base, ...c }, prices, recipes);
const meals = r => r.weeks.flat().flatMap(d => ['breakfast', 'lunch', 'dinner'].map(s => d[s]?.[0]?.id)).filter(Boolean);

test('the margin comes from the price data (median estimate vs live BLS: 10.3%)', () => {
  assert.equal(PRICE_MARGIN, 0.10);
  assert.ok(drawOrder(1, 5) >= 0 && drawOrder(1, 5) < 1);
  assert.equal(drawOrder(7, 12), drawOrder(7, 12));
  assert.notEqual(drawOrder(7, 12), drawOrder(8, 12));
});

test('a plan never changes once made: the same draw gives the same plan', () => {
  for (const seed of [1, 99, 123456]) assert.deepEqual(meals(run({ seed })), meals(run({ seed })));
});

test('links from before (no draw) open exactly as they were made', () => {
  const a = run({}), b = run({ seed: undefined });
  assert.deepEqual(meals(a), meals(b));
  assert.deepEqual(a.cart.map(i => [i.id, i.qty]), b.cart.map(i => [i.id, i.qty]));
});

test('different draws give different meals, at about the same cost, with every principle kept', () => {
  const plans = Array.from({ length: 12 }, (_, i) => run({ seed: i + 1 }));
  const all = new Set(plans.flatMap(meals));
  assert.ok(all.size > new Set(meals(run({}))).size + 5, `only ${all.size} different meals across 12 draws`);
  const costs = plans.map(p => p.spent);
  assert.ok(Math.max(...costs) <= base.budget, 'within budget');
  for (const p of plans) assert.deepEqual(checkPrinciples(p).failed, [], JSON.stringify(checkPrinciples(p).failed));
});

test('a returning family: meals from the last saved plan go to the back of each tie', () => {
  const first = run({ seed: 5 });
  const next = run({ seed: 6, recent: [...new Set(meals(first))] });
  const repeat = run({ seed: 6 });
  const overlap = p => meals(p).filter(id => meals(first).includes(id)).length;
  assert.ok(overlap(next) <= overlap(repeat), `${overlap(next)} repeated with the last plan's meals moved back, ${overlap(repeat)} without`);
});

test('tight budgets: value first (the draw never costs days or calories the cheapest menu would cover)', () => {
  for (const c of [{ budget: 20, people: 2 }, { budget: 35, people: 4 }, { budget: 14, people: 1 }]) {
    const plain = run(c);
    for (const seed of [1, 2, 3, 4]) {
      const r = run({ ...c, seed });
      assert.ok(r.spent <= c.budget, JSON.stringify(c));
      assert.ok(r.state.coveredDays >= plain.state.coveredDays, `${JSON.stringify(c)} seed ${seed}: ${r.state.coveredDays} days vs ${plain.state.coveredDays}`);
      assert.deepEqual(checkPrinciples(r).failed, [], JSON.stringify(checkPrinciples(r).failed));
    }
  }
});
