// Recipe matcher: cart → candidate recipes per meal slot.
// Faithful port of the live /api/recipes-for-cart route (server.js L559–669)
// plus the client-side cuisine guard (index.html L2978–2991).
// Pure: takes the recipe list as an argument, so it runs on server or client.
//
// Fixed (Nov 2026): cart ids like 'cannedtomatoes' never matched recipe words like
// 'canned tomatoes', so those foods never pulled in their recipes. Words now also match
// through the explicit word → food map the food-box flow uses (INGREDIENT_FOODS).
import { INGREDIENT_FOODS } from './box.js';

const SIDE_DISH_BLOCKLIST = new Set([
  'potato salad', 'potato salad bowl', 'succotash', 'collard-style cabbage',
  'collard style cabbage', 'coleslaw', 'corn on the cob', 'cornbread',
  'skillet cornbread', 'biscuits', 'dinner rolls', 'rice paper rolls',
]);

const NOT_BREAKFAST = new Set([
  'rice and beans', 'gallo pinto', 'bean stew', 'vegetable soup',
  'lentil dal', 'hoppin john', "hoppin' john", 'succotash',
  'potato salad', 'potato salad bowl', 'collard-style cabbage',
  'pork and bean stew', 'bean and cornmeal stew',
]);

/** Give each seed recipe a stable 1-based id, as the live server does. */
export function indexRecipes(seed) {
  return seed.map((r, i) => ({ ...r, id: i + 1 }));
}

/**
 * @param {object[]} recipes  indexed recipe list
 * @param {object} q
 * @param {string[]} q.ingredients  cart food ids
 * @param {string[]} [q.cuisine]
 * @param {string[]} [q.avoid]
 * @returns {{breakfast:object[], lunch:object[], dinner:object[], any:object[]}}
 */
export function matchRecipes(recipes, { ingredients, cuisine = [], avoid = [] }) {
  const cartIngredients = ingredients.filter(Boolean).map(s => s.toLowerCase());
  const selectedCuisines = cuisine.filter(Boolean);
  const avoidList = avoid.filter(Boolean);
  const cuisineLower = selectedCuisines.map(c => c.toLowerCase());
  const filterCuisine = selectedCuisines.length && !selectedCuisines.includes('any');

  const scored = recipes.map(r => {
    const recipeIngs = Array.isArray(r.ingredients) ? r.ingredients : [];
    const recipeAvoids = Array.isArray(r.avoid) ? r.avoid : [];
    const rc = (r.cuisine || '').toLowerCase();
    if (filterCuisine && !cuisineLower.includes(rc) && rc !== 'any') return null;
    if (avoidList.some(a => recipeAvoids.includes(a))) return null;
    const nameLower = (r.title || '').toLowerCase();
    if (SIDE_DISH_BLOCKLIST.has(nameLower)) return null;
    if (r.slot === 'breakfast' && NOT_BREAKFAST.has(nameLower)) return null;

    // One shared ingredient qualifies a recipe (two was too strict).
    const matchScore = cartIngredients.filter(cartIng =>
      recipeIngs.some(ri => typeof ri === 'string' && (
        ri.toLowerCase().includes(cartIng) || cartIng.includes(ri.toLowerCase()) ||
        (INGREDIENT_FOODS[ri.toLowerCase()] || []).includes(cartIng)
      ))
    ).length;
    if (matchScore < 1) return null;
    return { ...r, matchScore };
  }).filter(Boolean);

  scored.sort((a, b) => b.matchScore - a.matchScore);

  // Up to 30 per slot; slots are strict.
  const bySlot = { breakfast: [], lunch: [], dinner: [], any: [] };
  for (const r of scored) {
    const rSlot = r.slot || 'any';
    const target = bySlot[rSlot] !== undefined ? rSlot : 'any';
    if (bySlot[target].length < 30) bySlot[target].push(r);
  }

  // Relaxed pass for thin slots: cuisine + avoid only, no match floor.
  const allCuisineMatch = recipes.filter(r => {
    const rc = (r.cuisine || '').toLowerCase();
    if (SIDE_DISH_BLOCKLIST.has((r.title || '').toLowerCase())) return false;
    if (filterCuisine && !cuisineLower.includes(rc) && rc !== 'any') return false;
    if (avoidList.some(a => (Array.isArray(r.avoid) ? r.avoid : []).includes(a))) return false;
    return true;
  });
  for (const slot of ['breakfast', 'lunch', 'dinner']) {
    if (bySlot[slot].length < 4) {
      const existing = new Set(bySlot[slot].map(r => r.id));
      const extras = allCuisineMatch.filter(r => {
        const rSlot = r.slot || 'any';
        if (rSlot === 'breakfast' && slot !== 'breakfast') return false;
        if (rSlot === 'dinner' && slot !== 'dinner') return false;
        if (rSlot === 'lunch' && slot !== 'lunch') return false;
        if (NOT_BREAKFAST.has((r.title || '').toLowerCase()) && slot === 'breakfast') return false;
        return !existing.has(r.id);
      });
      bySlot[slot].push(...extras.slice(0, 30 - bySlot[slot].length));
    }
  }

  // Client-side cuisine guard from the live tool.
  if (cuisine.length > 0 && !cuisine.includes('any')) {
    const keep = arr => (arr || []).filter(r => {
      const rc = (r.cuisine || '').toLowerCase();
      return cuisine.includes(rc) || rc === 'any';
    });
    return { breakfast: keep(bySlot.breakfast), lunch: keep(bySlot.lunch), dinner: keep(bySlot.dinner), any: keep(bySlot.any) };
  }
  return bySlot;
}
