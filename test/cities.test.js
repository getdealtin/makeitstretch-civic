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
