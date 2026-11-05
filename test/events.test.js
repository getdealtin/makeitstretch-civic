// Phase 4: anonymous events. What's accepted, what's dropped, and the admin totals.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import app from '../server.js';
import { memoryDb } from '../server/db.js';
import { cleanEvent, summarize, SCHEMA, CANT_USE } from '../server/events.js';

const S = 'abc123def456';
let server, base, db, cookie = '';
process.env.ADMIN_KEY = 'test-admin-key';
before(() => new Promise(r => { db = memoryDb(); app.locals.setDb(db); server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => server.close());
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });

test('unknown events, bad session codes and unknown fields are dropped', () => {
  assert.equal(cleanEvent({ event: 'steal_data', session_id: S }), null);
  assert.equal(cleanEvent({ event: 'page_view', session_id: 'short' }), null);
  assert.equal(cleanEvent({ event: 'page_view', session_id: 'ABCDEFGHIJKL' }), null, 'uppercase not allowed');
  const e = cleanEvent({ event: 'plan_built', session_id: S, lang: 'xx', data: {
    budget: 120, days: 14, people: 3, zip: '78702', store: 'corner', avoid: ['halal', 'nonsense'],
    email: 'a@b.c', name: 'Ana', phone: '5125550100', ip: '1.2.3.4', pppd: 2.857, cal_pct: 148 } });
  assert.equal(e.lang, 'en');
  assert.deepEqual(e.data, { budget: 120, days: 14, people: 3, zip: '78702', store: 'corner', avoid: ['halal'], pppd: 2.86, cal_pct: 148 });
  for (const k of ['email', 'name', 'phone', 'ip']) assert.ok(!(k in e.data), k);
});

test('no event type can carry a name, email, phone, address or IP field', () => {
  for (const [ev, spec] of Object.entries(SCHEMA)) {
    for (const k of Object.keys(spec)) assert.ok(!['name', 'email', 'phone', 'address', 'street', 'ip', 'ip_address', 'device', 'device_id', 'user_agent'].includes(k), `${ev}.${k}`);
  }
});

test('"can\'t use" reasons are grouped cultural / medical / practical, as the Food Plan splits them', () => {
  assert.deepEqual(Object.keys(CANT_USE), ['cultural', 'medical', 'practical']);
  assert.ok(cleanEvent({ event: 'cant_use', session_id: S, data: { item: 'drybeans', reason: 'halal' } }).data.reason);
  assert.deepEqual(cleanEvent({ event: 'cant_use', session_id: S, data: { item: 'not-a-food', reason: 'whatever' } }).data, {});
});

test('/api/event stores a clean event tagged with the city; bad events get 400', async () => {
  assert.equal((await post('/api/event?city=austin', { event: 'page_view', session_id: S, lang: 'es' })).status, 204);
  assert.equal((await post('/api/event?city=austin', { event: 'nope', session_id: S })).status, 400);
  const rows = await db.listEvents('austin', '2000-01-01');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].lang, 'es');
  assert.ok(!('ip' in rows[0]));
});

test('summary: visits, drop-off, budget pressure, shortfall routing, can\'t-use shares', () => {
  const t = '2026-11-05T12:00:00Z';
  const ev = (session_id, event, data = {}) => ({ session_id, event, lang: 'en', data, created_at: t });
  const a = summarize([
    ev('a', 'page_view'), ev('b', 'page_view'), ev('c', 'page_view'),
    ev('a', 'step_completed', { step: 'budget' }), ev('b', 'step_completed', { step: 'budget' }),
    ev('a', 'plan_built', { budget: 40, pppd: 2.86, zip: '78702', store: 'corner' }),
    ev('b', 'plan_built', { budget: 200, pppd: 9.5, zip: '78745', store: 'full' }),
    ev('a', 'help_clicked', { target: 'tx-snap', kind: 'resource', action: 'website' }),
    ev('c', 'box_built', { items: ['rice', 'drybeans', 'oats', 'tuna'], value: 9.5 }),
    ev('c', 'cant_use', { item: 'tuna', reason: 'kosher' }),
    ev('c', 'cant_use', { item: 'oats', reason: 'no_kitchen' }),
    ev('b', 'plan_reopened', { source: 'saved', kind: 'plan' }),
  ]);
  assert.equal(a.visits, 3);
  assert.equal(a.plans, 2);
  assert.equal(a.boxes, 1);
  assert.equal(a.budget_total, 240);
  assert.equal(a.box_value_total, 9.5);
  assert.deepEqual(a.pressure, { under_tfp: 1, tfp_to_snap: 0, over_snap: 1 });
  assert.deepEqual(a.shortfall, { sessions: 1, routed_benefits: 1, routed_food: 0 });
  assert.equal(a.cant_use.reports, 2);
  assert.equal(a.cant_use.box_items, 4);
  assert.deepEqual(a.cant_use.by_group, { cultural: 1, practical: 1 });
  assert.deepEqual(a.returns, { saved: 1 });
  assert.deepEqual(a.steps[0], ['budget', 2]);
});

test('admin summary includes activity for the chosen range', async () => {
  cookie = (await post('/api/admin/login', { password: 'test-admin-key' })).headers.get('set-cookie').split(';')[0];
  const s = await (await fetch(`${base}/api/admin/summary?city=austin&days=7`, { headers: { cookie } })).json();
  assert.equal(s.activity.available, true);
  assert.equal(s.activity.days, 7);
  assert.equal(s.activity.visits, 1);
});

test('privacy page is served and the policy lists every recorded detail in all four languages', async () => {
  assert.equal((await fetch(`${base}/privacy`)).status, 200);
  for (const code of ['en', 'es', 'vi', 'zh-Hans']) {
    const P = (await import(`../public/i18n/privacy/${code}.js`)).default;
    const en = (await import('../public/i18n/privacy/en.js')).default;
    assert.equal(P.sections.length, en.sections.length, `${code} has every section`);
    const all = JSON.stringify(P);
    assert.match(all, /getdealtin\.hq@gmail\.com/, `${code} contact email`);
    assert.match(all, /24/, `${code} retention`);
    assert.match(all, /15/, `${code} small-group rule`);
    assert.doesNotMatch(all, /Supabase|Render/, `${code} doesn't name service providers`);
  }
  const en = JSON.stringify((await import('../public/i18n/privacy/en.js')).default).toLowerCase();
  for (const word of ['budget', 'household size', 'zip code', 'dietary needs', 'food box', 'can’t use', 'recipes', 'language', 'ip address', 'do not sell', 'fewer than 15', '24 months'])
    assert.ok(en.includes(word), `policy mentions ${word}`);
});

test('footer links to the privacy policy on every resident page', () => {
  for (const f of ['index.html', 'provider.html', 'privacy.html']) {
    const html = readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
    if (f !== 'privacy.html') assert.match(html, /href="\/privacy"/, f);
  }
});
