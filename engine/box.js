// Food-box mode: "I have a food box — what can I make?"
// Skips the budget/cart half of the engine and goes straight to recipes.
//
// Unlike the budget flow's legacy matcher (fuzzy substring matching, kept verbatim
// for equivalence), this uses an explicit map from recipe ingredient words to food
// ids, so multi-word ingredients like "canned tomatoes" and "peanut butter" match.

import { FOOD_DB } from './food-db.js';

/** Recipe ingredient word → the food ids that satisfy it. */
export const INGREDIENT_FOODS = {
  'onions': ['onions'], 'oil': ['oil', 'oliveoil'], 'olive oil': ['oliveoil', 'oil'],
  'garlic': ['garlic'], 'canned tomatoes': ['cannedtomatoes'], 'eggs': ['eggs'],
  'beans': ['drybeans', 'blackbeans', 'kidneybean'], 'rice': ['rice'], 'potatoes': ['potatoes'],
  'carrots': ['carrots'], 'milk': ['milk', 'evaporatedmilk'], 'soy sauce': ['soy'],
  'lentils': ['lentils'], 'chicken': ['chicken'], 'butter': ['butter'], 'pasta': ['pasta'],
  'bread': ['bread'], 'oats': ['oats'], 'banana': ['bananas'], 'tortillas': ['tortillas'],
  'cornmeal': ['cornmeal'], 'sweet potatoes': ['sweetpotatoes'], 'cabbage': ['cabbage'],
  'peanut butter': ['peanutbutter'], 'chickpeas': ['chickpeas'], 'flour': ['flour'],
  'tuna': ['tuna'], 'coconut milk': ['coconutmilk'], 'tofu': [], 'ground beef': ['groundbeef'],
  'pork': ['porkchops'], 'applesauce': ['applesauce'],
};

/** Assumed to be in any kitchen; never listed as "you'll also need". */
export const PANTRY_BASICS = new Set(['salt', 'water', 'cinnamon']);

/** What the box picker offers, grouped. Only foods that some recipe can use. */
export const BOX_GROUPS = [
  { id: 'grains', items: ['rice', 'pasta', 'oats', 'bread', 'tortillas', 'cornmeal', 'flour'] },
  { id: 'protein', items: ['drybeans', 'blackbeans', 'kidneybean', 'chickpeas', 'lentils', 'peanutbutter', 'tuna', 'eggs', 'chicken', 'groundbeef', 'porkchops'] },
  { id: 'canned', items: ['cannedtomatoes', 'coconutmilk', 'applesauce', 'soy'] },
  { id: 'produce', items: ['potatoes', 'sweetpotatoes', 'onions', 'carrots', 'cabbage', 'garlic', 'bananas'] },
  { id: 'dairy', items: ['milk', 'evaporatedmilk', 'butter', 'oil', 'oliveoil'] },
];

const FOOD_BY_ID = Object.fromEntries(FOOD_DB.map(f => [f.id, f]));
/** "Dry Pinto Beans (1 lb)" → "Dry Pinto Beans" */
export const foodLabel = id => (FOOD_BY_ID[id]?.name || id).replace(/\s*\(.*\)\s*$/, '');

/**
 * @param {object[]} recipes  indexed recipes
 * @param {string[]} items    food ids in the box
 * @param {{avoid?:string[], limit?:number, maxMissing?:number}} [opts]
 * @returns {Array<{recipe:object, uses:string[], missing:string[]}>}
 *   uses: recipe ingredient words the box covers; missing: words it doesn't (pantry basics excluded).
 *   Ranked by (2 × box items used − missing), so dishes that use more of the box come first.
 */
export function matchBox(recipes, items, { avoid = [], limit = 12, maxMissing = 3 } = {}) {
  const have = new Set(items);
  const out = [];
  for (const r of recipes) {
    if ((r.avoid || []).some(a => avoid.includes(a))) continue;
    const needed = (r.ingredients || []).filter(i => !PANTRY_BASICS.has(i));
    const uses = needed.filter(i => (INGREDIENT_FOODS[i] || []).some(id => have.has(id)));
    if (!uses.length) continue;
    const missing = needed.filter(i => !uses.includes(i));
    if (missing.length > maxMissing) continue;
    out.push({ recipe: r, uses, missing });
  }
  // Using more of the box counts double; each missing ingredient counts against.
  const score = m => m.uses.length * 2 - m.missing.length;
  out.sort((a, b) => score(b) - score(a) || a.missing.length - b.missing.length || a.recipe.id - b.recipe.id);
  // Variety: drop near-duplicates ("Congee" vs "Congee with Toppings").
  const kept = [];
  for (const m of out) {
    const t = (m.recipe.title || '').toLowerCase();
    if (kept.some(k => { const u = k.recipe.title.toLowerCase(); return t.startsWith(u) || u.startsWith(t); })) continue;
    kept.push(m);
    if (kept.length >= limit) break;
  }
  return kept;
}
