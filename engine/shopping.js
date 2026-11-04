// Shopping list grouping: port of buildShoppingList() (index.html L3206) minus the HTML.

import { ALL_TIPS } from './food-db.js';

export const CATEGORY_ORDER = ['grain', 'protein', 'vegetable', 'fruit', 'dairy', 'fat', 'pantry'];
export const TIER_KEYS = { 1: 'essential', 2: 'stretch', 3: 'quality' };

const TIP_BY_FOOD = {};
for (const t of ALL_TIPS) for (const id of t.needs) if (!TIP_BY_FOOD[id]) TIP_BY_FOOD[id] = t.text;

/**
 * @returns {Array<{cat:string, items:Array<object & {tip:string|null}>}>}
 *   Categories in display order, items cheapest-first, each with its first matching tip.
 */
export function groupShoppingList(cart) {
  return CATEGORY_ORDER
    .map(cat => ({
      cat,
      items: cart.filter(i => i.cat === cat)
        .sort((a, b) => a.price - b.price)
        .map(i => ({ ...i, tip: TIP_BY_FOOD[i.id] || null })),
    }))
    .filter(g => g.items.length);
}
