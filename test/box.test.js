// Food-box mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indexRecipes, matchBox, BOX_GROUPS, INGREDIENT_FOODS, PANTRY_BASICS, FOOD_DB, foodLabel } from '../engine/index.js';

const RECIPES = indexRecipes(JSON.parse(readFileSync(new URL('../data/seed-recipes.json', import.meta.url), 'utf8')));
const ids = new Set(FOOD_DB.map(f => f.id));

test('every recipe ingredient is mapped or a pantry basic', () => {
  for (const r of RECIPES) for (const i of r.ingredients)
    assert.ok(i in INGREDIENT_FOODS || PANTRY_BASICS.has(i), `${r.title}: ${i}`);
});

test('the box picker only offers real foods that some recipe can use', () => {
  const usable = new Set(Object.values(INGREDIENT_FOODS).flat());
  for (const g of BOX_GROUPS) for (const id of g.items) {
    assert.ok(ids.has(id), id);
    assert.ok(usable.has(id), `${id} matches no recipe`);
  }
});

test('multi-word ingredients match (canned tomatoes, peanut butter)', () => {
  const m = matchBox(RECIPES, ['cannedtomatoes', 'peanutbutter'], { limit: 100 });
  assert.ok(m.some(x => x.uses.includes('canned tomatoes')));
  assert.ok(m.some(x => x.uses.includes('peanut butter')));
});

test('uses + missing exactly cover each recipe (pantry basics excluded)', () => {
  for (const m of matchBox(RECIPES, ['rice', 'drybeans', 'pasta', 'onions'], { limit: 100 })) {
    const needed = m.recipe.ingredients.filter(i => !PANTRY_BASICS.has(i));
    assert.deepEqual([...m.uses, ...m.missing].sort(), [...needed].sort());
    assert.ok(m.uses.length >= 1 && m.missing.length <= 3);
  }
});

test('dishes that use more of the box rank higher', () => {
  const m = matchBox(RECIPES, ['rice', 'drybeans', 'cannedtomatoes', 'onions']);
  const score = x => x.uses.length * 2 - x.missing.length;
  for (let i = 1; i < m.length; i++) assert.ok(score(m[i - 1]) >= score(m[i]));
  assert.ok(m[0].uses.length >= 3);
});

test('dietary exclusions are respected', () => {
  for (const m of matchBox(RECIPES, ['eggs', 'bread', 'milk', 'rice'], { avoid: ['eggs', 'dairy'], limit: 100 }))
    assert.ok(!(m.recipe.avoid || []).some(a => ['eggs', 'dairy'].includes(a)), m.recipe.title);
});

test('no near-duplicate titles', () => {
  const titles = matchBox(RECIPES, ['rice', 'soy', 'eggs', 'garlic'], { limit: 100 }).map(m => m.recipe.title.toLowerCase());
  for (const a of titles) for (const b of titles) if (a !== b) assert.ok(!b.startsWith(a), `${a} / ${b}`);
});

test('empty box → no matches; labels drop package sizes', () => {
  assert.deepEqual(matchBox(RECIPES, []), []);
  assert.equal(foodLabel('drybeans'), 'Dry Pinto Beans');
});
