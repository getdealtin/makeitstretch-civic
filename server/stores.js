// "Where to shop": stores near a ZIP code, from USDA's list of SNAP-authorized stores, plus food-retail
// findings for the City report. Store data is about places, not people, so it is never suppressed.
//
// Each city names its own data files in its config (`local.stores`, `local.food_access`; built by
// scripts/build-snap-stores.py and scripts/build-food-access.py). A city without them simply has no
// "Where to shop" panel and no store tables in its report: nothing falls back to another city's data.
//
// Only facts we can show are verified:
//   • "Takes SNAP": every store here is on USDA's SNAP-authorized list (as of the file's date).
//   • WIC, Double Up and hours: only where a city's config lists a verified note (store_notes).
//   • Distance: miles from the center of the person's ZIP code to the store, "about".
import { readFileSync } from 'node:fs';

const readData = file => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'));
const ZIP_CENTERS = readData('zip-centroids.json');

/** A city's store list and food-access data, read once per city. null parts mean the city has none. */
const cache = new Map();
export function cityData(city) {
  if (!cache.has(city.id)) {
    const stores = city.local?.stores ? readData(city.local.stores) : null;
    cache.set(city.id, {
      stores: stores?.stores || null,
      storesAsOf: stores?.as_of || null,
      access: city.local?.food_access ? readData(city.local.food_access) : null,
    });
  }
  return cache.get(city.id);
}

/** Great-circle distance in miles between two [lat, lon] points. */
const rad = d => (d * Math.PI) / 180;
export function miles(p, q) {
  const dLat = rad(q[0] - p[0]), dLon = rad(q[1] - p[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p[0])) * Math.cos(rad(q[0])) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Nearest grocery stores and farmers markets to a ZIP code's center, for a city.
 * Notes come from the city config: { [usda store name]: { wic?: true, double?: string, hours?: string } }.
 * Returns null when the city has no store list or the ZIP code is unknown.
 */
export function storesNear(city, zip, { grocery = 5, markets = 3, maxMiles = 10 } = {}) {
  const { stores, storesAsOf } = cityData(city);
  const c = ZIP_CENTERS[zip];
  if (!stores || !c) return null;
  const notes = city.store_notes || {};
  const withDist = stores.filter(s => s.group === 'grocery' || s.group === 'market')
    .map(s => ({ ...s, miles: +miles(c, [s.lat, s.lon]).toFixed(1) }))
    .filter(s => s.miles <= maxMiles)
    .sort((a, b) => a.miles - b.miles || a.id - b.id);
  const pick = s => {
    const n = notes[s.usda_name] || {};
    return { id: s.id, name: s.name, addr: s.addr, zip: s.zip, miles: s.miles, type: s.group, full: s.full,
      membership: s.membership, wic: !!n.wic, double: n.double || null, hours: n.hours || null };
  };
  return {
    as_of: storesAsOf, zip,
    grocery: withDist.filter(s => s.group === 'grocery').slice(0, grocery).map(pick),
    markets: withDist.filter(s => s.group === 'market').slice(0, markets).map(pick),
  };
}

/** Counts of SNAP-authorized stores by kind for a set of ZIP codes, and distance to the nearest full grocery. */
function mix(stores, zips) {
  const inSet = stores.filter(s => zips.includes(s.zip));
  const full = stores.filter(s => s.full);
  const nearest = zips.filter(z => ZIP_CENTERS[z]).map(z => Math.min(...full.map(s => miles(ZIP_CENTERS[z], [s.lat, s.lon]))));
  const sorted = [...nearest].sort((a, b) => a - b);
  return {
    convenience: inSet.filter(s => s.group === 'convenience').length,
    full: inSet.filter(s => s.full).length,
    median_miles: sorted.length ? +sorted[Math.floor(sorted.length / 2)].toFixed(1) : null,
  };
}

/**
 * Food-retail findings for the City report: the city's focus ZIP codes vs the rest of its county.
 * null when the city has no focus area or no store list.
 */
export function retailFindings(city) {
  const focusZips = city.focus_zips || [];
  const { stores, storesAsOf, access } = cityData(city);
  if (!focusZips.length || !stores) return null;
  const rest = [...new Set(stores.map(s => s.zip))].filter(z => !focusZips.includes(z));
  const f = mix(stores, focusZips), r = mix(stores, rest);
  const ratio = m => (m.full ? +(m.convenience / m.full).toFixed(1) : null);
  const full = stores.filter(s => s.full);
  const byZip = focusZips.map(z => {
    const here = stores.filter(s => s.zip === z);
    const near = ZIP_CENTERS[z] ? Math.min(...full.map(s => miles(ZIP_CENTERS[z], [s.lat, s.lon]))) : null;
    return { zip: z, convenience: here.filter(s => s.group === 'convenience').length, full: here.filter(s => s.full).length,
      other_grocery: here.filter(s => s.group === 'grocery' && !s.full).length, markets: here.filter(s => s.group === 'market').length,
      dollar_or_other: here.filter(s => s.group === 'other').length, nearest_full_miles: near === null ? null : +near.toFixed(1) };
  });
  return { as_of: storesAsOf, focus: { ...f, ratio: ratio(f), zips: focusZips.length }, rest: { ...r, ratio: ratio(r), zips: rest.length }, byZip, access };
}
