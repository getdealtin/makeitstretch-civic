// Phase 5: City report suppression, exports, source tags, outcome question.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';
import { memoryDb } from '../server/db.js';
import { suppress, cityReport, reportCsv, directoryCsv, rolesOf, DEFAULT_FRAMEWORK, METRICS } from '../server/report.js';
import austin from '../cities/austin.js';
import { cleanEvent } from '../server/events.js';

const K = 15;
const AUS = { roles: rolesOf(austin.resources), framework: austin.report };
const t = '2026-11-05T12:00:00Z';
const sid = i => String(i).padStart(12, 'a').slice(-12).replace(/[^a-z0-9]/g, 'a');
const ev = (i, event, data = {}) => ({ session_id: 's' + String(i).padStart(11, '0'), event, lang: 'en', data, created_at: t });

test('cells under k are hidden', () => {
  assert.deepEqual(suppress([['a', 20], ['b', 14], ['c', 15]], K), [['a', 20], ['b', null], ['c', 15]]);
});

test('secondary suppression: one hidden cell plus a shown total → next smallest is hidden too', () => {
  const rows = suppress([['a', 40], ['b', 20], ['c', 3]], K, { total: 63 });
  assert.deepEqual(rows, [['a', 40], ['b', null], ['c', null]]);
  // two already hidden: nothing more to hide
  assert.deepEqual(suppress([['a', 40], ['b', 5], ['c', 3]], K, { total: 48 }), [['a', 40], ['b', null], ['c', null]]);
});

test('report counts people, not clicks, and hides small groups', () => {
  const events = [];
  for (let i = 0; i < 30; i++) {
    events.push(ev(i, 'page_view'));
    events.push(ev(i, 'plan_built', { zip: i < 20 ? '78702' : '78745', pppd: i < 18 ? 3 : 8, store: i < 16 ? 'corner' : 'full' }));
    // one person tapping SNAP five times still counts once
    if (i < 16) for (let j = 0; j < 5; j++) events.push(ev(i, 'help_clicked', { target: 'tx-snap', kind: 'resource', action: 'website' }));
  }
  const r = cityReport(events, { k: K, providers: [{ kind: 'pantry' }, { kind: 'fridge' }], from: '2026-11-01', to: '2026-11-30', city: 'Austin', ...AUS });
  assert.deepEqual(r.overview[0], ['Visits', 30]);
  const access = r.sections.find(s => s.goal.startsWith('Goal 6'));
  const byZip = access.tables.find(x => x.title === 'People by ZIP code').rows;
  assert.deepEqual(byZip, [['78702', 20], ['78745', null]], '10 people in 78745 → hidden');
  const nav = r.sections.find(s => s.goal.includes('6.6')).tables[0].rows;
  assert.deepEqual(nav[0], ['Tapped SNAP or WIC', 16], 'people, not 80 taps');
  const goal9 = r.sections.find(s => s.goal.startsWith('Goal 9')).tables[0].rows;
  assert.deepEqual(goal9, [['pantry', 1], ['fridge', 1]], 'organizations are not suppressed');
  assert.ok(r.limits.some(l => l.includes('among people who used the tool')));
});

test('no number under k appears anywhere in the report (people tables)', () => {
  const events = [];
  for (let i = 0; i < 22; i++) {
    events.push(ev(i, 'page_view'));
    events.push(ev(i, 'box_built', { items: ['rice', 'tuna'] }));
    events.push(ev(i, 'cant_use', { item: i < 16 ? 'tuna' : 'rice', reason: i < 16 ? 'kosher' : 'allergy' }));
  }
  const r = cityReport(events, { k: K, from: 'a', to: 'b', city: 'Austin', ...AUS });
  for (const s of r.sections) if (!s.goal.startsWith('Goal 9'))
    for (const tb of s.tables) for (const [, v] of tb.rows) assert.ok(v === null || v >= K, `${tb.title}: ${v}`);
  for (const [, v] of r.overview.slice(0, 4)) assert.ok(v === null || v >= K);
});

test('CSV marks hidden cells as <15; CTFB file never includes contact details', () => {
  const r = cityReport([], { k: K, from: 'a', to: 'b', city: 'Austin' });
  assert.match(reportCsv(r), /"Visits","<15"/);
  const csv = directoryCsv([{ name: 'Eastside Pantry', kind: 'pantry', zip: '78702', languages: ['es', 'en'], contact_email: 'secret@x.org', contact_phone: '555', admin_note: 'private' }]);
  assert.match(csv, /"Eastside Pantry"/);
  assert.match(csv, /"es; en"/);
  for (const secret of ['secret@x.org', 'private', 'contact']) assert.ok(!csv.includes(secret), secret);
});

test('another city: no framework → neutral layout; its own resource ids count by role', () => {
  const events = [];
  for (let i = 0; i < 20; i++) {
    events.push(ev(i, 'page_view'));
    events.push(ev(i, 'help_clicked', { target: 'mn-snap', kind: 'resource', action: 'website' }));
  }
  const roles = rolesOf([{ id: 'mn-snap', role: 'benefits' }, { id: 'mn-foodshelf', role: 'food_help' }, { id: 'other' }]);
  assert.deepEqual(roles, { benefits: ['mn-snap'], food_help: ['mn-foodshelf'] });
  const r = cityReport(events, { k: K, from: 'a', to: 'b', city: 'Minneapolis', roles });
  assert.deepEqual(r.sections.map(s => s.goal), DEFAULT_FRAMEWORK.sections.map(s => s.goal));
  assert.ok(!r.sections.some(s => /Goal|Strategy/.test(s.goal)), 'no Austin Food Plan wording');
  const routed = r.sections.find(s => s.goal === 'Benefits and food help').tables[0].rows;
  assert.deepEqual(routed[0], ['Tapped a benefits link', 20]);
});

test('every metric a city framework lists exists in the shared library', () => {
  for (const fw of [DEFAULT_FRAMEWORK, austin.report]) for (const s of fw.sections) for (const id of s.metrics) assert.ok(METRICS[id], id);
  // Austin's grant layout is unchanged
  assert.deepEqual(austin.report.sections.map(s => s.goal).slice(0, 3), ['Goal 6 · Access', 'Strategy 6.6 · Benefits navigation', 'Goal 4 · Preparedness (strategy 4.2)']);
});

test('outcome answers and source tags validate', () => {
  assert.deepEqual(cleanEvent({ event: 'plan_outcome', session_id: 'abc123def456', data: { answer: 'some', kind: 'plan' } }).data, { answer: 'some', kind: 'plan' });
  assert.deepEqual(cleanEvent({ event: 'plan_outcome', session_id: 'abc123def456', data: { answer: 'maybe' } }).data, {});
});

let server, base, db, cookie;
before(() => new Promise(r => { db = memoryDb(); app.locals.setDb(db); process.env.ADMIN_KEY = 'test-admin-key'; server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => server.close());

test('source tags: allowed tags kept, unknown tags dropped', async () => {
  const post = body => fetch(`${base}/api/event?city=austin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  await post({ event: 'page_view', session_id: 'abc123def456', data: { src: 'library' } });
  await post({ event: 'page_view', session_id: 'abc123def457', data: { src: 'evil-tracker' } });
  const rows = await db.listEvents('austin', '2000-01-01');
  assert.equal(rows[0].data.src, 'library');
  assert.ok(!('src' in rows[1].data));
});

test('report and exports are admin-only; CSV downloads work when signed in', async () => {
  assert.equal((await fetch(`${base}/api/admin/report?city=austin`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/directory.csv?city=austin`)).status, 401);
  cookie = (await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'test-admin-key' }) })).headers.get('set-cookie').split(';')[0];
  const r = await (await fetch(`${base}/api/admin/report?city=austin&from=2026-01-01&to=2030-01-01`, { headers: { cookie } })).json();
  assert.equal(r.k, 15);
  const csv = await fetch(`${base}/api/admin/report.csv?city=austin`, { headers: { cookie } });
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.headers.get('content-disposition'), /attachment/);
});
