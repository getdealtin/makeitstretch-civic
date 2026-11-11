// The principles the meal planner is built on, in plain words, and a check for each one that runs on
// every plan (planMeals attaches the result as `principles`; the server logs any that fail, and
// test/principles.test.js runs them over a grid of budgets, households, diets and cuisines).
//
// Order matters: when two principles pull against each other, the earlier one wins. For example,
// calories (3) come before variety (6): a different meal may cost at most VARIETY_KCAL_GIVE of the
// calories, so a tight budget never feeds people less to look more varied.
//
// Owner review: draft of Nov 11 2026. Change the words here and in the build spec together.

import { FOOD_DB } from './food-db.js';
import { FLOOR_KCAL } from './pricing.js';
import { foodAllowed, recipeAllowed } from './diets.js';
import { capExcess, SIDES, packages, acceptableVariety, varietyFloor, VARIETY_KCAL_GIVE } from './meals.js';

const F = Object.fromEntries(FOOD_DB.map(f => [f.id, f]));
const SLOTS = ['breakfast', 'lunch', 'dinner'];
/** Average SNAP benefit per person per day (FY2025); guidance is checked at or above it. */
const SNAP_PPD = 6.22;

export const PRINCIPLES = [
  { id: 'cookable', text: 'Every meal can be cooked from the shopping list, plus salt, water and cinnamon and what the household already has.' },
  { id: 'within_budget', text: 'The list never costs more than the budget.' },
  { id: 'calories_first', text: 'Calories come first: about 2,000 per person per day (USDA reference). Until a plan reaches that, money goes to the cheapest filling food before anything else, and a plan is never chosen for looks over calories.' },
  { id: 'fullness_next', text: 'Fullness comes next: among meals that give similar calories for the money, the more filling ones win (protein, fiber and water keep people full longer).' },
  { id: 'guidance', text: 'At or above the average SNAP benefit ($6.22 per person per day), each person gets about 2,000 calories, at least 50 g protein and 25 g fiber, a fruit and two vegetable servings a day, and filling food (federal dietary guidance).' },
  { id: 'variety', text: `Different meals cost nothing extra when they can: meals that reuse foods already on the list come first, and a different meal is added whenever it fits the budget and keeps the calories (within ${Math.round(VARIETY_KCAL_GIVE * 100)}% of the most the budget can buy). The same meal never lands in the same slot two days running when that slot has more than one meal.` },
  { id: 'spread', text: 'No one ingredient (other than staples like rice, beans, oil, onions and garlic) in more than about 1 in 4 meals. When the budget can\'t allow that, the plan says some foods repeat.' },
  { id: 'household', text: 'Every amount is for the number of people chosen, and the plan never breaks a food the household leaves out or a diet it follows.' },
  { id: 'no_piles', text: 'Only what the meals and capped sides use is bought; leftover money is shown, never spent on piles of one food.' },
  { id: 'honest', text: 'The plan says plainly how many days it covers and what share of the calories it gives, so no one is told a plan is enough when it isn\'t. Whenever money can\'t cover it, the plan points to free food (food banks and nearby sites) and SNAP.' },
  { id: 'same_plan', text: 'The same answers always give the same plan (no randomness), so a plan can be shared, printed and checked.' },
];

/**
 * Check a plan from planMeals against each principle that can be checked on one plan ('fullness_next'
 * and 'same_plan' are about how plans compare, so test/principles.test.js checks them).
 * @returns {{ ok: boolean, failed: { id: string, detail: string }[] }}
 */
export function checkPrinciples(result) {
  const failed = [];
  const fail = (id, detail) => failed.push({ id, detail });
  const st = result.state;
  if (!st) return { ok: true, failed }; // no plan: nothing bought, nothing to check
  const { input, kitchen, assigned, coveredDays, budget } = st;
  const people = input.people, days = input.days;
  const onList = new Set([...result.cart.map(i => i.id), ...result.have, ...[...kitchen.foods.values()].filter(f => f.have).map(f => f.id)]);

  // cookable
  for (const x of assigned) for (const u of x.rec.uses) if (!onList.has(u.id)) fail('cookable', `${x.rec.recipe.title} needs ${u.id}`);

  // within_budget
  if (result.spent > budget + 1e-9) fail('within_budget', `spent ${result.spent} of ${budget}`);

  // calories_first: short of the target, no capped filling side could still be afforded.
  const target = FLOOR_KCAL * people * coveredDays;
  if (result.totalCals < target * 0.995) {
    for (const s of SIDES) {
      const f = kitchen.foods.get(s.id);
      if (!f || f.have) continue;
      const cap = Math.ceil(s.perPersonWeek * f.srv * people * Math.max(1, coveredDays / 7));
      const used = result.sideAdded?.[s.id] || 0;
      const add = Math.min(f.srv, cap - used);
      if (add <= 0) continue;
      const more = { ...result.sides, [s.id]: (result.sides?.[s.id] || 0) + add };
      if (packages(kitchen, assigned, more).cost <= budget) fail('calories_first', `short of calories but ${s.id} still fits`);
    }
  }

  // guidance (only when the budget is at or above the SNAP average and the whole plan is covered)
  if (budget >= SNAP_PPD * people * days - 0.01 && coveredDays === days) {
    const pd = people * days;
    let kcal = 0, protein = 0, fiber = 0, filling = 0, fruit = 0, veg = 0;
    // Every serving eaten: the meals and sides, whether bought or already at home.
    const eaten = packages(kitchen, assigned, result.sides || {}).need;
    for (const [id, n] of Object.entries(eaten)) {
      const f = F[id], k = (f.cal / f.srv) * n;
      kcal += k; filling += k * f.sat;
      protein += ((f.protein || 0) / f.srv) * n; fiber += ((f.fiber || 0) / f.srv) * n;
      if (f.cat === 'fruit') fruit += n;
      if (f.cat === 'vegetable' && !['onions', 'garlic'].includes(f.id)) veg += n;
    }
    const checks = [[kcal / pd >= 1950, `calories ${Math.round(kcal / pd)}`], [protein / pd >= 50, `protein ${Math.round(protein / pd)} g`],
      [fiber / pd >= 25, `fiber ${Math.round(fiber / pd)} g`], [fruit / pd >= 0.75, `fruit ${(fruit / pd).toFixed(2)}`],
      [veg / pd >= 2, `vegetables ${(veg / pd).toFixed(2)}`], [filling / Math.max(kcal, 1) >= 1.0, `satiety ${(filling / Math.max(kcal, 1)).toFixed(2)}`]];
    for (const [ok, d] of checks) if (!ok) fail('guidance', d);
  }

  // variety: (a) no slot short of its menu size while an acceptable different meal exists;
  // (b) no meal twice running in a slot that has 2+ meals (leftover days don't count as cooked).
  const v = st.varietyEnd;
  if (v) {
    const floor = varietyFloor(v.plan, v.current, v.target);
    for (const sl of SLOTS) {
      if (v.menu[sl].length >= Math.min(v.size[sl], v.plan.count(sl))) continue;
      const left = acceptableVariety(v, sl, budget, floor);
      if (left.length) fail('variety', `${sl} could add ${left[0].rec.recipe.title}`);
    }
  }
  for (const sl of SLOTS) {
    const seq = assigned.filter(x => x.slot === sl).sort((a, b) => a.day - b.day);
    if (new Set(seq.map(x => x.rec.id)).size < 2) continue;
    for (let i = 1; i < seq.length; i++) if (seq[i].rec.id === seq[i - 1].rec.id) fail('variety', `${sl} repeats ${seq[i].rec.recipe.title} on day ${seq[i].day + 1}`);
  }

  // spread: the "some foods repeat" note shows exactly when the spread isn't met.
  if (result.repeats !== capExcess(assigned).excess > 0) fail('spread', 'repeat note does not match the plan');

  // household
  for (const x of assigned) if (x.servings % people !== 0) fail('household', `${x.rec.recipe.title}: ${x.servings} servings for ${people}`);
  const avoid = input.avoid || [];
  for (const i of result.cart) if (!foodAllowed(F[i.id], avoid)) fail('household', `${i.id} is left out`);
  for (const x of assigned) if (!recipeAllowed(x.rec.recipe, avoid)) fail('household', `${x.rec.recipe.title} breaks a diet`);

  // no_piles: each food's packages are just enough for what's used.
  for (const i of result.cart) {
    const f = kitchen.foods.get(i.id);
    if (i.qty > Math.max(1, Math.ceil(i.servings / f.srv - 1e-9))) fail('no_piles', `${i.id}: ${i.qty} packages for ${i.servings} servings`);
  }

  // honest: the numbers shown add up.
  const shownDays = result.weeks ? result.weeks.flat().filter(d => !d.uncovered).length : coveredDays;
  if (shownDays !== coveredDays) fail('honest', `shows ${shownDays} days, covers ${coveredDays}`);
  if (result.cppd !== Math.round(result.totalCals / people / days)) fail('honest', 'calories per person per day');
  if (result.calPct !== Math.round((result.cppd / FLOOR_KCAL) * 100)) fail('honest', 'calorie share');
  if (Math.abs(result.remaining - (budget - result.spent)) > 0.011) fail('honest', 'money left');

  return { ok: !failed.length, failed };
}
