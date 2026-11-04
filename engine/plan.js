// Meal planner: matched recipes → a varied, day-by-day plan.
// Faithful port of buildWeekCards()/pickTwo() (index.html L3003–3125), without the HTML.
//
// Variety safeguards (keep intact; the satiety upgrade must not touch these):
//   +10,000  reusing a meal in the same week
//   + 8,000  a similar-titled dish already used this week
//   + 5,000  per prior use across weeks
//   prime-number (13) per-day rotation offset
// Deterministic: same inputs → same plan.

const BREAKFAST_ANY_KEYWORDS = ['oatmeal', 'oats', 'porridge', 'scramble', 'egg', 'banana', 'potato breakfast'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const SLOTS = ['breakfast', 'lunch', 'dinner'];

/**
 * @param {{breakfast:object[],lunch:object[],dinner:object[],any:object[]}} bySlot
 * @param {{days:number, leftover?:'yes'|'sometimes'|'no'}} opts
 * @returns {Array<Array<{dayName:string, leftover:boolean, breakfast?:object[], lunch?:object[], dinner?:object[]}>>}
 *   weeks → days; each meal slot holds two options (pick + "try something new").
 */
export function planWeeks(bySlot, { days, leftover = 'sometimes' }) {
  const allAny = bySlot.any || [];
  const isBreakfasty = r => BREAKFAST_ANY_KEYWORDS.some(kw => (r.title || '').toLowerCase().includes(kw));
  const anyForBreakfast = allAny.filter(isBreakfasty);
  const anyForDinnerLunch = allAny.filter(r => !isBreakfasty(r));
  const pools = {
    breakfast: [...(bySlot.breakfast || []), ...anyForBreakfast],
    lunch:     [...(bySlot.lunch || []), ...anyForDinnerLunch],
    dinner:    [...(bySlot.dinner || []), ...anyForDinnerLunch],
  };

  // Thin pool? Borrow from other slots (already cuisine-filtered).
  const allRecipes = [...(bySlot.breakfast || []), ...(bySlot.lunch || []), ...(bySlot.dinner || []), ...allAny];
  for (const s of SLOTS) {
    if (pools[s].length < 4) {
      const extras = allRecipes.filter(r => !pools[s].find(p => p.id === r.id));
      pools[s] = [...pools[s], ...extras];
    }
  }
  if (!allRecipes.length) return [];

  const numWeeks = Math.ceil(days / 7);
  const mealUse = {};
  const weeklyUsed = {};

  const pickTwo = (slot, globalDay, weekIdx) => {
    const pool = pools[slot] || allRecipes;
    if (!pool.length) return [];
    const weekKey = weekIdx || 0;
    if (!weeklyUsed[weekKey]) weeklyUsed[weekKey] = new Set();
    const usedThisWeek = weeklyUsed[weekKey];
    const PRIME = 13;
    const scored = pool.map((r, idx) => {
      const globalUse = mealUse[r.id] || 0;
      const weekUse = usedThisWeek.has(r.id) ? 1 : 0;
      const titleWords = (r.title || '').toLowerCase().split(' ').slice(0, 2).join(' ');
      const similarUsed = [...usedThisWeek].some(usedId => {
        const usedR = pool.find(p => p.id === usedId);
        if (!usedR) return false;
        const usedWords = (usedR.title || '').toLowerCase().split(' ').slice(0, 2).join(' ');
        return titleWords === usedWords && usedR.id !== r.id;
      });
      return {
        r,
        score: weekUse * 10000 + (similarUsed ? 8000 : 0) + globalUse * 5000 +
          ((idx + globalDay * PRIME) % Math.max(pool.length, 1)),
      };
    });
    scored.sort((a, b) => a.score - b.score);
    const picked = [];
    for (const { r } of scored) {
      if (picked.length >= 2) break;
      if (!picked.find(x => x.id === r.id)) picked.push(r);
    }
    for (const r of picked) {
      mealUse[r.id] = (mealUse[r.id] || 0) + 1;
      usedThisWeek.add(r.id);
    }
    return picked;
  };

  const weeks = [];
  let dayCount = 0;
  for (let w = 0; w < numWeeks; w++) {
    const weekDays = [];
    for (let d = 0; d < 7 && dayCount < days; d++, dayCount++) {
      const dayName = DAY_NAMES[d];
      const isLeftover = dayCount > 0 && (
        (leftover === 'yes' && d % 2 === 1) ||
        (leftover === 'sometimes' && d % 3 === 2)
      );
      if (isLeftover) { weekDays.push({ dayName, leftover: true }); continue; }
      weekDays.push({
        dayName, leftover: false,
        breakfast: pickTwo('breakfast', dayCount, w),
        lunch: pickTwo('lunch', dayCount + 100, w),
        dinner: pickTwo('dinner', dayCount + 200, w),
      });
    }
    weeks.push(weekDays);
  }
  return weeks;
}
