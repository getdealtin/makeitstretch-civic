// What each "leave out" choice and each diet actually does to foods and recipes.
// One place, used by the meal planner and the food-box flow, so a choice never silently does nothing.
//
// Two kinds of choices, asked separately:
//   • Foods to leave out: gluten, dairy, meat, pork, eggs, peanuts, fish (allergies or preference).
//   • Diets: halal, kosher, diabetic, low sodium. Each is a rule we can apply honestly, plus a note
//     shown with the plan saying what we did and what we can't check (certification, medical advice).

export const LEAVE_OUT = ['gluten', 'dairy', 'meat', 'pork', 'eggs', 'peanuts', 'fish'];
export const DIETS = ['halal', 'kosher', 'diabetic', 'low_sodium'];

const PORK_FOODS = ['porkchops'];
const PORK_WORDS = ['pork'];
const MEAT_FOODS = ['chicken', 'groundbeef', 'porkchops', 'cannedchili', 'cannedbroth'];
const MEAT_WORDS = ['chicken', 'ground beef', 'pork'];
const DAIRY_FOODS = ['milk', 'butter', 'cheese', 'yogurt', 'evaporatedmilk'];
const DAIRY_WORDS = ['milk', 'butter', 'cheese', 'yogurt'];
// Low sodium: packaged foods that are high in salt. Recipes with soy sauce are left out too.
const SALTY_FOODS = ['soy', 'hotsauce', 'cannedsoups', 'cannedchili', 'cannedbroth', 'salsa'];
const SALTY_WORDS = ['soy sauce'];
// Diabetic: concentrated sugar (dried fruit, fruit canned in syrup).
const SUGARY_FOODS = ['driedmango', 'cannedpeaches'];

/** Pork is left out by "pork", "halal" and "kosher" (and by "meat"). */
const noPork = avoid => avoid.some(a => a === 'pork' || a === 'halal' || a === 'kosher');

/** May this food go on the list? (Allergy tags on the food come from food-db.js.) */
export function foodAllowed(food, avoid = []) {
  if ((food.avoid || []).some(a => avoid.includes(a))) return false;
  if (noPork(avoid) && PORK_FOODS.includes(food.id)) return false;
  if (avoid.includes('low_sodium') && SALTY_FOODS.includes(food.id)) return false;
  if (avoid.includes('diabetic') && SUGARY_FOODS.includes(food.id)) return false;
  return true;
}

/** May this recipe be suggested? */
export function recipeAllowed(r, avoid = []) {
  const words = (r.ingredients || []).map(w => String(w).toLowerCase());
  if ((r.avoid || []).some(a => avoid.includes(a))) return false;
  if (noPork(avoid) && words.some(w => PORK_WORDS.includes(w))) return false;
  if (avoid.includes('pork') && words.some(w => PORK_WORDS.includes(w))) return false;
  // Kosher: no meat and dairy in the same dish.
  if (avoid.includes('kosher') && words.some(w => MEAT_WORDS.includes(w)) && words.some(w => DAIRY_WORDS.includes(w))) return false;
  if (avoid.includes('low_sodium') && words.some(w => SALTY_WORDS.includes(w))) return false;
  return true;
}

/** Notes shown with a plan for each diet chosen: what was done, and what to check yourself. */
export const DIET_NOTE_KEYS = { halal: 'diet_note_halal', kosher: 'diet_note_kosher', diabetic: 'diet_note_diabetic', low_sodium: 'diet_note_low_sodium' };

export const _test = { PORK_FOODS, MEAT_FOODS, DAIRY_FOODS, SALTY_FOODS, SUGARY_FOODS };
