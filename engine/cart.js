// Cart optimizer: the deterministic Thrifty Food Plan engine.
//
// A faithful port of runCalculation() from the live tool (index.html L2694–2839),
// lifted out of the DOM. Same inputs → same cart, bit for bit; that is enforced
// by test/engine.test.js against the frozen reference in test/legacy/.
//
// Four phases:
//   1. Survival floor   rice, beans, oil, oats (≤40% of budget)
//   2. Cuisine boost    culturally coherent flavor base (≤10% of budget)
//   3. Category fill    USDA Thrifty Food Plan category weights
//   4. Scale-up         spend what's left on staples, best calories-per-dollar first
//
// Known, preserved behavior: ranking is calories-per-dollar, so calorie totals
// run high. The satiety upgrade (spec §12, Option A) is a deliberate later change.

import { FOOD_DB, FALLBACK_PRICES } from './food-db.js';

export const USDA_WEIGHTS = {
  grain: 0.20, protein: 0.23, vegetable: 0.14, fruit: 0.10,
  dairy: 0.16, fat: 0.07, pantry: 0.10,
};

export const CUISINE_BOOSTS = {
  american:      ['eggs', 'bread', 'potatoes', 'butter', 'milk'],
  latin:         ['tortillas', 'onions', 'garlic', 'cannedtomatoes', 'salsa'],
  asian:         ['soy', 'garlic', 'onions', 'cabbage', 'rice'],
  southern:      ['cornmeal', 'sweetpotatoes', 'onions', 'garlic', 'cannedtomatoes'],
  mediterranean: ['oliveoil', 'lentils', 'onions', 'garlic', 'cannedtomatoes'],
  any:           ['onions', 'garlic', 'cannedtomatoes'],
};

export const FLOOR_IDS = ['rice', 'drybeans', 'oil', 'oats'];

// Store-type price adjustments (corner stores cost more, dollar stores less).
const CORNER_ADJ = { bread: 1.2, eggs: 1.3, milk: 1.25, bananas: 1.15 };
const DOLLAR_ADJ = { rice: 0.9, bread: 0.85, pasta: 0.8, cannedtomatoes: 0.9 };

/** Base prices for a region, with live/local prices layered on top. */
export function resolvePrices(region, overrides = {}) {
  const base = FALLBACK_PRICES[region] || FALLBACK_PRICES.national;
  const clean = Object.fromEntries(
    Object.entries(overrides || {}).filter(([, v]) => v && v > 0)
  );
  return { ...base, ...clean };
}

/** Apply store-type multipliers. Returns a new object. */
export function applyStoreAdjustments(prices, stores = []) {
  const out = { ...prices };
  if (stores.includes('corner')) {
    for (const k of Object.keys(CORNER_ADJ)) if (out[k]) out[k] = +(out[k] * CORNER_ADJ[k]).toFixed(2);
  }
  if (stores.includes('dollar')) {
    for (const k of Object.keys(DOLLAR_ADJ)) if (out[k]) out[k] = +(out[k] * DOLLAR_ADJ[k]).toFixed(2);
  }
  return out;
}

/**
 * Build the grocery cart.
 *
 * @param {object} input
 * @param {number}   input.budget   dollars available
 * @param {number}   input.days     days the food must last
 * @param {number}   input.people   household size
 * @param {string[]} [input.cuisine] e.g. ['latin']; empty = mixed
 * @param {string[]} [input.avoid]   dietary exclusions (gluten, dairy, meat, eggs, peanuts, fish)
 * @param {string[]} [input.have]    staples already at home (rice, beans, oats, …)
 * @param {string[]} [input.stores]  store types (corner, dollar, …)
 * @param {object} prices  food id → price. Pass resolvePrices(region, live) — this is
 *                         the seam where a city injects its local price index.
 */
export function buildCart(input, prices) {
  const budget = input.budget;
  const days = input.days;
  const people = input.people;
  const cuisine = input.cuisine || [];
  const avoidItems = input.avoid || [];
  const haveItems = input.have || [];
  const p = applyStoreAdjustments(prices, input.stores || []);

  const foods = FOOD_DB.filter(f => {
    if (!p[f.id]) return false;
    if (f.avoid.some(a => avoidItems.includes(a))) return false;
    if (f.hasProp && haveItems.includes(f.hasProp)) return false;
    return true;
  }).map(f => ({ ...f, price: p[f.id] || 0, cpd: p[f.id] ? Math.round(f.cal / p[f.id]) : 0 }));

  const cart = [];
  let totalCals = 0;
  let remaining = budget;

  const addToCart = (food) => {
    if (!food || food.price <= 0) return false;
    if (remaining < food.price) return false;
    const existing = cart.find(c => c.id === food.id);
    if (existing) {
      existing.qty++;
      existing.subtotal = +(existing.price * existing.qty).toFixed(2);
    } else {
      cart.push({ ...food, qty: 1, subtotal: +food.price.toFixed(2) });
    }
    remaining = +(remaining - food.price).toFixed(2);
    totalCals += food.cal;
    return true;
  };
  const getFood = (id) => foods.find(f => f.id === id);

  // Phase 1: survival floor (≤40% of budget)
  const floorBudget = budget * 0.40;
  let floorSpent = 0;
  for (const id of FLOOR_IDS) {
    const f = getFood(id);
    if (f && floorSpent + f.price <= floorBudget) {
      if (addToCart(f)) floorSpent += f.price;
    }
  }

  // Phase 2: cuisine boost (≤10% of budget)
  if (remaining > 0.50) {
    const boostBudget = budget * 0.10;
    let boostSpent = 0;
    const boostSet = new Set();
    const selected = cuisine.length > 0 ? cuisine : ['any'];
    selected.forEach(c => (CUISINE_BOOSTS[c] || CUISINE_BOOSTS.any).forEach(id => boostSet.add(id)));
    for (const id of boostSet) {
      const f = getFood(id);
      if (f && !cart.find(c => c.id === id) && boostSpent + f.price <= boostBudget) {
        if (addToCart(f)) boostSpent += f.price;
      }
    }
  }

  // Phase 3: USDA-weighted category fill
  if (remaining > 0.50) {
    const fillBase = remaining;
    const categoryBudgets = {};
    for (const [cat, w] of Object.entries(USDA_WEIGHTS)) categoryBudgets[cat] = +(fillBase * w).toFixed(2);
    const catSpent = {};
    const sorted = [...foods].sort((a, b) => a.tier - b.tier || b.cpd - a.cpd);
    for (const f of sorted) {
      if (cart.find(c => c.id === f.id)) continue;
      const limit = categoryBudgets[f.cat] || 0;
      const spent = catSpent[f.cat] || 0;
      if (spent + f.price <= limit && remaining >= f.price) {
        if (addToCart(f)) catSpent[f.cat] = (catSpent[f.cat] || 0) + f.price;
      }
    }
  }

  // Phase 4: scale up staples with what's left
  const daysMultiplier = Math.max(1, Math.floor(days / 7));
  let iter = 0;
  while (remaining >= 0.50 && iter < 200) {
    iter++;
    const scalables = cart.filter(c => c.tier === 1).sort((a, b) => b.cpd - a.cpd);
    const tier2 = cart.filter(c => c.tier === 2).sort((a, b) => b.cpd - a.cpd);
    let bought = false;
    for (const item of [...scalables, ...tier2]) {
      const maxQty = item.tier === 1 ? Math.max(8, daysMultiplier * 4) : Math.max(4, daysMultiplier * 2);
      if (item.qty < maxQty && remaining >= item.price) {
        item.qty++;
        item.subtotal = +(item.price * item.qty).toFixed(2);
        remaining = +(remaining - item.price).toFixed(2);
        totalCals += item.cal;
        bought = true;
        break;
      }
    }
    if (!bought) break;
  }

  return { cart, remaining, totalCals, ...summarize(input, remaining, totalCals) };
}

/** The headline numbers shown on the results card. */
export function summarize({ budget, days, people }, remaining, totalCals) {
  const spent = +(budget - remaining).toFixed(2);
  const pppd = +(spent / days / people).toFixed(2);
  const ppmeal = +(pppd / 3).toFixed(2);
  const cppd = Math.round(totalCals / people / days);
  const calPct = Math.round((cppd / 2000) * 100);
  return { spent, pppd, ppmeal, cppd, calPct };
}
