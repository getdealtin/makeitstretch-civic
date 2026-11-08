// Prices the planner works with, and the calorie floor every plan aims for.
//
// resolvePrices is the seam where a city's prices come in: the region's built-in estimates
// (engine/food-db.js, with each recipe food's documented source in engine/extra-foods.js), then live BLS
// prices and the city's own shelf prices on top (server.js → pricesFor).
//
// (Until Nov 8 2026 this file also held the original price-per-calorie cart builder. The meal-first
// planner in engine/meals.js replaced it; git history has the old version.)
import { FALLBACK_PRICES } from './food-db.js';

/**
 * Calories per person per day a plan aims for before anything else (USDA's 2,000-calorie reference).
 * The planner tops up with filling sides only until a household reaches it.
 */
export const FLOOR_KCAL = 2000;

// Store-type price adjustments: corner stores charge more for a few everyday foods, dollar stores less.
const CORNER_ADJ = { bread: 1.2, eggs: 1.3, milk: 1.25, bananas: 1.15 };
const DOLLAR_ADJ = { rice: 0.9, bread: 0.85, pasta: 0.8, cannedtomatoes: 0.9 };

/**
 * A region's package prices: built-in estimates, with live or local prices layered on top.
 * Zero, empty or missing overrides are ignored, so a bad value never wipes out a price.
 * @param {string} region  northeast | midwest | south | west | national
 * @param {object} [overrides]  food id → package price (live BLS, city shelf prices)
 */
export function resolvePrices(region, overrides = {}) {
  const base = FALLBACK_PRICES[region] || FALLBACK_PRICES.national;
  const clean = Object.fromEntries(Object.entries(overrides || {}).filter(([, v]) => v && v > 0));
  return { ...base, ...clean };
}

/** Prices after the store types someone shops at (corner, dollar). Returns a new object. */
export function applyStoreAdjustments(prices, stores = []) {
  const out = { ...prices };
  const apply = adj => { for (const k of Object.keys(adj)) if (out[k]) out[k] = +(out[k] * adj[k]).toFixed(2); };
  if (stores.includes('corner')) apply(CORNER_ADJ);
  if (stores.includes('dollar')) apply(DOLLAR_ADJ);
  return out;
}
