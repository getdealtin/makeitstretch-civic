// The shared engine every city plugs into. No DOM, no network, no city specifics.
export { FOOD_DB, FALLBACK_PRICES, ALL_TIPS } from './food-db.js';
export { ZIP_MAP, zipToInfo } from './zip-map.js';
export { resolvePrices, applyStoreAdjustments, FLOOR_KCAL } from './pricing.js';
export { indexRecipes } from './recipes.js';
import { planMeals as plan } from './meals.js';
import { checkPrinciples } from './principles.js';
export { rebuildList, MENU_SIZE, LIGHT, VARIETY_KCAL_GIVE } from './meals.js';
export { PRINCIPLES, checkPrinciples } from './principles.js';

/** Plan meals and the list (engine/meals.js), checked against the engine's principles (engine/principles.js). */
export function planMeals(input, prices, recipes) {
  const r = plan(input, prices, recipes);
  return { ...r, principles: checkPrinciples(r) };
}
export { LEAVE_OUT, DIETS, DIET_NOTE_KEYS, foodAllowed, recipeAllowed } from './diets.js';
export { groupShoppingList, CATEGORY_ORDER, TIER_KEYS } from './shopping.js';
export { NUTRITION } from './nutrition.js';
export { twistsFor, TWIST_REPEATS, TWIST_IDS, TWISTS } from './twists.js';
export { SATIETY, satietyOf } from './satiety.js';
export { matchBox, BOX_GROUPS, INGREDIENT_FOODS, PANTRY_BASICS, foodLabel, BOX_SYNONYMS, findBoxFood, cleanFoodWord } from './box.js';

// Benchmarks used in city reports (spec §8). Update when USDA publishes new figures.
//   Thrifty Food Plan: USDA FNA "Official USDA Thrifty Food Plan: U.S. Average, September 2026"
//     (issued Oct 2026): reference family of four $236.30 a week → $8.44 per person per day.
//   SNAP: average benefit about $189 per person per month in FY2025 → about $6.22 per person per day.
export const BENCHMARKS = { tfpPerPersonDay: 8.44, snapPerPersonDay: 6.22, tfpAsOf: 'September 2026', tfpDate: '2026-10-15', snapAsOf: 'FY2025', snapDate: '2025-09-30' };
