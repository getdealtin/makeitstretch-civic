// The shared engine every city plugs into. No DOM, no network, no city specifics.
export { FOOD_DB, FALLBACK_PRICES, ALL_TIPS } from './food-db.js';
export { ZIP_MAP, zipToInfo } from './zip-map.js';
export { buildCart, resolvePrices, applyStoreAdjustments, summarize, USDA_WEIGHTS, CUISINE_BOOSTS, FLOOR_IDS } from './cart.js';
export { indexRecipes, matchRecipes } from './recipes.js';
export { planWeeks, SLOTS } from './plan.js';
export { groupShoppingList, CATEGORY_ORDER, TIER_KEYS } from './shopping.js';
export { NUTRITION } from './nutrition.js';
export { SATIETY, satietyOf } from './satiety.js';
export { matchBox, BOX_GROUPS, INGREDIENT_FOODS, PANTRY_BASICS, foodLabel, BOX_SYNONYMS, findBoxFood, cleanFoodWord } from './box.js';

// Benchmarks used in city reports (spec §8). Update when USDA publishes new figures.
//   Thrifty Food Plan: USDA FNA "Official USDA Thrifty Food Plan: U.S. Average, September 2026"
//     (issued Oct 2026): reference family of four $236.30 a week → $8.44 per person per day.
//   SNAP: average benefit about $189 per person per month in FY2025 → about $6.22 per person per day.
export const BENCHMARKS = { tfpPerPersonDay: 8.44, snapPerPersonDay: 6.22, tfpAsOf: 'September 2026', tfpDate: '2026-10-15', snapAsOf: 'FY2025', snapDate: '2025-09-30' };
