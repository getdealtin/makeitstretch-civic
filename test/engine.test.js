// Engine basics: the food list, USDA nutrition and satiety, prices, and ZIP lookup.
// The planner itself (meals, budgets, government guidance, fullness) is tested in test/meals.test.js,
// the NHLBI recipes in test/nih.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePrices, applyStoreAdjustments, zipToInfo, FOOD_DB, NUTRITION, SATIETY, FLOOR_KCAL } from '../engine/index.js';

test('every food has USDA nutrition and a satiety weight from it', () => {
  assert.equal(FOOD_DB.length, 83); // 58 core foods + 25 the NHLBI recipes need
  for (const f of FOOD_DB) {
    assert.ok(NUTRITION[f.id]?.fdc > 0, `${f.id} has no FoodData Central id`);
    assert.equal(f.cal, NUTRITION[f.id].kcal, f.id);
    assert.ok(f.g > 0, `${f.id} edible grams per package`);
    assert.equal(f.sat, SATIETY[f.id], f.id);
    assert.ok(f.sat >= 0.5 && f.sat <= 1.4, f.id);
  }
});

test('satiety: beans, oats and vegetables are more filling per calorie than oil and flour', () => {
  for (const [more, less] of [['drybeans', 'oil'], ['oats', 'flour'], ['potatoes', 'bread'], ['eggs', 'butter']])
    assert.ok(SATIETY[more] > SATIETY[less], `${more} ${SATIETY[more]} vs ${less} ${SATIETY[less]}`);
});

test('the calorie floor is USDA’s 2,000-calorie reference', () => assert.equal(FLOOR_KCAL, 2000));

test('local prices override regional estimates (the city price seam)', () => {
  const base = resolvePrices('south');
  const local = resolvePrices('south', { rice: 1.11, eggs: 0, bogus: null });
  assert.equal(local.rice, 1.11);
  assert.equal(local.eggs, base.eggs, 'zero/empty overrides are ignored');
  assert.deepEqual(resolvePrices('nowhere'), resolvePrices('national'), 'unknown region → national');
  for (const f of FOOD_DB) assert.ok(base[f.id] > 0, `${f.id} has a price`);
});

test('store types adjust prices (corner stores cost more, dollar stores less)', () => {
  const p = resolvePrices('south');
  assert.ok(applyStoreAdjustments(p, ['corner']).eggs > p.eggs);
  assert.ok(applyStoreAdjustments(p, ['dollar']).rice < p.rice);
  assert.deepEqual(applyStoreAdjustments(p, []), p);
});

test('zip lookup', () => {
  assert.deepEqual(zipToInfo('78702'), { state: 'TX', region: 'south' });
  assert.equal(zipToInfo('00'), null);
});
