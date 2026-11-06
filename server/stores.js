// "Where to shop": stores near a ZIP code, from USDA's list of SNAP-authorized stores
// (data/snap-stores-travis.json, built by scripts/build-snap-stores.py), plus food-retail findings
// for the City report. Store data is about places, not people, so it is never suppressed.
//
// Only facts we can show are verified:
//   • "Takes SNAP": every store here is on USDA's SNAP-authorized list (as of the file's date).
//   • WIC, Double Up and hours: only where a city's config lists a verified note (store_notes).
//   • Distance: miles from the center of the person's ZIP code to the store, "about".
import { readFileSync } from 'node:fs';

const DATA = JSON.parse(readFileSync(new URL('../data/snap-stores-travis.json', import.meta.url), 'utf8'));
const ZIP_CENTERS = JSON.parse(readFileSync(new URL('../data/zip-centroids.json', import.meta.url), 'utf8'));
export const STORES = DATA.stores;
export const STORES_AS_OF = DATA.as_of;
// USDA Food Access Research Atlas: low-income and low-access tracts (built by scripts/build-food-access.py).
export const FOOD_ACCESS = JSON.parse(readFileSync(new URL('../data/food-access-travis.json', import.meta.url), 'utf8'));

const rad = d => (d * Math.PI) / 180;
export function miles(p, q) {
  const dLat = rad(q[0] - p[0]), dLon = rad(q[1] - p[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p[0])) * Math.cos(rad(q[0])) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Nearest grocery stores and farmers markets to a ZIP code's center.
 * notes: { [usda store name]: { wic?: true, double?: string, hours?: string } } from the city config.
 */
export function storesNear(zip, { notes = {}, grocery = 5, markets = 3, maxMiles = 10 } = {}) {
  const c = ZIP_CENTERS[zip];
  if (!c) return null;
  const withDist = STORES.filter(s => s.group === 'grocery' || s.group === 'market')
    .map(s => ({ ...s, miles: +miles(c, [s.lat, s.lon]).toFixed(1) }))
    .filter(s => s.miles <= maxMiles)
    .sort((a, b) => a.miles - b.miles || a.id - b.id);
  const pick = s => {
    const n = notes[s.usda_name] || {};
    return { id: s.id, name: s.name, addr: s.addr, zip: s.zip, miles: s.miles, type: s.group, full: s.full,
      membership: s.membership, wic: !!n.wic, double: n.double || null, hours: n.hours || null };
  };
  return {
    as_of: STORES_AS_OF, zip,
    grocery: withDist.filter(s => s.group === 'grocery').slice(0, grocery).map(pick),
    markets: withDist.filter(s => s.group === 'market').slice(0, markets).map(pick),
  };
}

/** Counts of SNAP-authorized stores by kind for a set of ZIP codes, and distance to the nearest full grocery. */
function mix(zips) {
  const inSet = STORES.filter(s => zips.includes(s.zip));
  const full = STORES.filter(s => s.full);
  const nearest = zips.filter(z => ZIP_CENTERS[z]).map(z => Math.min(...full.map(s => miles(ZIP_CENTERS[z], [s.lat, s.lon]))));
  const sorted = [...nearest].sort((a, b) => a - b);
  return {
    convenience: inSet.filter(s => s.group === 'convenience').length,
    full: inSet.filter(s => s.full).length,
    median_miles: sorted.length ? +sorted[Math.floor(sorted.length / 2)].toFixed(1) : null,
  };
}

/** Food-retail findings for the City report (focus ZIPs vs the rest of the county). */
export function retailFindings(focusZips = []) {
  if (!focusZips.length) return null;
  const countyZips = [...new Set(STORES.map(s => s.zip))];
  const rest = countyZips.filter(z => !focusZips.includes(z));
  const f = mix(focusZips), r = mix(rest);
  const ratio = m => (m.full ? +(m.convenience / m.full).toFixed(1) : null);
  const full = STORES.filter(s => s.full);
  const byZip = focusZips.map(z => {
    const here = STORES.filter(s => s.zip === z);
    const near = ZIP_CENTERS[z] ? Math.min(...full.map(s => miles(ZIP_CENTERS[z], [s.lat, s.lon]))) : null;
    return { zip: z, convenience: here.filter(s => s.group === 'convenience').length, full: here.filter(s => s.full).length,
      other_grocery: here.filter(s => s.group === 'grocery' && !s.full).length, markets: here.filter(s => s.group === 'market').length,
      dollar_or_other: here.filter(s => s.group === 'other').length, nearest_full_miles: near === null ? null : +near.toFixed(1) };
  });
  return { as_of: STORES_AS_OF, focus: { ...f, ratio: ratio(f), zips: focusZips.length }, rest: { ...r, ratio: ratio(r), zips: rest.length }, byZip, access: FOOD_ACCESS };
}
