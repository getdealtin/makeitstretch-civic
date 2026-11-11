// Meal-first planner (Nov 2026). Replaces "fill a cart by price per calorie, then find recipes".
//
// The old order made every list look alike, let meals need foods that weren't bought ("you'll also
// need cornmeal"), and turned extra money into piles of one staple (9 bags of cornmeal). Now:
//
//   1. Pick meals: for each meal slot, a short menu of recipes that fit the household's foods to
//      leave out, diet, cuisines and what they already have. Every ingredient must be something we
//      can price or that's in any kitchen (salt, water, cinnamon).
//   2. Build the list from those meals: people × meals × a standard serving of each food (the
//      package's servings in food-db.js; onions, garlic, oil, butter and soy sauce count as part
//      of a serving). NHLBI recipes use their printed amounts instead (grams per serving, from
//      data/nih-recipes.json). Packages are rounded up once per food, so shared foods are bought once.
//   3. Fit the budget: start from the cheapest menu, add a fruit a day, top up with filling sides
//      (extra bread, rice, oats…) only until the household reaches about 2,000 calories per person
//      per day (USDA's reference), then spend what's left on better meals: more protein, vegetables,
//      fruit, and more filling per calorie (satiety, engine/satiety.js). Calories come first, fullness
//      second, as in the original engine. Money that's still left stays left: it is shown, not spent
//      on more of one food.
//   4. If even the cheapest meals cost more than the budget, the plan covers the days it can and
//      says so, instead of quietly giving less food.
//
// Each meal also gets one alternative that keeps the plan within budget. Swapping recomputes the
// list (rebuildList), so whatever someone picks, everything they need is on it.
// Deterministic: same inputs, same plan. No DOM, runs on the server or in the browser.

import { FOOD_DB } from './food-db.js';
import { applyStoreAdjustments, FLOOR_KCAL } from './pricing.js';
import { INGREDIENT_FOODS, PANTRY_BASICS } from './box.js';
import { SIDE_DISH_BLOCKLIST, NOT_BREAKFAST } from './recipes.js';
import { foodAllowed, recipeAllowed } from './diets.js';

/** Part of a standard serving these foods add to one serving of a recipe (they flavor, not fill). */
export const LIGHT = { onions: 0.5, garlic: 0.25, oil: 0.5, oliveoil: 0.5, butter: 0.5, soy: 0.5 };
const NOT_A_VEGETABLE_SERVING = new Set(['onions', 'garlic']);
/** Different recipes per meal slot across the plan: enough variety, a list that stays short. */
export const MENU_SIZE = { breakfast: 3, lunch: 4, dinner: 5 };
/** The "shorter list" (owner decision Nov 7): fewer different meals, so fewer things to buy. */
export const SHORT_MENU = { breakfast: 2, lunch: 2, dinner: 3 };
/**
 * Variety cap (owner decision Nov 7): no one ingredient in more than about 1 in 4 cooked meals, so
 * a cheap ingredient (canned tomatoes) can't take over the menu. Staples and seasonings are exempt.
 */
export const CAP_SHARE = 0.25;
export const CAP_EXEMPT = new Set(['rice', 'drybeans', 'blackbeans', 'kidneybean', 'onions', 'oil', 'oliveoil', 'garlic']);
/** How far a set of meals goes over the cap: 0 = within it. */
export function capExcess(assigned) {
  const limit = Math.max(1, Math.ceil(assigned.length * CAP_SHARE));
  const count = {};
  for (const x of assigned) for (const u of x.rec.uses) if (!CAP_EXEMPT.has(u.id)) count[u.id] = (count[u.id] || 0) + 1;
  let excess = 0, worst = null;
  for (const [id, n] of Object.entries(count)) if (n - limit > excess) { excess = n - limit; worst = id; }
  return { excess, worst };
}
const BREAKFASTY = ['oatmeal', 'oats', 'porridge', 'scramble', 'egg', 'banana', 'potato breakfast'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOTS = ['breakfast', 'lunch', 'dinner'];
/** Filling sides used to reach the calorie target, best first; each has a weekly cap per person. */
export const SIDES = [
  { id: 'bread', perPersonWeek: 1 }, { id: 'tortillas', perPersonWeek: 1 }, { id: 'oats', perPersonWeek: 0.35 },
  { id: 'peanutbutter', perPersonWeek: 0.25 }, { id: 'potatoes', perPersonWeek: 0.6 }, { id: 'rice', perPersonWeek: 0.6 },
  { id: 'sweetpotatoes', perPersonWeek: 0.5 }, { id: 'bananas', perPersonWeek: 1 },
];
const FRUITS = ['bananas', 'apples', 'oranges'];
const LEGUMES = new Set(['drybeans', 'blackbeans', 'kidneybean', 'chickpeas', 'lentils', 'splitpeas', 'peanutbutter']);
const round2 = n => +n.toFixed(2);
/** Servings short of a whole package that are ignored when counting packages (see packages()). */
export const SLIVER = 0.05;

/** Who is eating and what the kitchen offers: priced foods, foods on hand, recipes prepared. */
function setup(input, prices, recipes) {
  const p = applyStoreAdjustments(prices, input.stores || []);
  const avoid = input.avoid || [];
  const have = new Set(FOOD_DB.filter(f => f.hasProp && (input.have || []).includes(f.hasProp)).map(f => f.id));
  const foods = new Map();
  for (const f of FOOD_DB) {
    if (!foodAllowed(f, avoid)) continue;
    if (!(p[f.id] > 0) && !have.has(f.id)) continue;
    const price = p[f.id] || 0;
    foods.set(f.id, { ...f, price, have: have.has(f.id), srvCost: have.has(f.id) ? 0 : price / f.srv, srvCal: f.cal / f.srv, srvFill: (f.cal / f.srv) * (f.sat || 1), srvProtein: (f.protein || 0) / f.srv });
  }
  // A recipe word → the food we'd use: one already at home first, otherwise the cheapest per serving.
  const resolve = word => {
    const ids = (INGREDIENT_FOODS[word] || []).filter(id => foods.has(id));
    if (!ids.length) return null;
    return ids.sort((a, b) => foods.get(a).srvCost - foods.get(b).srvCost || a.localeCompare(b))[0];
  };
  const cuisine = (input.cuisine || []).filter(c => c && c !== 'any');
  const prepared = [];
  for (const r of recipes) {
    const title = (r.title || '').toLowerCase();
    if (SIDE_DISH_BLOCKLIST.has(title) || !recipeAllowed(r, avoid)) continue;
    const rc = (r.cuisine || '').toLowerCase();
    if (cuisine.length && rc !== 'any' && !cuisine.includes(rc)) continue;
    const uses = [];
    let ok = true;
    if (r.uses) {
      // NHLBI recipes give real amounts: grams per recipe serving, in the food's standard servings.
      for (const u of r.uses) {
        const f = foods.get(u.id);
        if (!f) { ok = false; break; }
        uses.push({ id: u.id, amt: u.g / (r.srv || 1) / (f.g / f.srv) });
      }
    } else for (const raw of r.ingredients || []) {
      const word = String(raw).toLowerCase();
      if (PANTRY_BASICS.has(word)) continue;
      const id = resolve(word);
      if (!id) { ok = false; break; }
      if (!uses.find(u => u.id === id)) uses.push({ id, amt: LIGHT[id] ?? 1 });
    }
    if (!ok || !uses.length) continue;
    const per = k => uses.reduce((a, u) => a + foods.get(u.id)[k] * u.amt, 0);
    const kcal = per('srvCal'), protein = per('srvProtein'), cost = per('srvCost');
    // Filling calories: calories weighted by how filling each food is (engine/satiety.js: protein, fiber
    // and water keep you full longer), so a bean stew beats the same calories of white flour and oil.
    const fill = per('srvFill');
    const veg = uses.filter(u => foods.get(u.id).cat === 'vegetable' && !NOT_A_VEGETABLE_SERVING.has(u.id)).length;
    const fruit = uses.filter(u => foods.get(u.id).cat === 'fruit').length;
    // Better meal = more protein, vegetables and fruit, enough food in a serving, and more filling per
    // calorie (satiety: fill/kcal runs 0.5 to 1.4, so this adds −1 to +0.8). Used when there's money to
    // upgrade meals; the cheapest menu is still chosen on calories, so a tight budget never gets less food.
    const fullness = Math.max(-1, Math.min(1, (fill / Math.max(kcal, 1) - 1) * 2));
    const quality = (Math.min(protein, 25) / 25) * 2 + Math.min(veg, 2) + fruit * 0.5 + Math.min(kcal / 550, 1) + fullness;
    let slots;
    if (r.slot === 'breakfast') slots = ['breakfast'];
    else if (r.slot === 'lunch' || r.slot === 'dinner') slots = [r.slot === 'lunch' ? 'lunch' : 'dinner', r.slot === 'lunch' ? 'dinner' : 'lunch'];
    else slots = BREAKFASTY.some(k => title.includes(k)) ? ['breakfast'] : ['lunch', 'dinner'];
    if (NOT_BREAKFAST.has(title)) slots = slots.filter(s => s !== 'breakfast');
    const mainProtein = uses.filter(u => foods.get(u.id).cat === 'protein').sort((a, b) => foods.get(b.id).srvProtein - foods.get(a.id).srvProtein)[0]?.id || null;
    const sig = uses.map(u => u.id).sort().join(',');
    prepared.push({ recipe: r, id: r.id, uses, kcal, fill, protein, cost, quality, slots, mainProtein, sig });
  }
  return { foods, prepared };
}

/** Which days are cooked, and how many servings each cooked meal makes (leftover days eat yesterday's). */
function schedule(days, people, leftover) {
  const isLeftover = d => d > 0 && ((leftover === 'yes' && d % 7 % 2 === 1) || (leftover === 'sometimes' && d % 7 % 3 === 2));
  const occ = [];
  for (let d = 0; d < days; d++) {
    if (isLeftover(d)) continue;
    const extraDays = d + 1 < days && isLeftover(d + 1) ? 1 : 0;
    for (const slot of SLOTS) occ.push({ key: `${Math.floor(d / 7)}-${d % 7}-${slot}`, day: d, slot, servings: people * (1 + extraDays) });
  }
  return { occ, isLeftover };
}

/** Packages to buy for a set of (recipe, servings) plus extras {foodId: food servings}. */
export function packages(kitchen, assigned, extra = {}) {
  const need = {};
  for (const { rec, servings } of assigned) for (const u of rec.uses) need[u.id] = (need[u.id] || 0) + u.amt * servings;
  for (const [id, n] of Object.entries(extra)) need[id] = (need[id] || 0) + n;
  const items = [];
  let cost = 0;
  for (const [id, n] of Object.entries(need)) {
    const f = kitchen.foods.get(id);
    if (f.have) continue;
    // A sliver over a package (under SLIVER of a serving: a few grams, often just rounding in recipe
    // amounts) doesn't buy a whole extra package.
    const qty = Math.max(1, Math.ceil((n - SLIVER) / f.srv));
    items.push({ id, qty, servingsUsed: n });
    cost += qty * f.price;
  }
  return { items, cost: round2(cost), need };
}

/** Fruit a day (if affordable) and filling sides up to the calorie target, for a set of meals. */
export function topUp(kitchen, assigned, { people, days, budget }, balance = {}) {
  const mealKcal = assigned.reduce((a, x) => a + x.rec.kcal * x.servings, 0);
  let extra = { ...balance };
  let cost = packages(kitchen, assigned, extra).cost;
  let kcal = mealKcal + Object.entries(balance).reduce((a, [id, n]) => a + kitchen.foods.get(id).srvCal * n, 0);
  // One fruit serving per person per day, cheapest fruit first.
  const fruit = FRUITS.map(id => kitchen.foods.get(id)).filter(Boolean).sort((a, b) => a.srvCost - b.srvCost)[0];
  let fruitAdded = false;
  if (fruit && !balance[fruit.id]) {
    const trial = { ...extra, [fruit.id]: people * days };
    const c = packages(kitchen, assigned, trial).cost;
    if (c <= budget) { extra = trial; cost = c; kcal += fruit.srvCal * people * days; fruitAdded = true; }
  }
  // Filling sides, each capped per person per week, until about FLOOR_KCAL per person per day.
  const target = FLOOR_KCAL * people * days;
  const sideAdded = {}; // servings added as a filling side, per food (for engine/principles.js)
  for (const s of SIDES) {
    if (kcal >= target) break;
    const f = kitchen.foods.get(s.id);
    if (!f) continue;
    const capServings = Math.ceil(s.perPersonWeek * f.srv * people * Math.max(1, days / 7));
    const want = Math.min(capServings, Math.ceil((target - kcal) / f.srvCal));
    // The most servings (up to what's wanted) that still fit the budget: cost only grows with
    // servings, so a binary search finds it (halving could stop with a package's worth of money left).
    const costWith = n => packages(kitchen, assigned, { ...extra, [s.id]: (extra[s.id] || 0) + n }).cost;
    let lo = 0, hi = want;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (costWith(mid) <= budget) lo = mid; else hi = mid - 1; }
    if (lo > 0) { extra = { ...extra, [s.id]: (extra[s.id] || 0) + lo }; cost = packages(kitchen, assigned, extra).cost; kcal += f.srvCal * lo; sideAdded[s.id] = lo; }
  }
  // fruit: the daily fruit made it in (bananas added only as a filling side don't count), or a
  // fruit was already part of the balance.
  return { extra, cost, kcal, mealKcal, fruit: fruitAdded || (fruit && balance[fruit.id]) ? fruit.id : null, sideAdded };
}

/**
 * How much of the plan's calories more different meals may cost (draft, Nov 11 2026: 10%). Different meals
 * made from the same foods usually cost nothing; this lets one in when it's a little less filling per
 * dollar than repeating a meal.
 */
export const VARIETY_KCAL_GIVE = 0.10;
/** Whole-list pass limits: rounds of swaps, and the cheapest candidates tried per meal. */
const SWAP_PASSES = 6, SWAP_CANDIDATES = 12;
/** Meals that add a new food, tried per slot when adding variety (cheapest new foods first). */
const VARIETY_NEW_TRIED = 15;

/** Foods on the list or at home for a menu and its sides. */
export const foodsOnList = (plan, menu, current, haveIds) =>
  new Set([...haveIds, ...Object.keys(current.extra || {}), ...plan.assign(menu).flatMap(x => x.rec.uses.map(u => u.id))]);

/**
 * Meals a slot could add: not on the menu and not the same dish under another name. `free` marks the
 * ones made only from foods already on the list or at home; at most `extraNew` others (cheapest new
 * foods first) are tried too. Each comes with the plan it would give.
 */
export function varietyCandidates({ pools, plan, menu, current, haveIds }, sl, extraNew = VARIETY_NEW_TRIED) {
  const onList = foodsOnList(plan, menu, current, haveIds);
  const inMenu = new Set(SLOTS.flatMap(x => menu[x].map(r => r.id)));
  const sigs = new Set(SLOTS.flatMap(x => menu[x].map(r => r.sig)));
  const open = pools[sl].filter(c => !inMenu.has(c.id) && !sigs.has(c.sig));
  const free = open.filter(c => c.uses.every(u => onList.has(u.id)));
  const outlay = c => c.uses.reduce((a, u) => a + (onList.has(u.id) ? 0 : plan.price(u.id)), 0);
  const paid = open.filter(c => !free.includes(c)).map(c => [c, outlay(c)]).sort((a, b) => a[1] - b[1] || a[0].id - b[0].id).slice(0, extraNew).map(x => x[0]);
  return [...free.map(c => [c, true]), ...paid.map(c => [c, false])].map(([c, isFree]) => {
    const trial = { ...menu, [sl]: [...menu[sl], c] };
    return { rec: c, free: isFree, trial, t: plan.total(trial), excess: capExcess(plan.assign(trial)).excess };
  });
}

/**
 * Add different meals up to the menu size while the plan stays within budget and keeps its calories
 * (no lower than the floor fit() set: the best calories found, less VARIETY_KCAL_GIVE). Meals from
 * foods already on the list come first.
 */
/** The calories a variety choice must keep: fit()'s floor, never above what the plan has or needs. */
export const varietyFloor = (plan, current, target) => Math.min(plan.kcalFloor ?? current.kcal, current.kcal, target);

/** Variety candidates the plan can take: within budget, above the floor, no worse ingredient spread. */
export function acceptableVariety({ pools, plan, menu, current, haveIds }, sl, budget, floor) {
  const excess = capExcess(plan.assign(menu)).excess;
  return varietyCandidates({ pools, plan, menu, current, haveIds }, sl)
    // ...and never costs the daily fruit.
    .filter(c => c.t.cost <= budget && c.t.kcal >= floor && c.excess <= excess && (c.t.fruit || !current.fruit));
}

function addVariety({ pools, plan, menu, current, budget, size, haveIds, target }) {
  const floor = varietyFloor(plan, current, target);
  // Take turns, one meal per slot per round, until no slot can add one: a meal added to one slot can
  // put a food on the list that makes another slot's meal possible.
  for (let added = true; added;) {
    added = false;
    for (const sl of SLOTS) {
      if (menu[sl].length >= Math.min(size[sl], plan.count(sl))) continue;
      // A new meal never makes the ingredient spread worse than it is.
      const ok = acceptableVariety({ pools, plan, menu, current, haveIds }, sl, budget, floor)
        // Free first, then least ingredient repetition, then the better meal, then the cheaper one.
        .sort((a, b) => Number(b.free) - Number(a.free) || a.excess - b.excess || b.rec.quality - a.rec.quality || a.t.cost - b.t.cost || a.rec.id - b.rec.id);
      if (!ok.length) continue;
      menu = ok[0].trial; current = ok[0].t; added = true;
    }
  }
  return { menu, current };
}

/**
 * Plan meals and the shopping list for a budget.
 * @param {object} input  { budget, days, people, cuisine, avoid, have, stores, leftover }
 * @param {object} prices food id → package price (resolvePrices)
 * @param {object[]} recipes indexed recipes
 */
export function planMeals(input, prices, recipes) {
  const { budget, people } = input;
  const days = Math.max(1, input.days || 7);
  const kitchen = setup(input, prices, recipes);
  const pools = Object.fromEntries(SLOTS.map(sl => [sl, kitchen.prepared.filter(r => r.slots.includes(sl))
    // Cheapest calories first (the calorie floor comes before fullness, as in the original engine).
    .sort((a, b) => a.cost / Math.max(a.kcal, 1) - b.cost / Math.max(b.kcal, 1) || b.quality - a.quality || a.id - b.id)]));
  if (SLOTS.some(sl => !pools[sl].length)) return empty(input, days, 'no_meals');

  const haveIds = [...kitchen.foods.values()].filter(f => f.have).map(f => f.id);
  // Build for d days; if the cheapest menu costs more than the budget, cover fewer days.
  // cap: false skips the ingredient-spread swaps (used only when the spread can't be afforded).
  // fixed: use this menu as is (to stretch a chosen menu over more days).
  const attempt = (d, size = MENU_SIZE, { cap = true, fixed = null } = {}) => {
    const { occ, isLeftover } = schedule(d, people, input.leftover);
    const count = sl => occ.filter(o => o.slot === sl).length;
    const want = sl => Math.min(size[sl], count(sl));
    // Servings one menu meal makes in a slot: the slot's servings shared among its meals.
    const per = sl => (people * count(sl)) / Math.max(1, want(sl));
    // Shared-foods menu (principle 6, Nov 11 2026): a meal is priced by what it adds to the list. A food
    // already on the list costs only what's eaten; a new food costs a whole package. So meals that reuse
    // the same rice, beans and eggs come first, and a tight budget gets different meals from the same
    // few foods instead of one meal all week. Cost per calorie decides (calories first).
    const priceIn = (r, sl, basket) => (r.uses.reduce((a, u) => a + (basket.has(u.id) ? 0 : kitchen.foods.get(u.id).price), 0) + r.cost * per(sl)) / Math.max(r.kcal * per(sl), 1);
    const assign = m => occ.map((o, i) => {
      const list = m[o.slot];
      const idx = (occ.slice(0, i).filter(x => x.slot === o.slot).length + SLOTS.indexOf(o.slot)) % list.length;
      return { ...o, rec: list[idx] };
    });
    let menu = fixed;
    if (!menu) {
      menu = Object.fromEntries(SLOTS.map(sl => [sl, []]));
      const basket = new Set(haveIds), used = new Set(), sigs = new Set();
      // Take turns: a first breakfast, lunch and dinner, then a second of each, and so on.
      for (let round = 0; SLOTS.some(sl => menu[sl].length === round && round < want(sl)); round++) {
        for (const sl of SLOTS) {
          if (menu[sl].length !== round || round >= want(sl)) continue;
          let best = null, bestScore = Infinity;
          for (const r of pools[sl]) {
            // No recipe in two slots, and no two meals that are the same dish under another name (same foods).
            if (used.has(r.id) || sigs.has(r.sig)) continue;
            const s = priceIn(r, sl, basket);
            if (s < bestScore - 1e-12) { best = r; bestScore = s; }
          }
          if (!best) continue;
          menu[sl].push(best); used.add(best.id); sigs.add(best.sig);
          for (const u of best.uses) basket.add(u.id);
        }
      }
      // Very few recipes fit (strict leave-outs, few cuisines): rather than no meal, repeat one from another slot.
      for (const sl of SLOTS) if (!menu[sl].length && count(sl)) menu[sl].push(pools[sl][0]);
      // Variety cap: swap out the menu meal that uses the over-used ingredient most, for the cheapest meal
      // (per calorie, counting what it adds to the list) in that slot that doesn't use it. Stops when
      // nothing better exists.
      for (let guard = 0; cap && guard < 30; guard++) {
        const { excess, worst } = capExcess(assign(menu));
        if (!excess) break;
        let done = false;
        for (const sl of SLOTS) {
          const i = menu[sl].findIndex(r => r.uses.some(u => u.id === worst));
          if (i < 0) continue;
          const inMenu = new Set(SLOTS.flatMap(x => menu[x].map(r => r.id)));
          const rest = new Set([...haveIds, ...SLOTS.flatMap(x => menu[x].filter((_, j) => !(x === sl && j === i)).flatMap(r => r.uses.map(u => u.id)))]);
          const cand = pools[sl].filter(c => !inMenu.has(c.id) && !c.uses.some(u => u.id === worst) &&
            !SLOTS.some(x => menu[x].some(m => m.sig === c.sig)))
            .reduce((b, c) => (!b || priceIn(c, sl, rest) < priceIn(b, sl, rest) - 1e-12 ? c : b), null);
          if (!cand) continue;
          const trial = { ...menu, [sl]: menu[sl].map((r, j) => (j === i ? cand : r)) };
          if (capExcess(assign(trial)).excess < excess) { menu[sl] = trial[sl]; done = true; break; }
        }
        if (!done) break;
      }
      // Whole-list pass: the turn-taking above can't see that, say, rice for breakfast too would make the
      // list cheaper. Swap one meal at a time for the swap that most improves the plan: within budget first,
      // then less ingredient repetition (when the spread is on), then the most calories once filling sides
      // are added (calories first), then the lower cost. A few rounds, best swap first.
      // Score = [how far the meals go over budget, ingredient repetition (with the spread on), calories short
      // of the target after filling sides, cost]; compared in that order.
      const target = FLOOR_KCAL * people * d;
      const score = m => {
        const a = assign(m), base = packages(kitchen, a).cost, ex = cap ? capExcess(a).excess : 0;
        if (base > budget) return [base - budget, ex, 0, base];
        const t = topUp(kitchen, a, { people, days: d, budget });
        return [0, ex, Math.max(0, target - t.kcal), t.cost];
      };
      const TOL = [1e-9, 0, 1, 0.005];
      const better = (a, b) => { for (let k = 0; k < a.length; k++) { if (a[k] < b[k] - TOL[k]) return true; if (a[k] > b[k] + TOL[k]) return false; } return false; };
      let cur = score(menu);
      for (let pass = 0; pass < SWAP_PASSES; pass++) {
        let best = null;
        for (const sl of SLOTS) for (let i = 0; i < menu[sl].length; i++) {
          const inMenu = new Set(SLOTS.flatMap(x => menu[x].map(r => r.id)));
          const rest = new Set([...haveIds, ...SLOTS.flatMap(x => menu[x].filter((_, j) => !(x === sl && j === i)).flatMap(r => r.uses.map(u => u.id)))]);
          const cands = pools[sl].filter(c => !inMenu.has(c.id) && !SLOTS.some(x => menu[x].some((m, j) => m.sig === c.sig && !(x === sl && j === i))))
            .map(c => [c, priceIn(c, sl, rest)]).sort((a, b) => a[1] - b[1]).slice(0, SWAP_CANDIDATES);
          for (const [c] of cands) {
            const trial = { ...menu, [sl]: menu[sl].map((r, j) => (j === i ? c : r)) };
            const s = score(trial);
            if (better(s, best ? best.s : cur)) best = { trial, s };
          }
        }
        if (!best) break;
        menu = best.trial; cur = best.s;
      }
    }
    const total = m => topUp(kitchen, assign(m), { people, days: d, budget });
    return { occ, isLeftover, menu, assign, total, count, price: id => kitchen.foods.get(id).price, base: packages(kitchen, assign(menu)).cost };
  };
  // Tight budget: fewer different meals first (fewer packages to buy), down to one breakfast, one lunch
  // and one dinner (draft, Nov 8: a full week of the same three meals, with "ways to change it up", beats
  // covering one day while the food bought would last longer); only then fewer days.
  const first = input.menu === 'short' ? SHORT_MENU : MENU_SIZE;
  const SMALLER = [first, ...[SHORT_MENU, { breakfast: 1, lunch: 2, dinner: 2 }, { breakfast: 1, lunch: 1, dinner: 1 }].filter(x => x !== first)];
  let d = days, plan;
  // Choosing among menus that fit (principles 3, 6 and 7): the most calories first. A plan with more
  // different meals, or with the ingredient spread, wins only if it gives up no more than
  // VARIETY_KCAL_GIVE of those calories. Order of preference: bigger menu, then spread, then no spread.
  const fit = dd => {
    const target = FLOOR_KCAL * people * dd, fits = [];
    search: for (const size of SMALLER) for (const cap of [true, false]) {
      const p = attempt(dd, size, { cap });
      if (p.base > budget) continue;
      p.kcal = p.total(p.menu).kcal;
      fits.push(p);
      if (p.kcal >= target) break search; // calories met: nothing smaller can do better
    }
    if (!fits.length) return attempt(dd, SMALLER.at(-1));
    const most = Math.max(...fits.map(p => Math.min(p.kcal, target)));
    const chosen = fits.find(p => Math.min(p.kcal, target) >= most * (1 - VARIETY_KCAL_GIVE));
    // Every later variety choice is held to this same floor, so allowances never add up.
    chosen.kcalFloor = most * (1 - VARIETY_KCAL_GIVE);
    return chosen;
  };
  plan = fit(d);
  while (plan.base > budget && d > 1) { d -= 1; plan = fit(d); }
  if (plan.base > budget) return empty(input, days, 'budget_too_small');
  // Leftovers (owner decision, Nov 11): food bought for fewer days often has servings left in its
  // packages (most of a bag of grits). Keep the same meals and add days while the list still fits the
  // budget, so what's bought is planned and counted instead of left over.
  while (d < days) {
    const next = attempt(d + 1, MENU_SIZE, { fixed: plan.menu });
    if (next.base > budget) break;
    next.kcalFloor = plan.kcalFloor; d += 1; plan = next;
  }

  // Spend what's left on better meals: swap a menu recipe for a better one while everything fits.
  let { menu } = plan;
  let current = plan.total(menu);
  const byQuality = Object.fromEntries(SLOTS.map(sl => [sl, [...pools[sl]].sort((a, b) => b.quality - a.quality || a.cost - b.cost || a.id - b.id).slice(0, 18)]));
  const mealQuality = m => plan.assign(m).reduce((a, x) => a + x.rec.quality * x.servings, 0);
  for (let guard = 0; guard < 60; guard++) {
    let best = null;
    const q0 = mealQuality(menu), inMenu = new Set(SLOTS.flatMap(sl => menu[sl].map(r => r.id)));
    for (const sl of SLOTS) for (let i = 0; i < menu[sl].length; i++) for (const cand of byQuality[sl]) {
      if (inMenu.has(cand.id) || cand.quality <= menu[sl][i].quality + 0.05) continue;
      if (SLOTS.some(x => menu[x].some((m, j) => m.sig === cand.sig && !(x === sl && j === i)))) continue;
      // Protein variety: at most 2 menu recipes built on the same meat, fish or eggs (3 for beans and lentils).
      if (cand.mainProtein && cand.mainProtein !== menu[sl][i].mainProtein &&
        SLOTS.flatMap(x => menu[x]).filter(r => r.mainProtein === cand.mainProtein).length >= (LEGUMES.has(cand.mainProtein) ? 3 : 2)) continue;
      if ((cand.cost - menu[sl][i].cost) * people * d * 2 > budget - current.cost + 1) continue; // can't fit
      const trial = { ...menu, [sl]: menu[sl].map((r, j) => (j === i ? cand : r)) };
      if (capExcess(plan.assign(trial)).excess > capExcess(plan.assign(menu)).excess) continue;
      const t = plan.total(trial);
      if (t.cost > budget || t.kcal < Math.min(current.kcal, FLOOR_KCAL * people * d)) continue;
      if (current.fruit && !t.fruit) continue; // a better meal never costs the daily fruit
      const gain = (mealQuality(trial) - q0) / Math.max(t.cost - current.cost, 0.25);
      if (!best || gain > best.gain) best = { trial, t, gain };
    }
    if (!best) break;
    menu = best.trial; current = best.t;
  }

  // Free variety (principle 6): if a smaller menu was needed, add back meals made only from foods already
  // on the list or at home, best first, while the plan stays within budget and keeps its calories
  // (within VARIETY_KCAL_GIVE). Rotation means no meal on two days running in a slot with 2+ meals.
  ({ menu, current } = addVariety({ pools, plan, menu, current, budget, size: first, haveIds, target: FLOOR_KCAL * people * d }));
  const varietyEnd = { pools, plan, menu, current, haveIds, size: first, target: FLOOR_KCAL * people * d };

  let assigned = plan.assign(menu);
  // Balance: with money still left, a vegetable side, a second fruit and a cup of milk a day
  // (USDA food groups), each only if it fits. What's left after that stays left.
  const balance = {};
  const perDay = people * d;
  const cheapest = ids => ids.map(id => kitchen.foods.get(id)).filter(f => f && !f.have).sort((a, b) => a.srvCost - b.srvCost)[0];
  const veg = cheapest(['frozenvegs', 'carrots', 'cabbage', 'greenbeans', 'spinach', 'frozencorn']);
  const fruits = FRUITS.map(id => kitchen.foods.get(id)).filter(Boolean).sort((a, b) => a.srvCost - b.srvCost);
  const milk = kitchen.foods.get('milk');
  for (const [f, n] of [[veg, perDay], [fruits[1] || fruits[0], perDay], [milk, perDay]]) {
    if (!f) continue;
    const trial = { ...balance, [f.id]: (balance[f.id] || 0) + n };
    const before = topUp(kitchen, assigned, { people, days: d, budget }, balance);
    const t = topUp(kitchen, assigned, { people, days: d, budget }, trial);
    // An extra food group never pushes out the daily fruit (topUp drops the fruit when it can't fit).
    if (t.cost <= budget && t.kcal >= Math.min(current.kcal, FLOOR_KCAL * people * d) && (t.fruit || !before.fruit)) Object.assign(balance, trial);
  }
  // One alternative per meal that keeps the whole plan within budget.
  const inMenu = new Set(SLOTS.flatMap(sl => menu[sl].map(r => r.id)));
  const altFor = {};
  for (const sl of SLOTS) for (const r of menu[sl]) {
    const others = pools[sl].filter(c => c.id !== r.id).sort((a, b) => Number(inMenu.has(a.id)) - Number(inMenu.has(b.id)) || b.quality - a.quality || a.cost - b.cost);
    for (const c of others) {
      const swapped = assigned.map(x => (x.slot === sl && x.rec.id === r.id ? { ...x, rec: c } : x));
      if (capExcess(swapped).excess > capExcess(assigned).excess) continue;
      if (topUp(kitchen, swapped, { people, days: d, budget }, balance).cost <= budget) { altFor[`${sl}:${r.id}`] = c; break; }
    }
  }
  // varietyEnd: the menu as the variety pass left it, so engine/principles.js can check its work.
  const state = { input: { ...input, days }, kitchen, assigned, altFor, coveredDays: d, budget, balance, varietyEnd };
  const weeks = [];
  for (let day = 0; day < days; day++) {
    const w = Math.floor(day / 7);
    (weeks[w] ||= []);
    if (day >= d) { weeks[w].push({ dayName: DAY_NAMES[day % 7], uncovered: true, leftover: false }); continue; }
    if (plan.isLeftover(day)) { weeks[w].push({ dayName: DAY_NAMES[day % 7], leftover: true }); continue; }
    const entry = { dayName: DAY_NAMES[day % 7], leftover: false };
    for (const sl of SLOTS) {
      const a = assigned.find(x => x.day === day && x.slot === sl);
      const alt = altFor[`${sl}:${a.rec.id}`];
      entry[sl] = alt ? [a.rec.recipe, alt.recipe] : [a.rec.recipe];
    }
    weeks[w].push(entry);
  }
  return { ...rebuildList(state, []), weeks, state };
}

/**
 * The list and totals for the meals chosen. swaps: keys "w-d-slot" where the person picked the
 * alternative. Used after every swap, so the list always matches the meals.
 */
export function rebuildList(state, swaps = []) {
  const { kitchen, input, budget, coveredDays } = state;
  const swapped = new Set(swaps);
  const assigned = state.assigned.map(x => {
    if (!swapped.has(x.key)) return x;
    const alt = state.altFor[`${x.slot}:${x.rec.id}`];
    return alt ? { ...x, rec: alt } : x;
  });
  // Swaps can cost more than the meals they replace: drop the extras (milk, a second fruit, the
  // vegetable side) one at a time until it fits; if it still doesn't, say by how much.
  let balance = { ...state.balance };
  let t = topUp(kitchen, assigned, { people: input.people, days: coveredDays, budget }, balance);
  for (const id of Object.keys(balance).reverse()) {
    if (t.cost <= budget) break;
    delete balance[id];
    t = topUp(kitchen, assigned, { people: input.people, days: coveredDays, budget }, balance);
  }
  const pk = packages(kitchen, assigned, t.extra);
  const sideIds = new Set(Object.keys(t.extra));
  const mealIds = new Set(assigned.flatMap(x => x.rec.uses.map(u => u.id)));
  const cart = pk.items.map(({ id, qty, servingsUsed }) => {
    const f = kitchen.foods.get(id);
    return { ...f, qty, servings: +servingsUsed.toFixed(2), subtotal: round2(f.price * qty), role: mealIds.has(id) ? 'meal' : balance[id] || id === t.fruit ? 'balance' : sideIds.has(id) ? 'side' : 'meal' };
  });
  const have = [...kitchen.foods.values()].filter(f => f.have && mealIds.has(f.id)).map(f => f.id);
  // One list per week (owner decision Nov 7): cumulative packages through each week, minus what
  // earlier weeks already bought, so a bottle of oil is bought once and fresh food when it's eaten.
  const nWeeks = Math.ceil(coveredDays / 7);
  const byWeek = [];
  if (nWeeks > 1) {
    const cumQty = upTo => {
      const need = {};
      for (const x of assigned) if (x.day < upTo) for (const u of x.rec.uses) need[u.id] = (need[u.id] || 0) + u.amt * x.servings;
      const share = Math.min(upTo, coveredDays) / coveredDays;
      for (const [id, n] of Object.entries(t.extra)) need[id] = (need[id] || 0) + n * share;
      return Object.fromEntries(Object.entries(need).map(([id, n]) => [id, Math.ceil((n - SLIVER) / kitchen.foods.get(id).srv)]));
    };
    let prev = {};
    for (let w = 0; w < nWeeks; w++) {
      const now = cumQty(w === nWeeks - 1 ? Infinity : (w + 1) * 7);
      const items = cart.map(i => ({ ...i, qty: (now[i.id] || 0) - (prev[i.id] || 0) })).filter(i => i.qty > 0)
        .map(i => ({ ...i, subtotal: round2(i.price * i.qty) }));
      byWeek.push({ week: w + 1, cart: items, spent: round2(items.reduce((a, i) => a + i.subtotal, 0)) });
      prev = now;
    }
  }
  const spent = round2(pk.cost);
  const remaining = round2(budget - spent);
  // Leftovers count (owner decision, Nov 11): servings left in the packages bought (most of a bag of
  // grits, a few cups of rice) are food the household has, so they count toward the calories shown.
  // Not oil, butter, garlic, onions or soy sauce: flavorings, not meals.
  let leftoverCals = 0;
  for (const { id, qty, servingsUsed } of pk.items) {
    if (id in LIGHT) continue;
    const f = kitchen.foods.get(id);
    leftoverCals += Math.max(0, qty * f.srv - servingsUsed) * f.srvCal;
  }
  // They only fill the gap to about 2,000 a day: past that they'd overstate what a plan is for.
  const fullCals = FLOOR_KCAL * input.people * input.days;
  leftoverCals = Math.round(Math.max(0, Math.min(leftoverCals, fullCals - t.kcal)));
  const totalCals = Math.round(t.kcal) + leftoverCals;
  const cppd = Math.round(totalCals / input.people / input.days);
  return {
    cart, byWeek, remaining, totalCals, leftoverCals, spent, have, coveredDays, overBudget: spent > budget ? round2(spent - budget) : 0,
    sides: t.extra, // food servings bought beyond the meals: fruit, filling sides, food groups
    sideAdded: t.sideAdded, // of those, servings added as capped filling sides
    // Owner decision Nov 7: on the tightest budgets the plan recommends what it can and says some
    // foods repeat often, pointing to free food (the variety cap couldn't be met within the budget).
    repeats: capExcess(assigned).excess > 0,
    pppd: round2(spent / input.days / input.people), ppmeal: round2(spent / input.days / input.people / 3),
    cppd, calPct: Math.round((cppd / FLOOR_KCAL) * 100),
  };
}

function empty(input, days, reason) {
  return { cart: [], remaining: input.budget, totalCals: 0, spent: 0, have: [], coveredDays: 0, pppd: 0, ppmeal: 0, cppd: 0, calPct: 0, weeks: [], state: null, reason };
}
