// Consent handshake: off by default; only chosen fields, only with consent, only to a receiver; no copy kept.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { cleanRequest, preview, CONSENT_VERSION, FIELDS } from '../public/handshake.js';
import { mountHandshake, handshakeOn } from '../server/handshake.js';
import austin from '../cities/austin.js';
import app from '../server.js';
import { memoryDb } from '../server/db.js';

const ok = (over = {}) => ({
  target: 'resource:wfs-childcare', need: 'childcare',
  fields: { first_name: 'Ana', phone: '512-555-0101', reach_by: 'text', language: 'es', zip: '78702', note: 'Two kids', ssn: '123-45-6789', ...over.fields },
  consent: { version: CONSENT_VERSION, agreed: true, ...over.consent }, ...over.top,
});

test('cleanRequest: allowlisted fields only, a way to reach her, consent required', () => {
  const { request } = cleanRequest(ok());
  assert.deepEqual(Object.keys(request.fields), ['first_name', 'phone', 'reach_by', 'language', 'zip', 'note'], 'unknown fields (ssn) dropped');
  assert.equal(cleanRequest(ok({ consent: { agreed: false } })).error, 'consent');
  assert.equal(cleanRequest(ok({ consent: { version: 'old' } })).error, 'consent');
  assert.equal(cleanRequest(ok({ fields: { phone: '' } })).error, 'contact');
  assert.equal(cleanRequest(ok({ fields: { phone: '', email: 'a@b.org', reach_by: 'text' } })).error, 'phone');
  assert.equal(cleanRequest(ok({ fields: { reach_by: 'email' } })).error, 'email');
  assert.equal(cleanRequest(ok({ fields: { zip: '7870' } })).error, 'zip');
  assert.equal(cleanRequest(ok({ fields: { phone: 'call me maybe' } })).error, 'phone');
  assert.equal(cleanRequest(ok({ top: { target: 'https://evil' } })).error, 'target');
  assert.equal(cleanRequest(ok({ top: { need: 'cash' } })).error, 'need');
  assert.equal(cleanRequest(ok({ fields: { note: 'x'.repeat(900) } })).request.fields.note.length, 500);
  assert.deepEqual(preview(cleanRequest(ok()).request.fields).map(([k]) => k), FIELDS.map(f => f.key).filter(k => k !== 'email'));
});

test('off by default: Austin ships with it off, and every route is 404', async () => {
  assert.equal(austin.handshake.enabled, false);
  assert.equal(handshakeOn(austin), false);
  app.locals.setDb(memoryDb());
  const s = app.listen(0); await new Promise(r => s.once('listening', r));
  const base = `http://127.0.0.1:${s.address().port}`;
  assert.equal((await fetch(base + '/api/handshake/receivers?city=austin')).status, 404);
  assert.equal((await fetch(base + '/api/handshake/request?city=austin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ok()) })).status, 404);
  assert.equal((await (await fetch(base + '/api/config?city=austin')).json()).handshake, false);
  s.close();
});

// A city with it on, a test receiver and a test delivery channel.
const delivered = [];
const city = { id: 'testcity', handshake: { enabled: true, receivers: {
  'resource:wfs-childcare': { name: 'Workforce Solutions Capital Area', deliver: 'test' },
  'resource:nowhere': { name: 'No channel yet', deliver: 'email' },
} } };
let server, base;
before(() => new Promise(r => {
  const a = express();
  a.use((req, res, next) => { req.city = city; next(); });
  mountHandshake(a, { delivery: { test: async (to, req) => { delivered.push({ to: to.name, req }); } } });
  server = a.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); });
}));
after(() => server.close());
const post = body => fetch(base + '/api/handshake/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('on: receivers list has no delivery details; a request reaches only the chosen service', async () => {
  const list = await (await fetch(base + '/api/handshake/receivers')).json();
  assert.deepEqual(list[0], { target: 'resource:wfs-childcare', name: 'Workforce Solutions Capital Area' });
  assert.ok(!JSON.stringify(list).includes('deliver'));
  const r = await (await post(ok())).json();
  assert.deepEqual(r, { ok: true, sent_to: 'Workforce Solutions Capital Area' });
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].req.fields.ssn, undefined);
  assert.equal(delivered[0].req.consent.agreed, true);
  assert.equal((await post(ok({ top: { target: 'resource:not-a-receiver' } }))).status, 400);
  assert.equal((await (await post(ok({ top: { target: 'resource:nowhere' } }))).json()).error, 'no_delivery', 'no channel → nothing sent');
  assert.equal((await post(ok({ consent: { agreed: false } }))).status, 400);
  assert.equal(delivered.length, 1, 'nothing else delivered');
  assert.equal((await post(ok())).status, 200, 'fifth request this hour');
  assert.equal((await post(ok())).status, 429, 'more than 5 an hour from one connection is refused');
});
