// Home count line (Nov 22 2026): visits that made a plan, rounded down, hidden below 500 or on error.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app, { roundDown } from '../server.js';
import { memoryDb } from '../server/db.js';

let server, base;
before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => server.close());

test('rounds down to two significant figures, so the line is always true', () => {
  assert.equal(roundDown(1108), 1100);
  assert.equal(roundDown(1218), 1200);
  assert.equal(roundDown(1999), 1900);
  assert.equal(roundDown(23456), 23000);
  assert.equal(roundDown(512), 510);
  assert.equal(roundDown(80), 80);
});

test('memory db counts visits that made a plan, not plans', async () => {
  const db = memoryDb();
  for (const [s, c] of [['aaaaaaaaaaaa', 'national'], ['aaaaaaaaaaaa', 'national'], ['bbbbbbbbbbbb', 'austin'], ['cccccccccccc', 'national']])
    await db.insertEvent({ session_id: s, city_id: c, event: 'plan_built', lang: 'en', data: {} });
  await db.insertEvent({ session_id: 'dddddddddddd', city_id: 'national', event: 'page_view', lang: 'en', data: {} });
  assert.equal(await db.countPlanVisits(null), 3);
  assert.equal(await db.countPlanVisits('austin'), 1);
});

test('/api/count sends null under 500, so the line stays hidden', async () => {
  const r = await (await fetch(base + '/api/count')).json();
  assert.deepEqual(r, { households: null });
});

// SNAP box "You're not alone" line (Nov 22 2026): Census ACS 2020–2024, table B22003.
test('/api/snap-share: the ZIP code when SNAP use there is at least the U.S. share, else the U.S.', async () => {
  const get = async zip => (await fetch(base + '/api/snap-share?zip=' + zip)).json();
  assert.deepEqual(await get('60609'), { where: 'zip', zip: '60609', n: 4 }); // 6,395 of 22,884 households (28%)
  assert.deepEqual(await get('10001'), { where: 'us', n: 8 });                 // below the U.S. share
  assert.deepEqual(await get('00601'), { where: 'us', n: 8 });                 // Puerto Rico: no SNAP (NAP)
  assert.deepEqual(await get(''), { where: 'us', n: 8 });                      // no ZIP given
  assert.deepEqual(await get('abc'), { where: 'us', n: 8 });
});
