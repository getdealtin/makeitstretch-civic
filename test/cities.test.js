// Every city works the same way: these checks run for every city in cities/index.js, so a city added
// later gets them without anyone remembering to copy a fix from Austin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITIES } from '../cities/index.js';
import { SHARED_LISTINGS, withSharedListings } from '../cities/shared.js';

for (const city of Object.values(CITIES)) {
  test(`${city.id}: gets every shared listing for the needs it offers, with its own place and translations`, () => {
    for (const s of SHARED_LISTINGS) {
      const got = city.resources.find(r => r.id === s.id);
      if (!s.needs.some(n => (city.needs || []).includes(n))) { assert.equal(got, undefined, `${s.id} without its need`); continue; }
      assert.ok(got, `${city.id} is missing ${s.id}`);
      assert.match(got.url, /^https:\/\//);
      if (city.place) assert.ok(got.url.includes(encodeURIComponent(city.place)), `${s.id} link names ${city.place}`);
      for (const lang of city.languages.filter(l => l !== 'en')) assert.ok(city.i18n?.[lang]?.resources?.[s.id]?.name, `${city.id} ${lang} ${s.id}`);
    }
  });
}

test('shared listings: a city never gets one twice, and its own listings come first', () => {
  const card = { id: 'x', place: 'Springfield', region: 'IL', needs: ['health'], languages: ['en'], resources: [{ id: 'own' }] };
  const once = withSharedListings(card);
  assert.equal(once.resources[0].id, 'own');
  assert.equal(withSharedListings(once).resources.length, once.resources.length);
  assert.match(once.resources.find(r => r.id === 'nafc-find-clinic').url, /search=Springfield%2C%20IL/);
});

// A city added tomorrow with only the basics (no store list, no districts, no report framework) must work
// and must never show Austin's data or wording.
test('a new city with only the basics: no Austin data or wording anywhere', async () => {
  const { publicConfig } = await import('../cities/index.js');
  const { storesNear, retailFindings } = await import('../server/stores.js');
  const { cityReport, rolesOf } = await import('../server/report.js');
  const { maintenanceFor } = await import('../server/maintenance.js');
  const card = withSharedListings({ ...CITIES.national, id: 'springfield', hosts: ['springfield.makeitstretch.org'],
    place: 'Springfield', region: 'IL', needs: ['health'], languages: ['en', 'es'], i18n: {},
    resources: [...CITIES.national.resources] });
  const austinish = /Austin|Travis|Texas|CapMetro|Council District|78702/;

  const pub = publicConfig(card);
  assert.equal(pub.has_stores, false);
  assert.equal(pub.transit_trip_url, null);
  assert.doesNotMatch(JSON.stringify(pub), austinish);
  assert.ok(pub.resources.find(r => r.id === 'nafc-find-clinic').url.includes('Springfield'));

  assert.equal(storesNear(card, '62701'), null);
  assert.equal(retailFindings(card), null);

  const events = [];
  for (let i = 0; i < 30; i++) events.push({ session_id: 's' + i, event: 'plan_built', created_at: '2026-11-02T10:00:00Z', data: { zip: '62701', pppd: 5 } });
  const r = cityReport(events, { k: 15, from: '2026-11-01', to: '2026-11-30', city: card.place, roles: rolesOf(card.resources), local: card.local || {} });
  assert.doesNotMatch(JSON.stringify(r), austinish);
  assert.ok(!r.sections.flatMap(s => s.tables).some(t => /district/i.test(t.title)), 'no district tables without districts');

  const m = maintenanceFor(card);
  assert.ok(!m.some(i => i.id === 'stores' || i.id === 'access'), 'no reminders for data the city doesn’t have');
  assert.doesNotMatch(JSON.stringify(m), austinish);
});
