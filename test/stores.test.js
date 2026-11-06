// Where to shop (USDA SNAP store list) and the food-retail findings in the City report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storesNear, retailFindings, STORES, STORES_AS_OF } from '../server/stores.js';
import austin from '../cities/austin.js';

test('store data is USDA SNAP-authorized stores in Travis County, as of Dec 31, 2025', () => {
  assert.equal(STORES_AS_OF, '2025-12-31');
  assert.ok(STORES.length > 600);
  assert.ok(STORES.every(s => s.lat && s.lon && /^\d{5}$/.test(s.zip)));
});

test('nearest stores for a ZIP: grocery stores and farmers markets, nearest first, with distance', () => {
  const r = storesNear('78702', { notes: austin.store_notes });
  assert.equal(r.grocery[0].name, 'H-E-B');
  assert.ok(r.grocery.every((s, i, a) => !i || a[i - 1].miles <= s.miles));
  assert.ok(r.markets.length > 0);
  assert.equal(storesNear('00000'), null);
});

test('WIC, Double Up and hours show only on verified stores (SFC markets)', () => {
  const r = storesNear('78702', { notes: austin.store_notes });
  const all = [...r.grocery, ...r.markets];
  for (const s of all) {
    const sfc = s.name.startsWith("SFC Farmers' Market");
    assert.equal(s.wic, sfc, s.name);
    assert.equal(!!s.double, sfc, s.name);
    assert.equal(!!s.hours, sfc, s.name);
  }
});

test('report findings: counts by USDA store type; 78721 and 78725 have no supermarket or large grocery', () => {
  const f = retailFindings(austin.focus_zips);
  assert.equal(f.focus.zips, austin.focus_zips.length);
  assert.ok(f.focus.ratio > f.rest.ratio, 'more convenience stores per full grocery in the focus area');
  for (const z of ['78721', '78725']) assert.equal(f.byZip.find(x => x.zip === z).full, 0, z);
  assert.equal(retailFindings([]), null);
});

test('USDA food access: the grant figure (33 tracts) is the 2015 edition; editions are labeled by what they measure', async () => {
  const { FOOD_ACCESS } = await import('../server/stores.js');
  assert.equal(FOOD_ACCESS.editions['2015'].lila, 33);
  assert.match(FOOD_ACCESS.editions['2025'].counts_distance_to, /convenience/);
  for (const y of ['2015', '2019']) assert.equal(FOOD_ACCESS.editions[y].counts_distance_to, 'supermarkets');
});
