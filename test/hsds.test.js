// HSDS export (/api/hsds): Open Referral's format, public fields only, standard categories.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';
import { memoryDb } from '../server/db.js';
import { buildDataset, uuid5, HSDS_VERSION } from '../server/hsds.js';
import { OE, NEED_TERMS, KIND_TERMS, OFFER_TERMS } from '../server/taxonomy.js';
import { KINDS, OFFERS } from '../server/directory.js';
import { CITIES } from '../cities/index.js';
const austin = CITIES.austin; // as served: Austin's own listings plus the shared ones (cities/shared.js)

const provider = {
  id: '0b8f1c2e-1111-4a2b-9c3d-123456789abc', status: 'approved', name: 'Test Pantry', kind: 'pantry',
  address: '1234 E 7th St', city: 'Austin', zip: '78702', phone: '512-555-0100', website: 'https://example.org/', hours: 'Tue 5-7 PM',
  access: 'walkup', id_required: true, languages: ['en', 'es', 'other'], offers: ['groceries', 'produce', 'baby'],
  description: 'Free groceries.', confirmed_at: '2026-10-01T15:00:00Z',
  contact_name: 'Private Person', contact_email: 'private@example.org', contact_phone: '512-000-0000', admin_note: 'internal',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('every mapped category is a real Open Eligibility term', () => {
  const all = [...Object.values(NEED_TERMS), ...Object.values(KIND_TERMS), ...Object.values(OFFER_TERMS),
    ...austin.resources.map(r => r.taxonomy || [])].flat();
  for (const c of all) assert.ok(OE.terms[c], c);
  for (const k of KINDS) assert.ok(KIND_TERMS[k], k);
  for (const o of OFFERS) assert.ok(o in OFFER_TERMS || ['produce', 'other'].includes(o), o);
  for (const n of austin.needs) assert.ok(NEED_TERMS[n], n);
  for (const r of austin.resources.filter(r => r.audience !== 'organizations')) assert.ok(r.org && r.taxonomy?.length, r.id);
});

test('dataset: required HSDS fields, stable ids, never private contact details', () => {
  const d = buildDataset(austin, [provider]);
  const txt = JSON.stringify(d);
  for (const secret of ['Private Person', 'private@example.org', '512-000-0000', 'internal']) assert.ok(!txt.includes(secret), secret);
  for (const s of d.services) { assert.ok(s.id && s.name && s.status); assert.match(s.id, /^[0-9a-f-]{36}$/); }
  for (const o of d.organizations) { assert.ok(o.id && o.name && o.description); assert.match(o.id, UUID); }
  for (const l of d.locations) assert.ok(l.id && l.location_type);
  assert.ok(!d.services.some(s => s.name === 'Keep Austin Fed'), 'organization-only listing left out');
  const workforce = d.organizations.filter(o => o.name === 'Workforce Solutions Capital Area');
  assert.equal(workforce.length, 1, 'one organization, two services');
  assert.equal(d.services.filter(s => s.organization_id === workforce[0].id).length, 2);
  const p = d.services.find(s => s.id === provider.id);
  assert.equal(p.application_process, 'Walk up, no appointment');
  assert.deepEqual(p.languages.map(l => l.code), ['en', 'es']);
  assert.deepEqual(p.attributes.map(a => a.taxonomy_term.code), ['1130', '1155']);
  assert.deepEqual(Object.entries(d.locations[0].addresses[0]).filter(([k]) => !k.endsWith('id')),
    [['address_1', '1234 E 7th St'], ['city', 'Austin'], ['state_province', 'TX'], ['postal_code', '78702'], ['country', 'US'], ['address_type', 'physical']]);
  const old = buildDataset(austin, [{ ...provider, city: null }]);
  assert.equal(old.locations[0].description, 'Street address: 1234 E 7th St, ZIP 78702', 'no city is guessed');
  assert.equal(old.locations[0].addresses, undefined);
  assert.equal(buildDataset(austin, [provider]).services[0].id, d.services[0].id, 'ids are stable');
  assert.equal(uuid5('x'), uuid5('x')); assert.match(uuid5('x'), UUID);
});

let server, base;
before(() => new Promise(r => {
  const db = memoryDb(); app.locals.setDb(db);
  db.listProviders = async (city, statuses) => (city === 'austin' && statuses.includes('approved') ? [provider] : []);
  server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); });
}));
after(() => server.close());
const url = p => base + p + (p.includes('?') ? '&' : '?') + 'city=austin';
const get = p => fetch(url(p)).then(r => r.json());

test('API: root, paging, filters, single records', async () => {
  const root = await get('/api/hsds/');
  assert.equal(root.version, HSDS_VERSION); assert.match(root.openapi_url, /openreferral\/specification\/v3\.3\.1/);
  const all = await get('/api/hsds/services');
  // Every Austin listing for residents (its own plus the shared ones; listings for organizations aren't
  // services) and the one test food site.
  const total = austin.resources.filter(r => r.audience !== 'organizations').length + 1;
  assert.equal(all.total_items, total); assert.equal(all.page_number, 1); assert.equal(all.empty, false);
  const pantries = await get('/api/hsds/services?taxonomy_term_id=1130');
  assert.deepEqual(pantries.contents.map(s => s.name).sort(), [...austin.resources.filter(r => (r.taxonomy || []).includes('1130')).map(r => r.name), 'Test Pantry'].sort());
  assert.ok(pantries.contents.length >= 5, 'the Food Bank finder, three grassroots pantries and the test site');
  const one = await get(`/api/hsds/services/${provider.id}`);
  assert.equal(one.organization.name, 'Test Pantry'); assert.equal(one.service_at_locations[0].location.location_type, 'physical');
  const lastPage = Math.ceil(total / 5);
  const paged = await get(`/api/hsds/services?per_page=5&page=${lastPage}`);
  assert.equal(paged.size, total - 5 * (lastPage - 1)); assert.equal(paged.last_page, true);
  const terms = await get('/api/hsds/taxonomy_terms');
  assert.equal(terms.total_items, Object.keys(OE.terms).length);
  const minimal = await get('/api/hsds/services?minimal=true');
  assert.deepEqual(Object.keys(minimal.contents[0]).sort(), ['id', 'last_modified']);
  assert.equal((await fetch(url('/api/hsds/services/nope'))).status, 404);
});
