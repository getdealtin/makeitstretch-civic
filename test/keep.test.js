// "Keep this plan": links and saved copies carry only plan inputs, and links are untrusted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeState, decodeState, packPlan, unpackPlan, packBox, unpackBox, readHash, planHash, boxHash, planText, smsHref, mailHref } from '../public/keep.js';

const answers = { budget: 120, days: 14, people: 3, zip: '78702', leftover: 'yes', store: 'corner', cuisine: ['latin'], avoid: ['dairy'], have: ['rice'] };

test('a plan link round-trips exactly, with swaps and checkmarks', () => {
  const h = planHash(packPlan(answers, { swaps: ['0-1-dinner', '1-0-lunch'], checked: ['rice', 'onions'] }));
  assert.match(h, /^#p=[A-Za-z0-9_-]+$/, 'URL-safe');
  const back = readHash(h);
  assert.equal(back.kind, 'plan');
  assert.deepEqual(back.state.answers, answers);
  assert.deepEqual(back.state.swaps, ['0-1-dinner', '1-0-lunch']);
  assert.deepEqual(back.state.checked, ['rice', 'onions']);
});

test('links stay short enough to text', () => {
  const swaps = Array.from({ length: 30 }, (_, i) => `${i % 5}-${i % 7}-dinner`);
  const h = planHash(packPlan(answers, { swaps, checked: Array(40).fill('cannedtomatoes') }));
  assert.ok(h.length < 2000, String(h.length));
});

test('edited or hostile links are rejected or cleaned', () => {
  assert.equal(readHash('#p=not-base64!!'), null);
  assert.equal(readHash('#x=abc'), null);
  assert.equal(readHash(''), null);
  assert.equal(unpackPlan({ t: 'p', b: 0, d: 7, p: 1 }), null, 'budget out of range');
  assert.equal(unpackPlan({ t: 'p', b: 50, d: 99, p: 1 }), null, 'days out of range');
  const dirty = unpackPlan({ t: 'p', b: 50, d: 7, p: 2, z: '<script>', l: 'evil', s: 'walmart', c: ['latin', 'x'], a: ['meat', '"'], h: [1], w: ['0-0-dinner', 'drop table'], k: ['rice', '<img>'] });
  assert.equal(dirty.answers.zip, null);
  assert.equal(dirty.answers.leftover, 'sometimes');
  assert.equal(dirty.answers.store, 'full');
  assert.deepEqual(dirty.answers.cuisine, ['latin']);
  assert.deepEqual(dirty.answers.avoid, ['meat']);
  assert.deepEqual(dirty.answers.have, []);
  assert.deepEqual(dirty.swaps, ['0-0-dinner']);
  assert.deepEqual(dirty.checked, ['rice']);
});

test('box links keep only real box items', () => {
  const h = boxHash(packBox({ items: ['rice', 'drybeans'], avoid: ['eggs'] }));
  assert.deepEqual(readHash(h), { kind: 'box', state: { items: ['rice', 'drybeans'], avoid: ['eggs'] } });
  assert.deepEqual(unpackBox({ t: 'b', i: ['rice', 'bogus'] }), { items: ['rice'], avoid: [] });
  assert.equal(unpackBox({ t: 'b', i: ['bogus'] }), null);
});

test('unicode survives packing', () => {
  assert.deepEqual(decodeState(encodeState({ s: 'jalapeño · ✓' })), { s: 'jalapeño · ✓' });
});

test('text bodies list every item and end with the link; hrefs are encoded', () => {
  const shopping = [{ items: [{ label: 'White Rice', qty: 2, subtotal: 4.98 }, { label: 'Onions', qty: 1, subtotal: 1.89 }] }];
  const weeks = [[{ dayName: 'Mon', breakfast: [{ title: 'Oatmeal' }, { title: 'Eggs' }], lunch: [], dinner: [{ title: 'Rice & Beans' }] }, { dayName: 'Tue', leftover: true }]];
  const labels = { list: 'Shopping list', week1: 'Week 1 of 1', leftover: 'leftovers', link: 'Full plan:' };
  const sms = planText({ title: 'Plan', shopping, weeks, choice: {}, total: 6.87, url: 'https://x/#p=abc', labels });
  assert.match(sms, /☐ White Rice ×2 {2}\$4\.98/);
  assert.ok(!sms.includes('Oatmeal'), 'texts carry the list only');
  assert.ok(sms.trim().endsWith('https://x/#p=abc'));
  const email = planText({ title: 'Plan', shopping, weeks, choice: { '0-0-breakfast': 1 }, total: 6.87, url: 'u', labels, full: true });
  assert.match(email, /Mon: Eggs · Rice & Beans/, 'email includes week 1 with swaps applied');
  assert.match(email, /Tue: leftovers/);
  assert.ok(smsHref('a & b').startsWith('sms:?&body=a%20%26%20b'));
  assert.equal(mailHref('S', 'B'), 'mailto:?subject=S&body=B');
});
