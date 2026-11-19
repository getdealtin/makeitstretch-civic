// One site (owner decision, Nov 19 2026): makeitstretch.org runs the tool for everyone; a partner city's
// ZIP code switches the visitor onto that city. ONE_SITE=off brings back the old landing page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { CITIES, PARTNERS, partnerFor, publicConfig } from '../cities/index.js';
import { zipToInfo } from '../engine/index.js';

test('the main site lists partner cities and their ZIP codes; city sites do not', () => {
  const main = publicConfig(CITIES.national, { oneSite: true });
  assert.deepEqual(main.partners, [{ id: 'austin', place: 'Austin', region: 'TX' }]);
  assert.equal(main.partner_zips['78702'], 'austin');
  assert.equal(main.partner_zips['58102'], undefined);
  assert.deepEqual(main.languages, ['en', 'es', 'vi', 'zh-Hans']);
  assert.equal(publicConfig(CITIES.austin, { oneSite: true }).partner_zips, undefined);
  assert.equal(publicConfig(CITIES.national, { oneSite: false }).partner_zips, undefined);
});

test('switching by ?city= works only from the main site, only to a partner city', () => {
  assert.equal(partnerFor(CITIES.national, 'austin')?.id, 'austin');
  assert.equal(partnerFor(CITIES.national, 'national'), null);
  assert.equal(partnerFor(CITIES.national, 'nowhere'), null);
  assert.equal(partnerFor(CITIES.national, ['austin']), null);
  assert.equal(partnerFor(CITIES.austin, 'austin'), null);
});

test('every partner ZIP code is a real ZIP in the partner\'s state', () => {
  for (const c of PARTNERS) for (const z of c.zips) {
    assert.match(z, /^\d{5}$/);
    assert.equal(zipToInfo(z)?.state, c.region, z);
  }
  assert.equal(zipToInfo('58102').state, 'ND');
  assert.equal(zipToInfo('58102').region, 'midwest');
});

test('the main site\'s help links and every language are filled in', () => {
  const n = CITIES.national;
  for (const r of n.resources) assert.match(r.url, /^https:\/\//, r.id);
  assert.ok(!n.resources.some(r => /benefits\.gov/.test(r.url)), 'Benefits.gov closed in 2024');
  for (const l of ['es', 'vi', 'zh-Hans']) {
    assert.ok(n.i18n[l].disclaimer && n.i18n[l].tagline, l);
    for (const r of n.resources) assert.ok(n.i18n[l].resources[r.id]?.name && n.i18n[l].resources[r.id]?.description, `${l} ${r.id}`);
  }
});

test('rollback: ONE_SITE=off shows the old landing page on the bare domain', async () => {
  const child = spawn(process.execPath, ['--input-type=module', '-e',
    "const { default: app } = await import('./server.js'); const s = app.listen(0, () => console.log('PORT ' + s.address().port));"],
  { env: { ...process.env, ONE_SITE: 'off' }, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    const port = await new Promise((ok, no) => {
      let out = '';
      child.stdout.on('data', d => { out += d; const m = out.match(/PORT (\d+)/); if (m) ok(Number(m[1])); });
      child.on('exit', () => no(new Error('server exited')));
    });
    const get = (host, path = '/') => new Promise((ok, no) => http.get({ port, path, headers: { host } }, res => {
      let b = ''; res.on('data', c => { b += c; }); res.on('end', () => ok(b));
    }).on('error', no));
    assert.match(await get('makeitstretch.org'), /id="hero-title"/);
    assert.match(await get('austin.makeitstretch.org'), /id="app"/);
    const cfg = JSON.parse(await get('makeitstretch.org', '/api/config'));
    assert.equal(cfg.partner_zips, undefined);
    assert.equal(JSON.parse(await get('makeitstretch.org', '/api/health')).one_site, false);
  } finally { child.kill(); }
});

test('a ZIP code typed later moves that plan\'s or box\'s activity from the main site to the partner city', async () => {
  const { default: express } = await import('express');
  const { mountEvents } = await import('../server/events.js');
  const { memoryDb } = await import('../server/db.js');
  const db = memoryDb();
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.city = CITIES[req.headers['x-city'] || 'national']; next(); });
  mountEvents(app, { getDb: () => db, oneSite: true });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, city) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(city ? { 'x-city': city } : {}) }, body: JSON.stringify(body) });
  try {
    const sid = 'abcdefghijk1', other = 'zzzzzzzzzzz9';
    await post('/api/event', { event: 'page_view', session_id: sid, data: {} });
    await new Promise(r => setTimeout(r, 30));
    const since = new Date().toISOString();
    await new Promise(r => setTimeout(r, 30));
    await post('/api/event', { event: 'box_built', session_id: sid, data: { items: ['rice'] } });
    await post('/api/event', { event: 'cant_use', session_id: sid, data: { item: 'rice', reason: 'allergy' } });
    await post('/api/event', { event: 'box_built', session_id: other, data: { items: ['oats'] } });
    // refused: not a partner ZIP, bad visit code, from a city's own site, or a start time from days ago
    for (const [body, city] of [[{ session_id: sid, zip: '58102', since }], [{ session_id: 'bad', zip: '78702', since }],
      [{ session_id: sid, zip: '78702', since }, 'austin'], [{ session_id: sid, zip: '78702', since: '2020-01-01T00:00:00Z' }]]) {
      assert.equal((await post('/api/event/move', body, city)).status, 400, JSON.stringify(body));
    }
    assert.equal((await post('/api/event/move', { session_id: sid, zip: '78702', since })).status, 204);
    const iso = new Date(Date.now() - 60e3).toISOString();
    const austin = await db.listEvents('austin', iso), main = await db.listEvents('national', iso);
    assert.deepEqual(austin.map(e => e.event).sort(), ['box_built', 'cant_use']); // this box and its answer moved
    assert.deepEqual(main.map(e => `${e.event}:${e.session_id}`).sort(), [`box_built:${other}`, `page_view:${sid}`]); // the visit before it, and other visits, stay
  } finally { server.close(); }
});
