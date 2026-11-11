// Live BLS prices through an outage (server/live-prices.js): fresh prices are used for a day, a failed
// ask keeps the last good prices and isn't repeated for 15 minutes, saved prices survive a restart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLivePrices, FRESH_MS, RETRY_MS, STALE_MS } from '../server/live-prices.js';
import { memoryDb } from '../server/db.js';
import { livePriceItems } from '../server/directory.js';

const quiet = fn => async () => { const w = console.warn; console.warn = () => {}; try { await fn(); } finally { console.warn = w; } };
function setup({ answers, store = null }) {
  let t = Date.parse('2026-11-11T12:00:00Z');
  const asks = [];
  const lp = makeLivePrices({
    fetchPrices: async region => { asks.push(region); const a = answers.shift(); if (a instanceof Error) throw a; return a ?? null; },
    store, now: () => t,
  });
  return { lp, asks, later: ms => { t += ms; } };
}

test('fresh prices are used for a day without asking BLS again', quiet(async () => {
  const { lp, asks, later } = setup({ answers: [{ rice: 2.49 }, { rice: 2.59 }] });
  assert.deepEqual(await lp.get('south'), { rice: 2.49 });
  later(FRESH_MS - 1000);
  assert.deepEqual(await lp.get('south'), { rice: 2.49 });
  assert.equal(asks.length, 1);
  later(2000);
  assert.deepEqual(await lp.get('south'), { rice: 2.59 });
  assert.equal(asks.length, 2);
}));

test('BLS down: the last good prices are kept, and BLS is not asked again for 15 minutes', quiet(async () => {
  const { lp, asks, later } = setup({ answers: [{ rice: 2.49 }, null, new Error('timeout'), { rice: 2.69 }] });
  await lp.get('south');
  later(FRESH_MS + 1);
  assert.deepEqual(await lp.get('south'), { rice: 2.49 }, 'kept after a failed ask');
  for (let i = 0; i < 20; i++) assert.deepEqual(await lp.get('south'), { rice: 2.49 });
  assert.equal(asks.length, 2, 'twenty more visitors, no more asks');
  later(RETRY_MS + 1);
  assert.deepEqual(await lp.get('south'), { rice: 2.49 }, 'still down');
  assert.equal(asks.length, 3);
  later(RETRY_MS + 1);
  assert.deepEqual(await lp.get('south'), { rice: 2.69 }, 'back up');
}));

test('never had prices and BLS is down: null (built-in averages), and no ask for 15 minutes', quiet(async () => {
  const { lp, asks } = setup({ answers: [null] });
  assert.equal(await lp.get('west'), null);
  assert.equal(await lp.get('west'), null);
  assert.equal(asks.length, 1);
}));

test('many visitors at once while BLS is slow: one ask, not one each', quiet(async () => {
  const { lp, asks } = setup({ answers: [{ rice: 2.49 }] });
  const all = await Promise.all(Array.from({ length: 10 }, () => lp.get('south')));
  assert.equal(asks.length, 1);
  assert.ok(all.every(p => p.rice === 2.49));
}));

test('saved prices survive a restart, even with BLS down', quiet(async () => {
  const db = memoryDb();
  const store = { load: r => db.getPriceCache(r), save: (r, p, at) => db.savePriceCache(r, p, at) };
  const first = setup({ answers: [{ rice: 2.49 }], store });
  await first.lp.get('south');
  const restarted = setup({ answers: [null], store }); // a new server process, BLS down
  restarted.later(FRESH_MS + 1);
  assert.deepEqual(await restarted.lp.get('south'), { rice: 2.49 });
  assert.equal(restarted.asks.length, 1);
}));

test('the admin page flags prices more than 3 days old', quiet(async () => {
  const { lp, later } = setup({ answers: [{ rice: 2.49 }, null] });
  await lp.get('south');
  assert.equal(livePriceItems(lp.status())[0].status, 'ok');
  later(STALE_MS + 1);
  await lp.get('south');
  const [item] = livePriceItems(lp.status());
  assert.equal(item.status, 'due');
  assert.match(item.what, /last good prices/);
  assert.deepEqual(livePriceItems(null), [], 'no BLS key: no line');
}));
