// City resolution + /api/plan contract.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';
import { resolveCity, publicConfig, CITIES } from '../cities/index.js';

let server, base;
before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => server.close());

test('host picks the city; unknown hosts fall back', () => {
  assert.equal(resolveCity('austin.makeitstretch.org').id, 'austin');
  assert.equal(resolveCity('AUSTIN.makeitstretch.org:443').id, 'austin');
  assert.equal(resolveCity('example.com').id, 'national');
  assert.equal(resolveCity('example.com', undefined, 'austin').id, 'austin');
  assert.equal(resolveCity('example.com', 'austin').id, 'austin');
  assert.equal(resolveCity('example.com', 'nope').id, 'national');
});

test('every city card has the required keys', () => {
  const required = ['id', 'hosts', 'name', 'disclaimer', 'branding', 'languages', 'civic_layer', 'k_anon_threshold', 'resources', 'local_prices'];
  for (const c of Object.values(CITIES)) {
    for (const k of required) assert.ok(k in c, `${c.id} missing ${k}`);
    assert.equal(c.civic_layer, false);
    for (const tok of ['--violet', '--green', '--green-text', '--text', '--page']) assert.ok(c.branding.tokens[tok], `${c.id} ${tok}`);
  }
});

test('public config never leaks internal fields', () => {
  const pc = publicConfig(CITIES.austin);
  assert.ok(!('local_prices' in pc) && !('k_anon_threshold' in pc));
  assert.ok(pc.resources.every(r => !('verified' in r)));
});

test('austin disclaimer says it is not the City', () => {
  assert.match(CITIES.austin.disclaimer, /Not an official City of Austin/);
});

const plan = body => fetch(`${base}/api/plan?city=austin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('/api/plan builds a plan', async () => {
  const r = await plan({ budget: 120, days: 14, people: 2, cuisine: ['latin'], avoid: ['meat'] });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.weeks.flat().length, 14);
  assert.ok(j.summary.spent <= 120);
  assert.equal(j.prices.region, 'south');
  assert.deepEqual(j.input.avoid, ['meat']);
});

test('/api/plan rejects bad input and drops unknown values', async () => {
  assert.equal((await plan({ budget: 0, days: 7, people: 1 })).status, 400);
  assert.equal((await plan({ budget: 50, days: 99, people: 1 })).status, 400);
  const j = await (await plan({ budget: 50, days: 7, people: 1, avoid: ['meat', '<script>'], cuisine: 'latin,bogus' })).json();
  assert.deepEqual(j.input.avoid, ['meat']);
  assert.deepEqual(j.input.cuisine, ['latin']);
});

test('theme.css carries the city tokens', async () => {
  const css = await (await fetch(`${base}/theme.css?city=austin`)).text();
  assert.match(css, /--violet: #38377E/);
  assert.match(css, /font-family:'Zilla Slab'/);
});
