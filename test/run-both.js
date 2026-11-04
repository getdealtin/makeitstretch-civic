// Runs one input through the new engine and the frozen legacy reference.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { buildCart, resolvePrices, indexRecipes, matchRecipes, planWeeks } from '../engine/index.js';

const require = createRequire(import.meta.url);
const legacy = require('./legacy/reference.cjs');
const seed = JSON.parse(readFileSync(new URL('../data/seed-recipes.json', import.meta.url), 'utf8'));
export const RECIPES = indexRecipes(seed);

const cartShape = c => c.map(i => [i.id, i.qty, i.subtotal]);
const planShape = weeks => weeks.map(w => w.map(d => d.leftover ? [d.dayName, 'leftover']
  : [d.dayName, ...['breakfast', 'lunch', 'dinner'].map(s => d[s].map(r => r.id))]));

export function runNew(c) {
  const r = buildCart(c, resolvePrices(c.region));
  const bySlot = matchRecipes(RECIPES, { ingredients: r.cart.map(i => i.id), cuisine: c.cuisine, avoid: c.avoid });
  const weeks = planWeeks(bySlot, { days: c.days, leftover: c.leftover });
  return { cart: cartShape(r.cart), remaining: r.remaining, totalCals: r.totalCals, plan: planShape(weeks) };
}

export function runLegacy(c) {
  const answers = { budget: c.budget, days: c.days, people: c.people, cuisine: [...c.cuisine],
    stores: [...c.stores], avoid: [...c.avoid], have: [...c.have], leftover: c.leftover };
  const prices = legacy.FALLBACK_PRICES[c.region] || legacy.FALLBACK_PRICES.national;
  const r = legacy.legacyCart(answers, prices);
  const m = legacy.legacyMatch(RECIPES, { ingredients: r.cart.map(i => i.id).join(','),
    cuisine: c.cuisine.join(','), avoid: c.avoid.join(',') });
  const weeks = legacy.legacyPlan(m.bySlot, answers);
  return { cart: cartShape(r.cart), remaining: r.remaining, totalCals: r.totalCals, plan: planShape(weeks) };
}
