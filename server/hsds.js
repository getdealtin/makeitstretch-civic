// HSDS export: the site's help listings and approved food-directory listings as Open Referral's
// Human Services Data Specification (HSDS 3.3.1), served read-only at /api/hsds with the HSDS API
// endpoints, so 2-1-1, food banks and other HSDS-compatible systems can take them without retyping.
// Spec: https://github.com/openreferral/specification (tag v3.3.1). HSDS is CC BY-SA 4.0.
//
// What is exported, and what is not:
//   • Help listings from the city config (except ones for organizations, not residents).
//   • Approved directory listings, public fields only (the same fields the site shows). Contact
//     names, emails and phones given for admin use never leave the admin API.
//   • Categories as Open Eligibility terms (server/taxonomy.js).
//   • Addresses: providers give a street address and ZIP but not a city, and HSDS's address
//     object requires a city, so the street and ZIP go in the location's description rather than
//     guessing the city.
import crypto from 'node:crypto';
import express from 'express';
import { PUBLIC_FIELDS } from './db.js';
import { OE, oePath, KIND_TERMS, OFFER_TERMS } from './taxonomy.js';

export const HSDS_VERSION = '3.3.1';
const OPENAPI_URL = 'https://raw.githubusercontent.com/openreferral/specification/v3.3.1/schema/openapi.json';

// Stable ids: HSDS wants UUIDs, so each record gets a name-based (version 5) UUID that never changes.
const NS = Buffer.from('3c9d6f0a2b7e4c51a8e2d4f6b1c3a597', 'hex');
export function uuid5(name) {
  const h = crypto.createHash('sha1').update(NS).update(String(name)).digest();
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

const KIND_LABEL = { pantry: 'Food pantry', fridge: 'Community fridge', meals: 'Free meals', mutual_aid: 'Mutual aid', other: 'Food help' };
const ACCESS_TEXT = { walkup: 'Walk up, no appointment', appointment: 'By appointment', both: 'Walk up or make an appointment' };
const LANG = { en: 'English', es: 'Spanish', vi: 'Vietnamese', zh: 'Chinese', ar: 'Arabic' };
const day = iso => (iso ? new Date(iso).toISOString().slice(0, 10) : null);
const firstDate = s => (String(s || '').match(/\d{4}-\d{2}-\d{2}/) || [])[0] || null;
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length)));

// ── Taxonomy ─────────────────────────────────────────────────────
const TAXONOMY_ID = uuid5('taxonomy:open-eligibility');
export const TAXONOMY = {
  id: TAXONOMY_ID, name: 'Open Eligibility',
  description: 'Open Referral’s human services taxonomy (CC BY-SA 3.0), a derivative of “Human Services Taxonomy” by Aunt Bertha, Inc.',
  uri: OE.source, version: OE.commit.slice(0, 7),
};
export function term(code, { detail = true } = {}) {
  const t = OE.terms[code];
  if (!t) return null;
  return clean({
    id: uuid5('oe:' + code), code, name: t.name, description: 'Open Eligibility: ' + oePath(code),
    parent_id: t.parent ? uuid5('oe:' + t.parent) : null,
    taxonomy: 'Open Eligibility', taxonomy_id: TAXONOMY_ID, taxonomy_detail: detail ? TAXONOMY : null,
  });
}
const attributes = (linkId, codes) => [...new Set(codes)].filter(c => OE.terms[c]).map(c => {
  const t = term(c);
  return { id: uuid5(`attr:${linkId}:${c}`), link_id: linkId, link_entity: 'service', taxonomy_term_id: t.id, taxonomy_term: t };
});

// ── Records ──────────────────────────────────────────────────────
/** City config + approved providers → { organizations, services, locations, service_at_locations }. */
export function buildDataset(city, providers = []) {
  const orgs = new Map(), services = [], locations = [], sals = [];
  const orgFor = (key, fields) => {
    const id = uuid5(`${city.id}:org:${key}`);
    if (!orgs.has(id)) orgs.set(id, { id, ...fields, _services: [] });
    return orgs.get(id);
  };

  for (const r of city.resources || []) {
    if (r.audience === 'organizations') continue; // e.g. food rescue for agencies, not a service for residents
    const orgName = r.org || r.name;
    const org = orgFor('name:' + orgName, { name: orgName });
    const id = uuid5(`${city.id}:resource:${r.id}`);
    const checked = firstDate(r.verified);
    org._services.push(r.name);
    services.push(clean({
      id, organization_id: org.id, name: r.name, description: r.description, url: r.url, status: 'active',
      assured_date: checked, last_modified: checked ? checked + 'T00:00:00.000Z' : null,
      phones: r.phone ? [{ id: uuid5(`phone:${id}`), service_id: id, number: r.phone }] : [],
      attributes: attributes(id, r.taxonomy || []),
    }));
  }

  for (const raw of providers) {
    const p = Object.fromEntries(PUBLIC_FIELDS.map(f => [f, raw[f] ?? null])); // public fields only
    const org = orgFor('provider:' + p.id, { name: p.name, website: p.website });
    org._services.push(p.name);
    const id = p.id;
    const confirmed = p.confirmed_at ? new Date(p.confirmed_at).toISOString() : null;
    services.push(clean({
      id, organization_id: org.id, name: p.name,
      description: p.description || KIND_LABEL[p.kind] || null, url: p.website, status: 'active',
      application_process: ACCESS_TEXT[p.access] || null,
      required_documents: p.id_required ? [{ id: uuid5(`doc:${id}`), service_id: id, document: 'ID' }] : [],
      assured_date: day(p.confirmed_at), last_modified: confirmed,
      phones: p.phone ? [{ id: uuid5(`phone:${id}`), service_id: id, number: p.phone }] : [],
      operating_hours: p.hours ? [{ id: uuid5(`hours:${id}`), service_id: id, description: p.hours }] : [],
      languages: (p.languages || []).filter(l => LANG[l]).map(l => ({ id: uuid5(`lang:${id}:${l}`), service_id: id, name: LANG[l], code: l })),
      attributes: attributes(id, [...(KIND_TERMS[p.kind] || []), ...(p.offers || []).flatMap(o => OFFER_TERMS[o] || [])]),
    }));
    if (p.address) {
      const locId = uuid5(`${city.id}:location:${p.id}`);
      locations.push(clean({
        id: locId, location_type: 'physical', organization_id: org.id, name: p.name,
        description: `Street address: ${p.address}${p.zip ? `, ZIP ${p.zip}` : ''}`,
      }));
      sals.push({ id: uuid5(`${city.id}:sal:${p.id}`), service_id: id, location_id: locId });
    }
  }

  const organizations = [...orgs.values()].map(({ _services, ...o }) => clean({
    ...o, description: `Runs ${_services.join('; ')}. Listed on ${city.name || 'Make It Stretch'}${city.place ? ` ${city.place}` : ''}.`,
  }));
  return { organizations, services, locations, service_at_locations: sals };
}

// ── API (HSDS API Reference, read-only) ─────────────────────────
function page(items, q) {
  const per = Math.min(Math.max(parseInt(q.per_page, 10) || 50, 1), 200);
  const total = items.length, pages = Math.max(Math.ceil(total / per), 1);
  const n = Math.min(Math.max(parseInt(q.page, 10) || 1, 1), pages);
  const contents = items.slice((n - 1) * per, n * per);
  return { total_items: total, total_pages: pages, page_number: n, size: contents.length,
    first_page: n === 1, last_page: n === pages, empty: total === 0, contents };
}
const yes = v => v === 'true' || v === '1';

export function mountHsds(app, { getProviders }) {
  const r = express.Router();
  r.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*').set('Cache-Control', 'public, max-age=300'); next(); });

  const data = async req => {
    let providers = [];
    try { providers = await getProviders(req.city.id); } catch (e) { console.error('hsds providers:', e.message); }
    return buildDataset(req.city, providers);
  };
  const nestService = (d, s) => ({
    ...s,
    organization: d.organizations.find(o => o.id === s.organization_id) || undefined,
    service_at_locations: d.service_at_locations.filter(x => x.service_id === s.id)
      .map(x => ({ ...x, location: d.locations.find(l => l.id === x.location_id) })),
  });
  const termMatch = (s, q) => {
    if (q.taxonomy_term_id) {
      const want = String(q.taxonomy_term_id);
      if (!(s.attributes || []).some(a => a.taxonomy_term_id === want || a.taxonomy_term?.code === want)) return false;
    }
    if (q.taxonomy_id && q.taxonomy_id !== TAXONOMY_ID) return false;
    return true;
  };
  const search = (s, q) => !q.search || `${s.name} ${s.description || ''}`.toLowerCase().includes(String(q.search).toLowerCase());

  r.get('/', (req, res) => res.json({
    version: HSDS_VERSION,
    openapi_url: OPENAPI_URL,
    description: `Help listings and food sites from ${req.city.name || 'Make It Stretch'}${req.city.place ? ` ${req.city.place}` : ''}, in the Human Services Data Specification (HSDS ${HSDS_VERSION}, Open Referral, CC BY-SA 4.0). Categories use the Open Eligibility taxonomy (CC BY-SA 3.0). Read-only. Food sites are listed by the organizations that run them and reviewed before they appear; check with the site before visiting.`,
    publisher: { name: req.city.name ? `${req.city.name}${req.city.place ? ` ${req.city.place}` : ''}` : 'Make It Stretch', website: `https://${req.city.hosts?.[0] || req.get('host')}/` },
  }));

  r.get('/services', async (req, res) => {
    const d = await data(req), q = req.query;
    let list = d.services.filter(s => termMatch(s, q) && search(s, q)
      && (!q.organization_id || s.organization_id === q.organization_id)
      && (!q.modified_after || (s.last_modified && s.last_modified >= new Date(q.modified_after).toISOString())));
    if (yes(q.minimal)) return res.json(page(list.map(s => ({ id: s.id, last_modified: s.last_modified })), { ...q, per_page: q.per_page || 200 }));
    if (yes(q.full)) list = list.map(s => nestService(d, s));
    res.json(page(list, q));
  });
  r.get('/services/:id', async (req, res) => {
    const d = await data(req), s = d.services.find(x => x.id === req.params.id);
    s ? res.json(nestService(d, s)) : res.status(404).json({ error: 'not_found' });
  });

  r.get('/organizations', async (req, res) => {
    const d = await data(req), q = req.query;
    let list = d.organizations.filter(o => !q.search || o.name.toLowerCase().includes(String(q.search).toLowerCase()));
    if (yes(q.full_service)) list = list.map(o => ({ ...o, services: d.services.filter(s => s.organization_id === o.id).map(s => nestService(d, s)) }));
    res.json(page(list, q));
  });
  r.get('/organizations/:id', async (req, res) => {
    const d = await data(req), o = d.organizations.find(x => x.id === req.params.id);
    if (!o) return res.status(404).json({ error: 'not_found' });
    res.json({ ...o, services: d.services.filter(s => s.organization_id === o.id),
      locations: d.locations.filter(l => l.organization_id === o.id) });
  });

  r.get('/service_at_locations', async (req, res) => {
    const d = await data(req), q = req.query;
    let list = d.service_at_locations.filter(x => {
      const s = d.services.find(y => y.id === x.service_id);
      return s && termMatch(s, q) && search(s, q) && (!q.organization_id || s.organization_id === q.organization_id);
    });
    if (yes(q.full)) list = list.map(x => ({ ...x, service: d.services.find(s => s.id === x.service_id), location: d.locations.find(l => l.id === x.location_id) }));
    res.json(page(list, q));
  });
  r.get('/service_at_locations/:id', async (req, res) => {
    const d = await data(req), x = d.service_at_locations.find(y => y.id === req.params.id);
    x ? res.json({ ...x, service: d.services.find(s => s.id === x.service_id), location: d.locations.find(l => l.id === x.location_id) })
      : res.status(404).json({ error: 'not_found' });
  });

  r.get('/taxonomies', (req, res) => res.json(page([TAXONOMY], req.query)));
  r.get('/taxonomies/:id', (req, res) => (req.params.id === TAXONOMY_ID ? res.json(TAXONOMY) : res.status(404).json({ error: 'not_found' })));
  r.get('/taxonomy_terms', (req, res) => {
    const q = req.query;
    let list = Object.keys(OE.terms).map(c => term(c, { detail: false }));
    if (q.taxonomy_id && q.taxonomy_id !== TAXONOMY_ID) list = [];
    if (q.parent_id) list = list.filter(t => t.parent_id === q.parent_id);
    if (q.search) list = list.filter(t => t.description.toLowerCase().includes(String(q.search).toLowerCase()));
    res.json(page(list, { ...q, per_page: q.per_page || 200 }));
  });
  r.get('/taxonomy_terms/:id', (req, res) => {
    const code = Object.keys(OE.terms).find(c => uuid5('oe:' + c) === req.params.id || c === req.params.id);
    code ? res.json(term(code)) : res.status(404).json({ error: 'not_found' });
  });

  app.use('/api/hsds', r);
}
