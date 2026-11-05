// Live BLS prices: verified series, pound→package conversion, region codes, safety check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLS_ITEMS, BLS_REGION, seriesFor, toPackagePrices } from '../server/prices.js';
import { FALLBACK_PRICES, FOOD_DB } from '../engine/index.js';

test('region codes match BLS (Northeast 0100 … West 0400)', () => {
  assert.deepEqual(BLS_REGION, { northeast: '0100', midwest: '0200', south: '0300', west: '0400', national: '0000' });
  assert.ok(seriesFor('south').includes('APU0300701312'), 'South rice');
});

test('the codes that were wrong are fixed', () => {
  assert.equal(BLS_ITEMS.rice[0], '701312');      // was 712112 (white potatoes)
  assert.equal(BLS_ITEMS.potatoes[0], '712112');  // was 711311 (navel oranges)
  assert.ok(!('cannedtomatoes' in BLS_ITEMS));     // was 717311 (coffee)
  assert.ok(!('peanutbutter' in BLS_ITEMS));       // was 715211 (sugar)
  for (const id of Object.keys(BLS_ITEMS)) assert.ok(FOOD_DB.some(f => f.id === id), id);
});

test('per-pound prices become package prices; out-of-range values are ignored', () => {
  // September 2026 South values: rice $1.218/lb, potatoes $0.989/lb (U.S.), eggs $2.272/dozen
  const p = toPackagePrices({ APU0300701312: 1.218, APU0300712112: 0.989, APU0300708111: 2.272, APU0300709112: 40 }, 'south', FALLBACK_PRICES.south);
  assert.equal(p.rice, 2.44);       // 2 lb bag
  assert.equal(p.potatoes, 4.95);   // 5 lb bag
  assert.equal(p.eggs, 2.27);       // dozen
  assert.ok(!('milk' in p), 'a $40 gallon of milk is rejected by the safety check');
});
