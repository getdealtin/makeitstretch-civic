// About page and "Stay connected" (owner decision, Nov 22 2026).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import app from '../server.js';
import { memoryDb } from '../server/db.js';
import { cleanMessage } from '../server/connect.js';

let server, base, db, cookie = '';
process.env.ADMIN_KEY = 'test-admin-key';
before(() => new Promise(r => { db = memoryDb(); app.locals.setDb(db); server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => server.close());
const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', cookie, ...headers }, body: JSON.stringify(body) });
const LANGS = ['en', 'es', 'vi', 'zh-Hans'];

test('the About page is served, with the same story in all four languages', async () => {
  assert.equal((await fetch(`${base}/about`)).status, 200);
  const en = (await import('../public/i18n/about/en.js')).default;
  for (const code of LANGS) {
    const P = (await import(`../public/i18n/about/${code}.js`)).default;
    assert.equal(P.sections.length, en.sections.length, code);
    assert.equal(P.promises.length, en.promises.length, code);
    assert.deepEqual(Object.keys(P.connect.roles), Object.keys(en.connect.roles), code);
    for (const k of Object.keys(en.connect)) assert.ok(P.connect[k], `${code} connect.${k}`);
    const all = JSON.stringify(P);
    for (const name of ['Margin Ventures', 'Erin Relford', 'FACE']) assert.ok(all.includes(name), `${code} names ${name}`);
    assert.doesNotMatch(all, /\$3,000|3,000/, `${code}: no grant amount (owner decision)`);
  }
  assert.match(JSON.stringify(en), /creating the margin for progress/i);
  const js = readFileSync(new URL('../public/about.js', import.meta.url), 'utf8');
  assert.match(js, /https:\/\/www\.austintexas\.gov\/climate\/news\/city-invests-34-organizations/, 'links the City announcement');
});

test('footer: About and Stay connected on every resident page, in every language', async () => {
  for (const f of ['index.html', 'provider.html']) {
    const html = readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
    assert.match(html, /href="\/about"/, f); assert.match(html, /href="\/about#connect"/, f);
  }
  for (const f of ['principles.html', 'privacy.html', 'about.html']) assert.match(readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8'), /class="footer-links"/, f);
  for (const code of LANGS) {
    const ui = (await import(`../public/i18n/${code}.js`)).default;
    assert.ok(ui.about_link && ui.connect_link, code);
  }
});

test('stay connected: a valid email is kept; bad emails, bots and other sites are refused', async () => {
  assert.deepEqual(cleanMessage({ email: ' Ana@Example.org ', role: 'press', message: 'Hi\u0000 there', lang: 'es' }),
    { email: 'ana@example.org', role: 'press', message: 'Hi there', lang: 'es' });
  assert.equal(cleanMessage({ email: 'not-an-email' }), null);
  assert.equal(cleanMessage({ email: 'a@b.co', website: 'spam.example' }), null, 'hidden field filled in');
  assert.equal(cleanMessage({ email: 'a@b.co', role: 'admin' }).role, 'other');
  assert.equal(cleanMessage({ email: 'a@b.co', message: 'x'.repeat(5000) }).message.length, 1000);

  assert.equal((await post('/api/connect', { email: 'partner@foodbank.org', role: 'partner', message: 'Let’s talk' })).status, 200);
  assert.equal((await post('/api/connect', { email: 'nope' })).status, 400);
  assert.equal((await post('/api/connect', { email: 'x@y.org' }, { origin: 'https://evil.example' })).status, 403);
  const kept = await db.listMessages();
  assert.equal(kept.length, 1);
  assert.equal(kept[0].email, 'partner@foodbank.org');
});

test('admin: messages are listed and can be deleted; never without signing in', async () => {
  assert.equal((await fetch(`${base}/api/admin/summary`)).status, 401);
  cookie = (await post('/api/admin/login', { password: 'test-admin-key' })).headers.get('set-cookie').split(';')[0];
  const s = await (await fetch(`${base}/api/admin/summary`, { headers: { cookie } })).json();
  assert.equal(s.messages.length, 1);
  const id = s.messages[0].id;
  assert.equal((await post(`/api/admin/messages/${id}/delete`, {})).status, 200);
  assert.equal((await db.listMessages()).length, 0);
});

test('privacy policy: email sign-ups and optional recipe sharing, in all four languages', async () => {
  const en = JSON.stringify((await import('../public/i18n/privacy/en.js')).default);
  assert.match(en, /stay connected/);
  assert.match(en, /Sharing a recipe is optional\. If you add a name, it’s shown with your recipe\./);
  for (const code of LANGS) {
    const P = (await import(`../public/i18n/privacy/${code}.js`)).default;
    assert.equal(P.sections[4].p.length, 2, `${code}: recipe line in "Your choices"`);
    assert.match(P.updated, /22/, `${code}: new effective date`);
  }
});
