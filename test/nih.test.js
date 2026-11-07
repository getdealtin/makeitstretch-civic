// NHLBI main dishes (data/nih-recipes.json): printed amounts drive the list, every food they need is
// bought, the kitchen basics are tagged, diets are respected, and every price says where it came from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planMeals, resolvePrices, indexRecipes, recipeAllowed, FOOD_DB, NUTRITION } from '../engine/index.js';
import { EXTRA_FOODS, PRICE_SOURCES } from '../engine/extra-foods.js';
import { BLS_ITEMS } from '../server/prices.js';

const nih = JSON.parse(readFileSync(new URL('../data/nih-recipes.json', import.meta.url), 'utf8')).recipes;
const seed = indexRecipes(JSON.parse(readFileSync(new URL('../data/seed-recipes.json', import.meta.url), 'utf8')));
const all = [...seed, ...nih];
const prices = resolvePrices('south');
const byKey = Object.fromEntries(nih.map(r => [r.key, r]));
const run = (c, recipes = all) => planMeals({ leftover: 'no', cuisine: [], avoid: [], have: [], ...c }, prices, recipes);

test('25 main dishes, ids 1001+, each line a bought food, a kitchen basic, salt/water or a heading', () => {
  assert.equal(nih.length, 25);
  nih.forEach((r, i) => {
    assert.equal(r.id, 1001 + i);
    assert.ok(r.steps.length >= 3 && r.srv > 0 && r.note, r.title);
    for (const l of r.lines) assert.ok(l.t && [l.f, l.p, l.h].filter(Boolean).length <= 1, `${r.title}: ${l.t}`);
    const fromLines = new Set(r.lines.flatMap(l => l.f || []));
    assert.deepEqual(new Set(r.uses.map(u => u.id)), fromLines, r.title);
  });
});

test('every new food has USDA nutrition and a documented price', () => {
  for (const f of EXTRA_FOODS) {
    assert.ok(NUTRITION[f.id]?.fdc > 0, f.id);
    assert.ok(prices[f.id] > 0, f.id);
    assert.ok(['live', 'estimate', 'store'].includes(PRICE_SOURCES[f.id].kind) && PRICE_SOURCES[f.id].source.length > 30, f.id);
    if (PRICE_SOURCES[f.id].kind === 'live') assert.ok(BLS_ITEMS[f.id], `${f.id} is live but has no BLS series`);
  }
  for (const id of Object.keys(BLS_ITEMS)) assert.ok(FOOD_DB.some(f => f.id === id), id);
});

test('the list buys what the printed amounts need', () => {
  // Breakfasts from the seed recipes; four NHLBI dishes are the only lunches and dinners.
  const r = run({ budget: 200, days: 7, people: 2 }, [...seed.filter(x => x.slot === 'breakfast'), byKey.pupusas, byKey.pozole, byKey.chickenstew, byKey.stirfriedbeef]);
  assert.ok(r.state.assigned.some(x => x.rec.id === byKey.pupusas.id), 'pupusas planned');
  const masa = r.cart.find(i => i.id === 'masaharina');
  // 570 g of masa per 12 servings; a 2 lb bag is 907 g.
  const need = 570 / 12 * r.state.assigned.filter(x => x.rec.id === byKey.pupusas.id).reduce((a, x) => a + x.servings, 0);
  assert.equal(masa.qty, Math.ceil(need / 907 - 1e-9));
});

test('every food an NHLBI dish uses is on the list (or at home)', () => {
  for (const c of [{ budget: 75, days: 7, people: 2, cuisine: ['latin'] }, { budget: 150, days: 7, people: 4, cuisine: ['southern'] }, { budget: 300, days: 14, people: 3 }]) {
    const r = run(c);
    const on = new Set([...r.cart.map(i => i.id), ...r.have]);
    for (const x of r.state.assigned) for (const u of x.rec.uses) assert.ok(on.has(u.id), `${x.rec.recipe.title} needs ${u.id}`);
    assert.ok(r.spent <= c.budget);
    assert.ok(r.state.assigned.some(x => x.rec.id > 1000), `no NHLBI dish in ${JSON.stringify(c)}`);
  }
});

test('diets and foods to leave out apply to NHLBI dishes', () => {
  assert.equal(recipeAllowed(byKey.pupusas, ['kosher']), false, 'chicken with cheese');
  assert.equal(recipeAllowed(byKey.porkchops, ['halal']), false);
  assert.equal(recipeAllowed(byKey.jambalaya, ['low_sodium']), false, 'bouillon, kielbasa');
  assert.equal(recipeAllowed(byKey.bbqchicken, ['fish']), false, 'Worcestershire sauce');
  assert.equal(recipeAllowed(byKey.pastelon, ['meat']), false);
  assert.equal(recipeAllowed(byKey.ovenfriedchicken, ['gluten']), false, 'corn flakes have malt');
  assert.equal(recipeAllowed(byKey.lentilsoup, ['meat', 'dairy', 'gluten', 'kosher', 'halal']), true);
  const r = run({ budget: 120, days: 7, people: 2, avoid: ['meat'] });
  for (const x of r.state.assigned) assert.ok(!x.rec.uses.some(u => FOOD_DB.find(f => f.id === u.id).avoid.includes('meat')), x.rec.recipe.title);
});

test('the older cart builder never buys recipe-only foods', async () => {
  const { buildCart } = await import('../engine/index.js');
  const c = buildCart({ budget: 200, days: 14, people: 4, cuisine: [], avoid: [], have: [], stores: [] }, prices);
  assert.ok(!c.cart.some(i => i.recipeOnly));
});
