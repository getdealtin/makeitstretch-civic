// "Keep this plan": links and saved copies carry only plan inputs, and links are untrusted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeState, decodeState, packPlan, unpackPlan, packBox, unpackBox, readHash, planHash, boxHash, planText, smsHref, mailHref,
  savedList, addSaved, updateSaved, removeSaved, findSaved, SAVED_MAX,
} from '../public/keep.js';

// In-memory stand-in for the browser's storage.
const fakeStore = () => {
  const m = new Map();
  return { get: k => (m.has(k) ? JSON.parse(m.get(k)) : null), set: (k, v) => (m.set(k, JSON.stringify(v)), true), del: k => m.delete(k), m };
};

test('saved plans: several at once, newest first; update and remove one', () => {
  const st = fakeStore(), K = 'k';
  const a = addSaved(st, K, { kind: 'plan', hash: '#p=a', title: '14-day grocery plan', detail: '$90 · 2 people' }, 1000);
  const b = addSaved(st, K, { kind: 'box', hash: '#b=b', title: 'Food box meals', detail: 'rice, beans' }, 2000);
  const c = addSaved(st, K, { kind: 'plan', hash: '#p=c', title: '7-day grocery plan', detail: '$40 · 1 person' }, 3000);
  assert.deepEqual(savedList(st, K).map(e => e.hash), ['#p=c', '#b=b', '#p=a']);
  assert.ok(updateSaved(st, K, a.id, { hash: '#p=a2' }));
  assert.equal(findSaved(st, K, a.id).hash, '#p=a2');
  removeSaved(st, K, b.id);
  assert.deepEqual(savedList(st, K).map(e => e.id), [c.id, a.id]);
  removeSaved(st, K, c.id); removeSaved(st, K, a.id);
  assert.deepEqual(savedList(st, K), []);
  assert.equal(st.m.size, 0, 'storage is cleared when the last plan is removed');
});

test(`saved plans: capped at ${SAVED_MAX}, oldest drops off and is reported`, () => {
  const st = fakeStore();
  let r;
  for (let i = 0; i < SAVED_MAX + 2; i++) r = addSaved(st, 'k', { kind: 'plan', hash: '#p=' + i, title: 't' }, i);
  const list = savedList(st, 'k');
  assert.equal(list.length, SAVED_MAX);
  assert.equal(list[0].hash, '#p=' + (SAVED_MAX + 1));
  assert.ok(!list.some(e => e.hash === '#p=0'));
  assert.equal(r.dropped, 1);
});

test('saved plans: a plan saved by the earlier one-slot version carries over', () => {
  const st = fakeStore();
  st.set('k', { hash: '#p=old', title: 'Your 14-day plan', at: 5 });
  const list = savedList(st, 'k');
  assert.equal(list.length, 1);
  assert.equal(list[0].hash, '#p=old');
  addSaved(st, 'k', { kind: 'box', hash: '#b=new', title: 'Food box meals' }, 9);
  assert.deepEqual(savedList(st, 'k').map(e => e.hash), ['#b=new', '#p=old']);
});

test('saved plans: storage that refuses to save is reported, not hidden', () => {
  const st = { ...fakeStore(), set: () => false };
  assert.equal(addSaved(st, 'k', { kind: 'plan', hash: '#p=x' }), null);
});

const answers = { budget: 120, days: 14, people: 3, zip: '78702', leftover: 'yes', store: 'corner', cuisine: ['latin'], avoid: ['dairy'], have: ['rice'], list: 'short' };

test('a plan link round-trips exactly, with swaps and checkmarks', () => {
  const h = planHash(packPlan(answers, { swaps: ['0-1-dinner', '1-0-lunch'], checked: ['rice', 'onions'] }));
  assert.match(h, /^#p=[A-Za-z0-9_-]+$/, 'URL-safe');
  const back = readHash(h);
  assert.equal(back.kind, 'plan');
  assert.deepEqual(back.state.answers, answers);
  assert.deepEqual(back.state.swaps, ['0-1-dinner', '1-0-lunch']);
  assert.deepEqual(back.state.checked, ['rice', 'onions']);
});

test('variety across plans: the draw and the last plan’s meals travel with the link; bad values are dropped', () => {
  const a = { ...answers, seed: 123456789, recent: [12, 80, 1003] };
  assert.deepEqual(readHash(planHash(packPlan(a))).state.answers, a);
  const bad = unpackPlan({ ...packPlan(answers), x: -5, y: ['<script>', 4.5, 7] });
  assert.equal(bad.answers.seed, undefined);
  assert.deepEqual(bad.answers.recent, [7]);
  assert.equal(unpackPlan(packPlan(answers)).answers.seed, undefined); // links from before: no draw
});

test('the shorter/full list choice travels with the link; old links open the full list', () => {
  assert.equal(readHash(planHash(packPlan({ ...answers, list: 'full' }))).state.answers.list, 'full');
  const { list, ...old } = answers; // a link made before the choice existed
  assert.equal(readHash(planHash(packPlan(old))).state.answers.list, 'full');
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
  assert.deepEqual(readHash(h), { kind: 'box', state: { items: ['rice', 'drybeans'], avoid: ['eggs'], other: [], cant: [], zip: null } });
  assert.deepEqual(unpackBox({ t: 'b', i: ['rice', 'bogus'] }), { items: ['rice'], avoid: [], other: [], cant: [], zip: null });
  // the box's ZIP code (asked first since Nov 19) rides along; anything but 5 digits is dropped
  assert.equal(readHash(boxHash(packBox({ items: ['rice'], avoid: [], zip: '78702' }))).state.zip, '78702');
  assert.equal(unpackBox({ t: 'b', i: ['rice'], z: '7870<' }).zip, null);
  // foods left out ("won't use") ride along, but only ones in the box
  const c = readHash(boxHash(packBox({ items: ['rice', 'peanutbutter'], avoid: [], cant: [{ id: 'peanutbutter', reason: 'allergy' }] })));
  assert.deepEqual(c.state.cant, [{ id: 'peanutbutter', reason: null }]);
  assert.deepEqual(unpackBox({ t: 'b', i: ['rice'], u: ['peanutbutter', 'bogus'] }).cant, []);
  const w = readHash(boxHash(packBox({ items: ['rice'], avoid: [], cant: [{ word: 'canned sardines', reason: null }] })));
  assert.deepEqual(w.state.cant, [{ word: 'canned sardines', reason: null }]);
  assert.deepEqual(unpackBox({ t: 'b', i: ['rice'], uw: ['555-0101', 'Okra'] }).cant, [{ word: 'okra', reason: null }]);
  assert.equal(unpackBox({ t: 'b', i: ['bogus'] }), null);
  // typed foods ride along, cleaned; a box of only typed foods still opens
  assert.deepEqual(unpackBox({ t: 'b', i: [], o: ['Canned Salmon', '555-0101'] }), { items: [], avoid: [], other: ['canned salmon'], cant: [], zip: null });
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

test('ticks on week 2+ lists survive a plan link', async () => {
  const { packPlan, unpackPlan } = await import('../public/keep.js');
  const a = { budget: 100, days: 14, people: 2, leftover: 'sometimes', store: 'full', cuisine: [], avoid: [], have: [], list: 'full' };
  const back = unpackPlan(packPlan(a, { checked: ['rice', 'rice.2', 'bad.item.3'] }));
  assert.deepEqual(back.checked, ['rice', 'rice.2']);
});

// Reopens counted honestly (owner request, Nov 24 2026): nothing identifies a person; a tab only remembers
// the plan it last showed, until it is closed.
test('classifyOpen: reload, came back, shared link, other link', async () => {
  const { classifyOpen, daysSince, RETURN_HOURS } = await import('../public/keep.js');
  const h = '#p=abc', now = Date.UTC(2026, 10, 24, 12);
  const hoursAgo = n => now - n * 36e5;
  assert.deepEqual(classifyOpen({ hash: h, seen: { h, at: hoursAgo(0.1) }, now }), { source: 'reload' });
  assert.deepEqual(classifyOpen({ hash: h, seen: { h, at: hoursAgo(RETURN_HOURS - 0.01) }, now }), { source: 'reload' });
  assert.deepEqual(classifyOpen({ hash: h, seen: { h, at: hoursAgo(RETURN_HOURS) }, now }), { source: 'returned', days: 0 });
  assert.deepEqual(classifyOpen({ hash: h, seen: { h, at: hoursAgo(50) }, now }), { source: 'returned', days: 2 });
  // The same tab reloading a shared link is still a reload, not a second share.
  assert.deepEqual(classifyOpen({ hash: h, seen: { h, at: hoursAgo(1) }, viaShare: true, now }), { source: 'reload' });
  assert.deepEqual(classifyOpen({ hash: h, seen: null, viaShare: true, now }), { source: 'shared' });
  assert.deepEqual(classifyOpen({ hash: h, seen: { h: '#p=other', at: hoursAgo(1) }, now }), { source: 'link' });
  assert.deepEqual(classifyOpen({ hash: h, seen: { h, at: 'bad' }, now }), { source: 'link' });
  assert.deepEqual(classifyOpen({ hash: h, seen: null, now }), { source: 'link' });
  assert.equal(daysSince(now - 3.5 * 864e5, now), 3);
  assert.equal(daysSince(now + 864e5, now), 0);
  assert.equal(daysSince(undefined, now), 0);
});
