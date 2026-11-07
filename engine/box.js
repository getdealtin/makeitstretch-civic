// Food-box mode: "I have a food box — what can I make?"
// Skips the budget/cart half of the engine and goes straight to recipes.
//
// Unlike the budget flow's legacy matcher (fuzzy substring matching, kept verbatim
// for equivalence), this uses an explicit map from recipe ingredient words to food
// ids, so multi-word ingredients like "canned tomatoes" and "peanut butter" match.

import { recipeAllowed } from './diets.js';
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

// Other everyday names for box foods (English). Names in Spanish, Vietnamese and Chinese come
// from the translation files, so "frijoles", "đậu" or "鸡蛋" match too (see /api/box-words).
export const BOX_SYNONYMS = {
  rice: ['brown rice', 'white rice', 'jasmine rice'], pasta: ['spaghetti', 'macaroni', 'noodles', 'penne', 'elbows', 'ramen', 'fideo'],
  oats: ['oatmeal', 'rolled oats'], bread: ['loaf', 'buns', 'rolls', 'sandwich bread'], tortillas: ['tortilla'],
  cornmeal: ['masa', 'polenta', 'grits'], flour: ['all purpose flour'],
  drybeans: ['beans', 'pinto beans', 'pintos', 'dry beans'], blackbeans: ['black beans'], kidneybean: ['kidney beans', 'red beans'],
  chickpeas: ['garbanzo', 'garbanzo beans', 'chick peas'], lentils: ['lentil'], peanutbutter: ['peanut butter'],
  tuna: ['canned tuna'], eggs: ['egg'], chicken: ['canned chicken', 'chicken breast', 'chicken thighs'],
  groundbeef: ['ground beef', 'hamburger', 'beef', 'ground meat'], porkchops: ['pork', 'pork chops'],
  cannedtomatoes: ['tomatoes', 'tomato sauce', 'diced tomatoes', 'crushed tomatoes', 'tomato'],
  coconutmilk: ['coconut milk'], applesauce: ['apple sauce'], soy: ['soy sauce'],
  potatoes: ['potato'], sweetpotatoes: ['sweet potato', 'yams', 'yam'], onions: ['onion'], carrots: ['carrot'],
  cabbage: [], garlic: [], bananas: ['banana'], milk: ['powdered milk', 'shelf milk', 'dry milk'],
  evaporatedmilk: ['evaporated milk'], butter: ['margarine'], oil: ['vegetable oil', 'cooking oil', 'canola oil'], oliveoil: ['olive oil'],
};

const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
const stem = w => (w.length > 4 && w.endsWith('oes') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
const toks = s => norm(s).split(' ').filter(Boolean).map(stem);
const CJK = /[\u3400-\u9fff]/;

/**
 * Which box foods does a typed word mean? words: { id: [names in any language] }.
 * A name matches when all its words are in the query ("canned black beans" ⊇ "black beans")
 * or all the query's words are in the name ("black" ⊆ "black beans"). Best match first.
 */
export function findBoxFood(query, words) {
  const q = toks(query);
  if (!q.length) return [];
  const hits = [];
  for (const [id, names] of Object.entries(words)) {
    let best = 0;
    for (const name of names) {
      const n = toks(name);
      if (!n.length) continue;
      const exact = n.join(' ') === q.join(' ');
      const cjk = CJK.test(query) && CJK.test(name) && (norm(name).includes(norm(query)) || norm(query).includes(norm(name)));
      const inQ = n.every(w => q.includes(w)), inN = q.every(w => n.includes(w));
      // Closer names win: fewer extra characters (Chinese) or extra words (other languages).
      const extra = Math.abs(norm(name).length - norm(query).length);
      const score = exact ? 1000 : cjk ? 500 - extra : inQ ? 100 + n.length : inN ? 60 - (n.length - q.length) : 0;
      if (score > best) best = score;
    }
    if (best) hits.push([id, best]);
  }
  return hits.sort((a, b) => b[1] - a[1]).map(h => h[0]);
}

/** A typed food word, cleaned for counting: letters, spaces, ' and - only; 2–30 characters. Else null. */
export function cleanFoodWord(s) {
  const w = String(s ?? '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  return /^[\p{L}\p{M}][\p{L}\p{M} '’-]{1,29}$/u.test(w) ? w : null;
}

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
    if (!recipeAllowed(r, avoid)) continue; // allergies, pork, and each diet's rules (engine/diets.js)
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
