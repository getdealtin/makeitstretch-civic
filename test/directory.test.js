// Food directory + admin: sign-up → review → public listing, and the guardrails.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';
import { memoryDb, supabaseDb } from '../server/db.js';
import { cleanProvider, byZip, isOverdue, zipMiles } from '../server/directory.js';

let server, base, cookie = '';
process.env.ADMIN_KEY = 'test-admin-key';

before(() => new Promise(r => {
  app.locals.setDb(memoryDb());
  server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); });
}));
after(() => server.close());

const post = (path, body, headers = {}) => fetch(base + path, {
  method: 'POST', headers: { 'content-type': 'application/json', cookie, ...headers }, body: JSON.stringify(body),
});
const get = path => fetch(base + path, { headers: { cookie } });
const site = (over = {}) => ({
  name: 'Eastside Community Pantry', kind: 'pantry', address: '123 E 12th St', zip: '78702',
  hours: 'Tue & Thu 4–7pm', access: 'walkup', id_required: 'no', languages: ['en', 'es'], offers: ['groceries', 'produce'],
  contact_name: 'Ana', contact_email: 'ana@example.org', ...over,
});

test('admin API is locked until signed in; wrong password refused', async () => {
  assert.equal((await get('/api/admin/summary?city=austin')).status, 401);
  assert.equal((await post('/api/admin/login', { password: 'nope' })).status, 401);
  const r = await post('/api/admin/login', { password: 'test-admin-key' });
  assert.equal(r.status, 200);
  const set = r.headers.get('set-cookie');
  assert.match(set, /HttpOnly/); assert.match(set, /SameSite=Strict/);
  assert.ok(!set.includes('test-admin-key'), 'cookie never holds the key itself');
  cookie = set.split(';')[0];
  assert.equal((await get('/api/admin/summary?city=austin')).status, 200);
});

test('cross-site writes to the admin API are refused', async () => {
  const r = await post('/api/admin/invites', { org_name: 'X', city: 'austin' }, { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('public sign-up goes to review, never straight to the site', async () => {
  const r = await post('/api/providers/submit?city=austin', site());
  assert.deepEqual(await r.json(), { ok: true });
  assert.deepEqual(await (await get('/api/providers?city=austin')).json(), [], 'not public before approval');
  const s = await (await get('/api/admin/summary?city=austin')).json();
  assert.equal(s.pending.length, 1);
  assert.equal(s.pending[0].source, 'public');
  assert.equal(s.pending[0].contact_email, 'ana@example.org');
});

test('invite link: shows the org name, submission is tagged and still needs review', async () => {
  const inv = await (await post('/api/admin/invites', { org_name: 'St. James Food Closet', city: 'austin' })).json();
  assert.match(inv.link, /^https:\/\/austin\.makeitstretch\.org\/join\/[A-Za-z0-9_-]+$/);
  const token = inv.link.split('/join/')[1];
  assert.deepEqual(await (await get(`/api/invite/${token}?city=austin`)).json(), { ok: true, org_name: 'St. James Food Closet' });
  assert.equal((await get('/api/invite/notarealtoken123?city=austin')).status, 404);
  await post('/api/providers/submit?city=austin', site({ name: 'St. James Food Closet', zip: '78721', token }));
  const s = await (await get('/api/admin/summary?city=austin')).json();
  const sub = s.pending.find(p => p.name === 'St. James Food Closet');
  assert.equal(sub.source, 'invite');
  assert.equal(sub.status, 'pending', 'invite submissions also wait for review');
  const i = s.invites.find(x => x.org_name === 'St. James Food Closet');
  assert.ok(i.used_at);
  assert.equal(i.submission.name, 'St. James Food Closet');
});

test('approve → public listing without private fields, nearest zip first', async () => {
  let s = await (await get('/api/admin/summary?city=austin')).json();
  for (const p of s.pending) assert.equal((await post(`/api/admin/providers/${p.id}`, { action: 'approve' })).status, 200);
  const pub = await (await get('/api/providers?city=austin&zip=78721')).json();
  assert.equal(pub.length, 2);
  assert.equal(pub[0].zip, '78721', 'same zip first');
  for (const p of pub) {
    for (const k of ['contact_name', 'contact_email', 'contact_phone', 'admin_note', 'invite_id', 'status', 'city_id']) assert.ok(!(k in p), k);
    assert.ok(p.confirmed_at);
  }
  s = await (await get('/api/admin/summary?city=austin')).json();
  assert.equal(s.approved.length, 2);
  assert.equal(s.overdue.length, 0);
});

test('admin can edit, hide and restore; hidden listings leave the site', async () => {
  const s = await (await get('/api/admin/summary?city=austin')).json();
  const id = s.approved[0].id;
  const e = await (await post(`/api/admin/providers/${id}`, { action: 'edit', fields: { hours: 'Sat 9–noon', name: '' } })).json();
  assert.equal(e.ok, false, 'cannot blank the name');
  await post(`/api/admin/providers/${id}`, { action: 'edit', fields: { hours: 'Sat 9–noon' } });
  assert.ok((await (await get('/api/providers?city=austin')).json()).some(p => p.hours === 'Sat 9–noon'));
  await post(`/api/admin/providers/${id}`, { action: 'hide' });
  assert.ok(!(await (await get('/api/providers?city=austin')).json()).some(p => p.id === id));
  await post(`/api/admin/providers/${id}`, { action: 'restore' });
  assert.ok((await (await get('/api/providers?city=austin')).json()).some(p => p.id === id));
});

test('6-month re-confirm: overdue after ~182 days, cleared by "confirm"', () => {
  const old = new Date(Date.now() - 190 * 864e5).toISOString();
  assert.ok(isOverdue({ status: 'approved', confirmed_at: old }));
  assert.ok(!isOverdue({ status: 'approved', confirmed_at: new Date().toISOString() }));
  assert.ok(!isOverdue({ status: 'pending', confirmed_at: old }));
});

test('form validation: required fields, cleaned values, honeypot, cities kept apart', async () => {
  assert.equal(cleanProvider({ ...site(), zip: '7870' }).error, 'zip');
  assert.equal(cleanProvider({ ...site(), contact_email: '', contact_phone: '' }).error, 'contact');
  assert.equal(cleanProvider({ ...site(), kind: 'casino' }).error, 'kind');
  const { row } = cleanProvider({ ...site(), website: 'pantry.org', languages: ['es', 'klingon'], offers: ['produce', 'x'], name: '  A\u0000B  ' });
  assert.equal(row.website, 'https://pantry.org/');
  assert.deepEqual(row.languages, ['es']);
  assert.deepEqual(row.offers, ['produce']);
  assert.equal(row.name, 'A B');
  assert.equal(cleanProvider({ ...site(), website: 'javascript:alert(1)' }).row.website, null);
  const before = (await (await get('/api/admin/summary?city=austin')).json()).pending.length;
  await post('/api/providers/submit?city=austin', { ...site(), company_website: 'spam' });
  assert.equal((await (await get('/api/admin/summary?city=austin')).json()).pending.length, before, 'honeypot dropped silently');
  assert.deepEqual(await (await get('/api/providers?city=national')).json(), [], 'other cities never see Austin listings');
});

test('byZip sorts by real distance, not by zip number', () => {
  const rows = [{ zip: '78758' }, { zip: '78702' }, { zip: '78745' }];   // North, East, South Austin
  assert.deepEqual(byZip(rows, ''), rows, 'no zip: order unchanged');
  assert.deepEqual(byZip(rows, '99999'), rows, 'unknown zip: order unchanged');
  // 78744 (southeast): 78758 is numerically closest but ~15 miles north; 78702 and 78745 are much nearer.
  assert.deepEqual(byZip(rows, '78744').map(r => r.zip).at(-1), '78758');
  assert.deepEqual(byZip(rows, '78702').map(r => r.zip)[0], '78702', 'same zip first');
  assert.ok(zipMiles('78744', '78758') > 12 && zipMiles('78744', '78758') < 18);
  assert.equal(zipMiles('78702', '00000'), Infinity);
  assert.ok(zipMiles('01001', '02108') > 70, 'leading-zero zips work (MA)');
});

test('Supabase adapter sends the secret key and the right PostgREST calls', async () => {
  const calls = [];
  const fake = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200, json: async () => [{ id: 'x' }] }; };
  const sdb = supabaseDb({ url: 'https://proj.supabase.co/', key: 'sb_secret_TEST', fetchImpl: fake });
  await sdb.listProviders('austin', ['approved']);
  await sdb.updateProvider('abc', { status: 'approved' });
  assert.equal(calls[0].url, 'https://proj.supabase.co/rest/v1/providers?city_id=eq.austin&status=in.(approved)&order=submitted_at.desc');
  assert.equal(calls[0].opts.headers.apikey, 'sb_secret_TEST');
  assert.equal(calls[1].opts.method, 'PATCH');
  assert.equal(calls[1].opts.headers.Prefer, 'return=representation');
});
