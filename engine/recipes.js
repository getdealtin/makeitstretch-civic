// Recipe ids and the slot rules the meal planner (engine/meals.js) applies to the 161 seed recipes.
// The NHLBI main dishes (data/nih-recipes.json) carry their own ids (1001+) and slots.
// (Until Nov 8 2026 this file also held the original cart → recipe matcher; the meal-first planner
// replaced it, and git history has the old version.)

/** Side dishes: never served as a whole meal. */
export const SIDE_DISH_BLOCKLIST = new Set([
  'potato salad', 'potato salad bowl', 'succotash', 'collard-style cabbage',
  'collard style cabbage', 'coleslaw', 'corn on the cob', 'cornbread',
  'skillet cornbread', 'biscuits', 'dinner rolls', 'rice paper rolls',
]);

/** Dishes that aren't breakfast, whatever slot the seed data gives them. */
export const NOT_BREAKFAST = new Set([
  'rice and beans', 'gallo pinto', 'bean stew', 'vegetable soup',
  'lentil dal', 'hoppin john', "hoppin' john", 'succotash',
  'potato salad', 'potato salad bowl', 'collard-style cabbage',
  'pork and bean stew', 'bean and cornmeal stew',
]);

/** Give each seed recipe a stable 1-based id (its position in data/seed-recipes.json). */
export function indexRecipes(seed) {
  return seed.map((r, i) => ({ ...r, id: i + 1 }));
}
