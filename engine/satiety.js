// How filling a food is, per calorie (the "satiety" weight, spec §12 Option A).
// Built from USDA nutrition (engine/nutrition.js), not hand-picked:
//   protein and fiber per 100 calories are the strongest predictors of fullness,
//   and foods with lots of water (under 1.5 calories per gram as bought: potatoes,
//   produce, eggs, milk) fill you up more per calorie.
// Range 0.5 (oil, sugar-like foods: calories that don't fill you) to 1.4 (beans, eggs, vegetables).
import { NUTRITION } from './nutrition.js';

export function satietyOf(n) {
  if (!n || !n.kcal) return 0.5;
  const p = (n.protein / n.kcal) * 100;   // grams of protein per 100 kcal
  const f = (n.fiber / n.kcal) * 100;     // grams of fiber per 100 kcal
  const watery = n.g && n.kcal / n.g < 1.5 ? 0.25 : 0;
  const s = 0.5 + 0.09 * p + 0.11 * f + watery;
  return +Math.min(1.4, Math.max(0.5, s)).toFixed(2);
}

export const SATIETY = Object.fromEntries(Object.entries(NUTRITION).map(([id, n]) => [id, satietyOf(n)]));
