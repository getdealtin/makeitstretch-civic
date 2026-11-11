// The engine's principles (engine/principles.js), checked over a grid of budgets, household sizes,
// lengths, diets, cuisines and foods on hand, with every recipe the site uses. Owner request (Nov 11
// 2026): "We must have principles that are always checked when people use this engine."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planMeals, resolvePrices, indexRecipes, PRINCIPLES, FOOD_DB } from '../engine/index.js';

const read = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const recipes = [...indexRecipes(read('seed-recipes.json')), ...read('nih-recipes.json').recipes.map(({ es, key, ...r }) => r), ...read('simple-meals.json').recipes];
const prices = resolvePrices('south');
const run = c => planMeals({ leftover: 'sometimes', cuisine: [], avoid: [], have: [], ...c }, prices, recipes);
const tag = c => JSON.stringify(c);

// The owner's grid (Nov 11): $10 steps for 2 people, $20 steps for 5 people, a week each.
const OWNER = [...[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(budget => ({ budget, days: 7, people: 2 })),
  ...[20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map(budget => ({ budget, days: 7, people: 5 }))];
const MORE = [
  { budget: 15, days: 7, people: 1 }, { budget: 45, days: 7, people: 1 }, { budget: 75, days: 7, people: 3 }, { budget: 30, days: 3, people: 4 },
  { budget: 250, days: 14, people: 4 }, { budget: 90, days: 14, people: 2 }, { budget: 400, days: 30, people: 3 },
  { budget: 50, days: 7, people: 2, avoid: ['gluten'] }, { budget: 50, days: 7, people: 2, avoid: ['eggs', 'dairy'] },
  { budget: 70, days: 7, people: 3, avoid: ['meat', 'fish'] }, { budget: 60, days: 7, people: 2, avoid: ['halal'] },
  { budget: 60, days: 7, people: 2, avoid: ['peanuts'] }, { budget: 60, days: 7, people: 2, avoid: ['low_sodium'] },
  { budget: 40, days: 7, people: 2, cuisine: ['latin'] }, { budget: 40, days: 7, people: 2, cuisine: ['asian'] },
  { budget: 80, days: 7, people: 4, cuisine: ['southern', 'mediterranean'] }, { budget: 30, days: 7, people: 2, have: ['rice', 'oil', 'beans'] },
  { budget: 60, days: 7, people: 2, leftover: 'no' }, { budget: 60, days: 7, people: 2, leftover: 'yes' }, { budget: 60, days: 7, people: 2, menu: 'short' },
];

test('every principle has words for the build spec', () => {
  assert.ok(PRINCIPLES.length >= 10);
  for (const p of PRINCIPLES) assert.ok(p.id && p.text.length > 30, p.id);
});

test('every plan in the grid keeps every principle', () => {
  for (const c of [...OWNER, ...MORE]) {
    const r = run(c);
    assert.deepEqual(r.principles.failed, [], tag(c));
  }
});

test('something for every budget: from $10 for two, a plan with real meals', () => {
  for (const c of OWNER) {
    const r = run(c);
    assert.ok(r.state && r.coveredDays >= 1, tag(c));
  }
});

test('variety: from $20 for two, every meal slot has at least two different meals', () => {
  for (const c of OWNER.filter(c => c.budget >= 20 && c.people === 2)) {
    const r = run(c);
    for (const sl of ['breakfast', 'lunch', 'dinner']) {
      const n = new Set(r.state.assigned.filter(x => x.slot === sl).map(x => x.rec.id)).size;
      assert.ok(n >= 2, `${sl}: ${n} meal(s), ${tag(c)}`);
    }
  }
});

test('calories first: more money never means fewer calories or fewer days', () => {
  for (const people of [2, 5]) {
    const steps = OWNER.filter(c => c.people === people).map(run);
    for (let i = 1; i < steps.length; i++) {
      assert.ok(steps[i].coveredDays >= steps[i - 1].coveredDays, `days at step ${i}, ${people} people`);
      assert.ok(steps[i].totalCals >= steps[i - 1].totalCals * 0.97, `calories at step ${i}, ${people} people: ${steps[i - 1].totalCals} → ${steps[i].totalCals}`);
    }
  }
});

test('fullness next: with the calories met, more money buys more filling food', () => {
  const F = Object.fromEntries(FOOD_DB.map(f => [f.id, f]));
  const sat = r => { let k = 0, s = 0; for (const i of r.cart) { const kc = (F[i.id].cal / F[i.id].srv) * i.servings; k += kc; s += kc * F[i.id].sat; } return s / k; };
  assert.ok(sat(run({ budget: 120, days: 7, people: 2 })) >= sat(run({ budget: 50, days: 7, people: 2 })));
});

test('same answers, same plan', () => {
  for (const c of [OWNER[1], OWNER[13], MORE[8]]) {
    const ids = r => r.state.assigned.map(x => x.rec.id).join();
    assert.equal(ids(run(c)), ids(run(c)), tag(c));
  }
});
