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
// Satiety upgrade (spec §12, Option A, built Nov 2026):
//   • Foods are ranked by filling-calories per dollar (eff = calories per dollar × satiety),
//     not raw calories per dollar, so beans, oats, eggs and potatoes beat flour and oil.
//   • The scale-up spreads leftover money across the top filling staples (whoever has the
//     fewest so far gets the next one) instead of piling it on one item ("flour ×9").
//   • Calorie floor: while the plan is under FLOOR_KCAL per person per day, the scale-up buys
//     the most calories per dollar instead, so a tight budget never gets less food.

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

/** Calories per person per day the plan must reach before fullness is optimized. */
export const FLOOR_KCAL = 2000;
const SEASONINGS = new Set(['garlic', 'onions']);
const LEGUMES = new Set(['drybeans', 'blackbeans', 'kidneybean', 'chickpeas', 'lentils', 'splitpeas']);
/** How many top staples the scale-up spreads across. */
const SPREAD = 4;

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
  }).map(f => {
    const cpd = p[f.id] ? Math.round(f.cal / p[f.id]) : 0;
    return { ...f, price: p[f.id] || 0, cpd, eff: Math.round(cpd * (f.sat || 1)) };
  });

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
    const sorted = [...foods].sort((a, b) => a.tier - b.tier || b.eff - a.eff || a.id.localeCompare(b.id));
    // Optional cap on different items (input.maxItems): each food group gets its share of the
    // cap by USDA weight, so a shorter list stays balanced. Off unless a city turns it on.
    const groupCap = cat => (input.maxItems ? Math.max(1, Math.round(input.maxItems * (USDA_WEIGHTS[cat] || 0))) : Infinity);
    for (const f of sorted) {
      if (cart.find(c => c.id === f.id)) continue;
      // Garlic and onions are seasonings: they never use up a vegetable spot, so carrots or cabbage still fit.
      if (!SEASONINGS.has(f.id) && cart.filter(c => c.cat === f.cat && !SEASONINGS.has(c.id)).length >= groupCap(f.cat)) continue;
      // Under a cap, beans, lentils and peas take at most half the protein spots, so eggs, meat or fish fit too.
      if (input.maxItems && LEGUMES.has(f.id) && cart.filter(c => LEGUMES.has(c.id)).length >= Math.ceil(groupCap('protein') / 2)) continue;
      const limit = categoryBudgets[f.cat] || 0;
      const spent = catSpent[f.cat] || 0;
      if (spent + f.price <= limit && remaining >= f.price) {
        if (addToCart(f)) catSpent[f.cat] = (catSpent[f.cat] || 0) + f.price;
      }
    }
    // With a cap, a food group's money stays in that group: buy more of the foods it already has
    // (fewest bought first), so vegetables and protein don't lose out to cheap grains.
    if (input.maxItems) {
      for (const cat of Object.keys(USDA_WEIGHTS)) {
        if (cat === 'fat' || cat === 'pantry') continue;
        for (let guard = 0; guard < 100; guard++) {
          const pick = cart.filter(c => c.cat === cat && (catSpent[cat] || 0) + c.price <= categoryBudgets[cat] && remaining >= c.price)
            .sort((x, y) => x.qty - y.qty || y.eff - x.eff)[0];
          if (!pick || !addToCart(pick)) break;
          catSpent[cat] = (catSpent[cat] || 0) + pick.price;
        }
      }
    }
  }

  // Phase 4: scale up staples with what's left
  const daysMultiplier = Math.max(1, Math.floor(days / 7));
  let iter = 0;
  const maxQty = item => (item.tier === 1 ? Math.max(8, daysMultiplier * 4) : Math.max(4, daysMultiplier * 2));
  // Oils and pantry items never get extra units: cheap calories, but not a meal.
  const canBuy = item => item.cat !== 'fat' && item.cat !== 'pantry' && item.qty < maxQty(item) && remaining >= item.price;
  const buy = item => {
    item.qty++;
    item.subtotal = +(item.price * item.qty).toFixed(2);
    remaining = +(remaining - item.price).toFixed(2);
    totalCals += item.cal;
  };
  while (remaining >= 0.50 && iter < 400) {
    iter++;
    const byTier = key => [...cart.filter(c => c.tier === 1).sort((a, b) => b[key] - a[key] || a.id.localeCompare(b.id)),
                           ...cart.filter(c => c.tier === 2).sort((a, b) => b[key] - a[key] || a.id.localeCompare(b.id))];
    const underFloor = totalCals / people / days < FLOOR_KCAL;
    let pick;
    if (underFloor) {
      pick = byTier('cpd').find(canBuy);              // most calories per dollar first
    } else {
      const top = byTier('eff').filter(canBuy);
      const spread = top.filter(c => c.tier === 1).slice(0, SPREAD);
      // Fewest bought so far goes next; ties go to the more filling-per-dollar staple.
      pick = (spread.length ? spread : top).reduce((best, c) => (!best || c.qty < best.qty ? c : best), null);
    }
    if (!pick) break;
    buy(pick);
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
