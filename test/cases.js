// Input grid shared by the equivalence tests and the golden fixtures.
const budgets = [8, 25, 60, 120, 300, 750];
const days = [4, 7, 14, 30];
const people = [1, 3, 5];
const regions = ['northeast', 'midwest', 'south', 'west', 'national'];
const prefs = [
  { cuisine: [], avoid: [], have: [], stores: [], leftover: 'sometimes' },
  { cuisine: ['latin'], avoid: [], have: [], stores: ['corner'], leftover: 'yes' },
  { cuisine: ['southern'], avoid: ['meat'], have: ['rice'], stores: ['dollar'], leftover: 'no' },
  { cuisine: ['asian', 'mediterranean'], avoid: ['gluten', 'dairy'], have: ['oil', 'beans'], stores: ['corner', 'dollar'], leftover: 'sometimes' },
  { cuisine: ['american'], avoid: ['eggs', 'peanuts', 'fish'], have: ['oats', 'eggs', 'bread'], stores: ['full'], leftover: 'yes' },
];

export function allCases() {
  const out = [];
  let i = 0;
  for (const budget of budgets) for (const d of days) for (const p of people) for (const pref of prefs) {
    const region = regions[i % regions.length];
    out.push({ budget, days: d, people: p, region, ...pref });
    i++;
  }
  return out;
}

// Five hand-picked snapshots (the "pinned goldens").
export const GOLDEN = [
  { name: 'single-week-tight', budget: 25, days: 7, people: 1, region: 'south', cuisine: [], avoid: [], have: [], stores: [], leftover: 'sometimes' },
  { name: 'family-month-latin', budget: 400, days: 30, people: 4, region: 'south', cuisine: ['latin'], avoid: [], have: [], stores: ['dollar'], leftover: 'yes' },
  { name: 'vegetarian-two-weeks', budget: 120, days: 14, people: 2, region: 'west', cuisine: ['mediterranean'], avoid: ['meat', 'fish'], have: ['rice'], stores: [], leftover: 'no' },
  { name: 'corner-store-gluten-free', budget: 60, days: 7, people: 3, region: 'northeast', cuisine: ['asian'], avoid: ['gluten'], have: [], stores: ['corner'], leftover: 'sometimes' },
  { name: 'southern-month-solo', budget: 120, days: 30, people: 1, region: 'south', cuisine: ['southern'], avoid: [], have: [], stores: [], leftover: 'sometimes' },
];
