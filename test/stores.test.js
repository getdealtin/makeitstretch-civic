// Where to shop (USDA SNAP store list) and the food-retail findings in the City report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storesNear, retailFindings, cityData, storeMix } from '../server/stores.js';
import { CITIES } from '../cities/index.js';
const austin = CITIES.austin; // as served: Austin's own listings plus the shared ones (cities/shared.js)
const { stores: STORES, storesAsOf: STORES_AS_OF } = cityData(austin);

test('store data is USDA SNAP-authorized stores in Travis County, as of Dec 31, 2025', () => {
  assert.equal(STORES_AS_OF, '2025-12-31');
  assert.ok(STORES.length > 600);
  assert.ok(STORES.every(s => s.lat && s.lon && /^\d{5}$/.test(s.zip)));
});

test('nearest stores for a ZIP: grocery stores and farmers markets, nearest first, with distance', () => {
  const r = storesNear(austin, '78702');
  assert.equal(r.grocery[0].name, 'H-E-B');
  assert.ok(r.grocery.every((s, i, a) => !i || a[i - 1].miles <= s.miles));
  assert.ok(r.markets.length > 0);
  assert.equal(storesNear(austin, '00000'), null);
});

test('makeitstretch.org: USDA’s national list (every U.S. grocery store and farmers market that takes SNAP)', () => {
  const { stores } = cityData(CITIES.national);
  assert.ok(stores.length > 60000);
  assert.ok(stores.every(s => s.group === 'grocery' || s.group === 'market'), 'convenience and dollar stores aren’t listed');
  const r = storesNear(CITIES.national, '10001');
  assert.equal(r.far, false);
  assert.equal(r.grocery.length, 5);
  assert.ok(r.grocery.every(s => s.miles <= 10 && s.state === 'NY' && s.city));
  assert.ok(r.grocery.every((s, i, a) => !i || a[i - 1].miles <= s.miles));
  assert.ok(r.grocery.every(s => !s.wic && !s.double && !s.hours), 'no unverified notes outside a city');
});

test('rural ZIP codes: with no grocery store within 10 miles, the nearest 3 within 30, marked far', () => {
  const mix = storeMix;
  const rural = Object.keys(JSON.parse(readFileSync(new URL('../data/store-mix-by-zip.json', import.meta.url))).zips)
    .find(z => { const m = mix(z); return m.nearest_full_miles > 12 && m.nearest_full_miles < 25 && (storesNear(CITIES.national, z)?.far); });
  const r = storesNear(CITIES.national, rural);
  assert.equal(r.far, true, rural);
  assert.ok(r.grocery.length >= 1 && r.grocery.length <= 3);
  assert.ok(r.grocery.every(s => s.miles > 10 && s.miles <= 30));
});

test('store mix per ZIP code agrees with the store list (nearest full grocery, stores inside the ZIP)', () => {
  const f = retailFindings(austin);
  for (const z of ['78721', '78725', '78702']) {
    const m = storeMix(z), local = f.byZip.find(x => x.zip === z);
    if (local) {
      assert.equal(m.full, local.full, z);
      assert.equal(m.convenience, local.convenience, z);
      assert.ok(Math.abs(m.nearest_full_miles - local.nearest_full_miles) <= 0.1, z);
    }
  }
  assert.equal(storeMix('00000'), null);
});

test('WIC, Double Up and hours show only on verified stores (SFC markets)', () => {
  const r = storesNear(austin, '78702');
  const all = [...r.grocery, ...r.markets];
  for (const s of all) {
    const sfc = s.name.startsWith("SFC Farmers' Market");
    assert.equal(s.wic, sfc, s.name);
    assert.equal(!!s.double, sfc, s.name);
    assert.equal(!!s.hours, sfc, s.name);
  }
});

test('report findings: counts by USDA store type; 78721 and 78725 have no supermarket or large grocery', () => {
  const f = retailFindings(austin);
  assert.equal(f.focus.zips, austin.focus_zips.length);
  assert.ok(f.focus.ratio > f.rest.ratio, 'more convenience stores per full grocery in the focus area');
  for (const z of ['78721', '78725']) assert.equal(f.byZip.find(x => x.zip === z).full, 0, z);
  assert.equal(retailFindings(CITIES.national), null);
});

test('USDA food access: the grant figure (33 tracts) is the 2015 edition; editions are labeled by what they measure', async () => {
  const FOOD_ACCESS = cityData(austin).access;
  assert.equal(FOOD_ACCESS.editions['2015'].lila, 33);
  assert.match(FOOD_ACCESS.editions['2025'].counts_distance_to, /convenience/);
  for (const y of ['2015', '2019']) assert.equal(FOOD_ACCESS.editions[y].counts_distance_to, 'supermarkets');
});
