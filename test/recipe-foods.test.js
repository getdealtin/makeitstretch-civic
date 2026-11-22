// The original 161 recipes with their real ingredients (owner decision, Nov 19 2026): every dish keeps its name;
// main ingredients are priced foods (engine/recipe-foods.js), small seasonings are extras ("You'll also need").
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import app from '../server.js';
import { FOOD_DB, NUTRITION, planMeals, resolvePrices, indexRecipes, INGREDIENT_FOODS, PANTRY_BASICS } from '../engine/index.js';
import { RECIPE_FOODS, RECIPE_PRICE_SOURCES, RECIPE_PRICES } from '../engine/recipe-foods.js';
import { foodAllowed, recipeAllowed } from '../engine/diets.js';

const seed = indexRecipes(JSON.parse(readFileSync(new URL('../data/seed-recipes.json', import.meta.url), 'utf8')));
const byTitle = t => seed.find(r => r.title === t);
const food = id => FOOD_DB.find(f => f.id === id);
let server, base;
before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => server.close());

test('every new food has USDA nutrition, a price and where the price comes from', () => {
  assert.equal(RECIPE_FOODS.length, 12); // + frozen burritos and pickled jalapeños for community recipes (Nov 22 2026)
  for (const f of RECIPE_FOODS) {
    assert.ok(NUTRITION[f.id]?.fdc > 0, f.id);
    assert.ok(RECIPE_PRICES[f.id] > 0 && RECIPE_PRICES[f.id] < 15, f.id);
    assert.match(RECIPE_PRICE_SOURCES[f.id].source, /USDA ERS Purchase to Plate/, f.id);
    for (const r of ['northeast', 'midwest', 'south', 'west']) assert.ok(resolvePrices(r)[f.id] > 0, `${f.id} ${r}`);
  }
});

test('every dish keeps its name, and every ingredient word is something the list can buy', () => {
  assert.equal(seed.length, 161);
  for (const t of ['Fried Catfish and Grits', 'Dan Dan Noodles', 'Kimchi-Style Fried Rice', 'Miso Soup with Rice', 'Fattoush',
    'Caldo Tlalpeño', 'Biscuits and Gravy', 'Spanakopita Scramble', 'Palak Dal', 'Pisto', 'Masala Oats', 'Pancakes']) assert.ok(byTitle(t), t);
  for (const r of seed) for (const w of r.ingredients) {
    assert.ok(PANTRY_BASICS.has(w) || INGREDIENT_FOODS[w]?.length, `${r.title}: "${w}" isn't a food on the list`);
  }
  // Seasonings are never priced foods (they would be counted twice)
  for (const r of seed) for (const w of r.extras || []) assert.ok(!INGREDIENT_FOODS[w], `${r.title}: extra "${w}" is a priced food`);
});

test('the real ingredients are there', () => {
  assert.ok(byTitle('Fried Catfish and Grits').ingredients.includes('catfish'));
  assert.ok(!byTitle('Fried Catfish and Grits').ingredients.includes('tuna'));
  assert.ok(byTitle('Kimchi-Style Fried Rice').ingredients.includes('kimchi'));
  assert.ok(byTitle('Palak Dal').ingredients.includes('spinach'));
  assert.ok(byTitle('Fried Plantain and Egg').ingredients.includes('plantains'));
  assert.ok(byTitle('Biscuits and Gravy').ingredients.includes('biscuits')); // store-bought shortcut
  assert.deepEqual(byTitle('Dan Dan Noodles').extras, ['chili oil', 'Sichuan peppercorns']);
  assert.ok(byTitle('Miso Soup with Rice').extras.includes('miso'));
  assert.ok(byTitle('Pancakes').extras.includes('baking powder'));
});

test('diets: catfish is not kosher, kimchi has fish, salty seasonings leave out low-sodium dishes', () => {
  assert.equal(foodAllowed(food('catfish'), ['kosher']), false);
  assert.equal(foodAllowed(food('catfish'), ['halal']), true);
  assert.equal(foodAllowed(food('kimchi'), ['fish']), false);
  assert.equal(foodAllowed(food('kimchi'), ['meat']), false); // most kimchi has fish sauce: not vegetarian
  assert.equal(foodAllowed(food('groundpork'), ['halal']), false);
  assert.equal(foodAllowed(food('feta'), ['low_sodium']), false);
  assert.equal(recipeAllowed(byTitle('Miso-Style Egg Soup'), ['low_sodium']), false); // miso is an extra
  assert.equal(recipeAllowed(byTitle('Caldo Tlalpeño'), ['low_sodium']), false); // chipotles in adobo
  assert.equal(recipeAllowed(byTitle('Bibimbap Style Bowl'), ['gluten']), false); // gochujang has wheat
});

test('gluten: soy sauce is brewed with wheat (owner decision Nov 19 2026), so gluten-free plans and boxes leave it out', () => {
  assert.equal(foodAllowed(food('soy'), ['gluten']), false);
  assert.match(food('soy').note, /tamari/);
  assert.equal(recipeAllowed(byTitle('Egg Fried Rice'), ['gluten']), false);
  const r = planMeals({ budget: 90, days: 7, people: 2, leftover: 'sometimes', cuisine: ['asian'], avoid: ['gluten'], have: [] }, resolvePrices('south'), seed);
  assert.ok(!r.cart.some(i => i.id === 'soy'));
  for (const w of r.weeks) for (const d of w) for (const sl of ['breakfast', 'lunch', 'dinner']) for (const m of d[sl] || []) assert.ok(!m.ingredients.includes('soy sauce'), m.title);
});

test('the tofu dishes can be planned now (tofu used to have no price, so they never appeared)', () => {
  const r = planMeals({ budget: 120, days: 7, people: 2, leftover: 'sometimes', cuisine: ['asian'], avoid: ['meat'], have: [] }, resolvePrices('west'), seed);
  assert.ok(r.cart.length > 0);
  assert.ok(INGREDIENT_FOODS.tofu.includes('tofu'));
});

test('the browser gets each recipe’s seasonings', async () => {
  const all = await (await fetch(`${base}/api/recipes`)).json();
  assert.deepEqual(all.find(r => r.title === 'Caldo Tlalpeño').extras, ['chipotle peppers in adobo']);
  assert.equal(all.find(r => r.title === 'Rice and Beans').extras, undefined);
});
