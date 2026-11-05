// The shared engine every city plugs into. No DOM, no network, no city specifics.
export { FOOD_DB, FALLBACK_PRICES, ALL_TIPS } from './food-db.js';
export { ZIP_MAP, zipToInfo } from './zip-map.js';
export { buildCart, resolvePrices, applyStoreAdjustments, summarize, USDA_WEIGHTS, CUISINE_BOOSTS, FLOOR_IDS } from './cart.js';
export { indexRecipes, matchRecipes } from './recipes.js';
export { planWeeks, SLOTS } from './plan.js';
export { groupShoppingList, CATEGORY_ORDER, TIER_KEYS } from './shopping.js';
export { matchBox, BOX_GROUPS, INGREDIENT_FOODS, PANTRY_BASICS, foodLabel, BOX_SYNONYMS, findBoxFood, cleanFoodWord } from './box.js';

// Benchmarks used in the plan summary and city reports (spec §8).
export const BENCHMARKS = { tfpPerPersonDay: 5.36, snapPerPersonDay: 6.22 };
