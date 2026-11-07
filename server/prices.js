// Live grocery prices from the U.S. Bureau of Labor Statistics (BLS) Average Price series.
// https://www.bls.gov/cpi/factsheets/average-prices.htm
//
// Series id = 'APU' + region + item. BLS prices are per pound (or per dozen / per gallon); our
// foods are packages, so each item carries how many of BLS's units are in our package.
// Item codes verified Nov 2026 against the series titles on FRED / data.bls.gov and current values.
// Foods without a current BLS series (peanut butter, tuna, oats, canned goods…) keep the
// built-in estimates in engine/food-db.js (recipe foods: engine/extra-foods.js, with sources).

/** food id → [BLS item code, BLS units per package, what BLS measures] */
export const BLS_ITEMS = {
  rice:       ['701312', 2,    'Rice, white, long grain, uncooked, per lb (our bag: 2 lb)'],
  drybeans:   ['714233', 1,    'Beans, dried, any type, per lb (1 lb bag)'],
  flour:      ['701111', 5,    'Flour, white, all purpose, per lb (5 lb bag)'],
  pasta:      ['701322', 1,    'Spaghetti and macaroni, per lb (1 lb box)'],
  bread:      ['702111', 1.25, 'Bread, white, pan, per lb (20 oz loaf)'],
  eggs:       ['708111', 1,    'Eggs, grade A, large, per dozen'],
  milk:       ['709112', 1,    'Milk, fresh, whole, fortified, per gallon'],
  chicken:    ['706111', 2,    'Chicken, fresh, whole, per lb (2 lb of leg quarters, which usually cost a bit less)'],
  groundbeef: ['703112', 1,    'Ground beef, 100% beef, per lb'],
  cheese:     ['710212', 0.5,  'Cheddar cheese, natural, per lb (8 oz bag)'],
  potatoes:   ['712112', 5,    'Potatoes, white, per lb (5 lb bag)'],
  bananas:    ['711211', 2.2,  'Bananas, per lb (about 6 bananas)'],
  oranges:    ['711311', 2,    'Oranges, navel, per lb (4 oranges)'],
  // Foods the NHLBI recipes need (Nov 2026; titles checked on FRED, values Sept 2026).
  chickenbreast: ['FF1101', 1, 'Chicken breast, boneless, per lb'],
  drumsticks: ['706212', 2,    'Chicken legs, bone-in, per lb (includes drumsticks; our pack: 2 lb)'],
  sirloin:    ['703613', 1,    'Steak, sirloin, USDA choice, boneless, per lb'],
  roundroast: ['703311', 2,    'Beef roasts, round, USDA choice, boneless, per lb (our roast: 2 lb)'],
  tomatoes:   ['712311', 1,    'Tomatoes, field grown, per lb'],
};

/** Date the series codes above were last verified (shown in /admin, Annual updates). */
export const BLS_CHECKED = '2026-11-05';

/** Census region → BLS area code (Northeast 0100, Midwest 0200, South 0300, West 0400). */
export const BLS_REGION = { northeast: '0100', midwest: '0200', south: '0300', west: '0400', national: '0000' };

export const seriesFor = region => Object.values(BLS_ITEMS).map(([item]) => `APU${BLS_REGION[region] || '0000'}${item}`);

/**
 * BLS values (series id → price per BLS unit) → package prices for our foods.
 * Safety check: a live price under half or over double our estimate is ignored, so a wrong
 * series code or a bad month can't distort plans.
 */
export function toPackagePrices(bySeries, region, estimates) {
  const code = BLS_REGION[region] || '0000';
  const out = {};
  for (const [food, [item, units]] of Object.entries(BLS_ITEMS)) {
    const v = bySeries[`APU${code}${item}`];
    if (!(v > 0)) continue;
    const pkg = +(v * units).toFixed(2);
    const est = estimates?.[food];
    if (est && (pkg < est * 0.5 || pkg > est * 2)) continue;
    out[food] = pkg;
  }
  return out;
}
