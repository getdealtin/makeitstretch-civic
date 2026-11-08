// Food directory: provider sign-up (public form + personal invite links),
// the public listing, and the private admin API behind /admin.
//
// Everything a provider submits goes to admin review first, including from
// invite links. Contact details are private and never leave the admin API.

import crypto from 'node:crypto';
import express from 'express';
import { PUBLIC_FIELDS, EDITABLE_FIELDS } from './db.js';
import { CITIES } from '../cities/index.js';
import { summarize } from './events.js';
import { cityReport, reportCsv, directoryCsv, rolesOf, DEFAULT_FRAMEWORK } from './report.js';
import { retailFindings } from './stores.js';
import { BLS_ITEMS } from './prices.js';
import { maintenanceFor } from './maintenance.js';
import { readFileSync } from 'node:fs';

/** Where a city's report prices come from, in one sentence (its BLS region, or the visitor's). */
const priceNote = c => `Dollar figures use ${c.price_region ? `BLS ${c.price_region}-region` : 'BLS regional'} average prices for the ${Object.keys(BLS_ITEMS).length} foods BLS prices, and documented estimates for the rest (engine/extra-foods.js lists each source), until local shelf prices are added.`;

// Zip → [lat, lon] at the center of each zip area (US Census ZCTAs, via the MIT-licensed
// us-zips package; see data/README). Used only to sort food sites by distance.
const ZIP_CENTERS = JSON.parse(readFileSync(new URL('../data/zip-centroids.json', import.meta.url), 'utf8'));

export const RECONFIRM_DAYS = 182; // about 6 months
export const KINDS = ['pantry', 'fridge', 'meals', 'mutual_aid', 'other'];
export const OFFERS = ['groceries', 'produce', 'meals', 'baby', 'hygiene', 'other', 'rent', 'health', 'childcare', 'jobs'];
export const LANGS = ['en', 'es', 'vi', 'zh', 'ar', 'other'];
const ACCESS = ['walkup', 'appointment', 'both'];

// ── Validation (shared by the public form and admin edits) ──────
const str = (v, max) => {
  if (v == null) return null;
  const s = String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};
const list = (v, allowed) => [...new Set((Array.isArray(v) ? v : []).filter(x => allowed.includes(x)))];

/** Untrusted input → clean row fields, or { error } naming the first problem. */
export function cleanProvider(b, { partial = false } = {}) {
  const out = {};
  const set = (k, v) => { if (!partial || k in b) out[k] = v; };
  set('name', str(b.name, 200));
  set('kind', KINDS.includes(b.kind) ? b.kind : null);
  set('address', str(b.address, 300));
  set('city', str(b.city, 100));
  set('zip', /^\d{5}$/.test(String(b.zip || '').trim()) ? String(b.zip).trim() : null);
  set('phone', str(b.phone, 40));
  let web = str(b.website, 300);
  if (web && !/^[a-z][a-z0-9+.-]*:/i.test(web)) web = 'https://' + web; // "pantry.org" → https://pantry.org
  if (web) {
    try {
      const u = new URL(web);
      web = (u.protocol === 'https:' || u.protocol === 'http:') && /\.[a-z]{2,}$/i.test(u.hostname) ? u.href : null;
    } catch { web = null; }
  }
  set('website', web);
  set('hours', str(b.hours, 500));
  set('access', ACCESS.includes(b.access) ? b.access : null);
  set('id_required', b.id_required === true || b.id_required === 'yes' ? true : b.id_required === false || b.id_required === 'no' ? false : null);
  set('languages', list(b.languages, LANGS));
  set('offers', list(b.offers, OFFERS));
  set('description', str(b.description, 1000));
  set('contact_name', str(b.contact_name, 200));
  const email = str(b.contact_email, 200);
  set('contact_email', email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null);
  set('contact_phone', str(b.contact_phone, 40));
  if ('admin_note' in b) out.admin_note = str(b.admin_note, 1000);

  if (!partial) {
    if (!out.name) return { error: 'name' };
    if (!out.kind) return { error: 'kind' };
    if (!out.zip) return { error: 'zip' };
    if (out.address && !out.city) return { error: 'city' }; // HSDS addresses need a city; never guessed
    if (!out.contact_email && !out.contact_phone) return { error: 'contact' };
  } else {
    if ('name' in out && !out.name) return { error: 'name' };
    if ('kind' in out && !out.kind) return { error: 'kind' };
  }
  return { row: out };
}

const pickPublic = p => Object.fromEntries(PUBLIC_FIELDS.map(f => [f, p[f] ?? null]));
const daysSince = iso => (iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : Infinity);
export const isOverdue = p => p.status === 'approved' && daysSince(p.confirmed_at) > RECONFIRM_DAYS;

/** Miles between two zip-area centers, or Infinity if either zip is unknown. */
export function zipMiles(a, b) {
  const p = ZIP_CENTERS[a], q = ZIP_CENTERS[b];
  if (!p || !q) return Infinity;
  const rad = d => (d * Math.PI) / 180;
  const dLat = rad(q[0] - p[0]), dLon = rad(q[1] - p[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p[0])) * Math.cos(rad(q[0])) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** How far "near you" reaches for food sites, in miles between ZIP-code centers. */
export const NEARBY_MILES = 10;

/**
 * A city's curated grassroots food sites (listings with a `site` in its config) in the same shape as a
 * directory listing. `resource_id` lets the page show the listing's translated description.
 */
export function curatedSites(city) {
  return (city.resources || []).filter(r => r.site).map(r => ({
    id: r.id, resource_id: r.id, name: r.name, kind: r.site.kind, address: r.site.address || null, city: r.site.city,
    zip: r.site.zip, phone: r.phone || null, website: r.url || null, hours: null, access: null, id_required: r.site.id_required ?? null,
    languages: [], offers: r.site.offers || ['groceries'], description: r.description, confirmed_at: null,
  }));
}

/** Nearest first, by real distance between zip centers. Same zip first; unknown zips last. */
export function byZip(rows, zip) {
  if (!/^\d{5}$/.test(zip || '') || !ZIP_CENTERS[zip]) return rows;
  const d = r => (r.zip === zip ? -1 : zipMiles(zip, r.zip));
  return [...rows].sort((a, b) => d(a) - d(b));
}

// ── Admin sign-in (same pattern as the prototype's /dash) ───────
// The cookie holds a hash of ADMIN_KEY, never the key; changing ADMIN_KEY signs everyone out.
const adminToken = key => crypto.createHash('sha256').update(key + '::admin::v1').digest('hex');
const getCookie = (req, name) => {
  const c = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return c ? decodeURIComponent(c.slice(name.length + 1)) : null;
};
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function mountDirectory(app, { getDb, adminKey = () => process.env.ADMIN_KEY, secureCookies = () => process.env.NODE_ENV === 'production' }) {
  const db = () => getDb();

  // Simple in-memory rate limit for the public form (IP is never stored).
  const hits = new Map();
  const limited = ip => {
    const now = Date.now(), w = hits.get(ip)?.filter(t => now - t < 3600e3) || [];
    w.push(now); hits.set(ip, w);
    return w.length > 8;
  };

  // ── Public ────────────────────────────────────────────────────
  // Food sites near a ZIP code: approved directory listings plus the city's curated grassroots sites
  // (cities/<city>.js → resources with a `site`), only those within NEARBY_MILES, nearest first. No ZIP,
  // no list: "near you" means nothing without one, and the page asks for it (owner decision Nov 8:
  // the Food Bank's finder covers its partner pantries; this list holds what its map misses, at most 3 shown).
  app.get('/api/providers', async (req, res) => {
    const zip = /^\d{5}$/.test(req.query.zip || '') ? req.query.zip : null;
    if (!zip) return res.set('Cache-Control', 'no-cache').json([]);
    try {
      const rows = [...(await db().listProviders(req.city.id, ['approved'])).map(pickPublic), ...curatedSites(req.city)];
      const near = rows.filter(r => r.zip === zip || zipMiles(zip, r.zip) <= NEARBY_MILES);
      res.set('Cache-Control', 'no-cache').json(byZip(near, zip).slice(0, 25)); // approvals show up right away
    } catch (e) { console.error(e.message); res.json(curatedSites(req.city).filter(r => r.zip === zip || zipMiles(zip, r.zip) <= NEARBY_MILES)); }
  });

  // Invite link → is it real? (The form shows the org name it was made for.)
  app.get('/api/invite/:token', async (req, res) => {
    const inv = /^[A-Za-z0-9_-]{10,64}$/.test(req.params.token) ? await db().inviteByToken(req.params.token).catch(() => null) : null;
    if (!inv || inv.city_id !== req.city.id) return res.status(404).json({ ok: false });
    res.json({ ok: true, org_name: inv.org_name });
  });

  app.post('/api/providers/submit', async (req, res) => {
    const b = req.body || {};
    if (b.company_website) return res.json({ ok: true }); // honeypot: bots fill hidden fields
    if (limited(req.ip)) return res.status(429).json({ ok: false, error: 'rate' });
    const { row, error } = cleanProvider(b);
    if (error) return res.status(400).json({ ok: false, error });
    try {
      let invite = null;
      if (typeof b.token === 'string' && /^[A-Za-z0-9_-]{10,64}$/.test(b.token)) {
        invite = await db().inviteByToken(b.token);
        if (invite && invite.city_id !== req.city.id) invite = null;
      }
      await db().insertProvider({
        ...row, city_id: req.city.id, status: 'pending',
        source: invite ? 'invite' : 'public', invite_id: invite?.id || null,
      });
      if (invite) await db().markInviteUsed(invite.id);
      res.json({ ok: true });
    } catch (e) { console.error(e.message); res.status(500).json({ ok: false, error: 'server' }); }
  });

  // ── Admin ─────────────────────────────────────────────────────
  const cookieFlags = () => `Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}${secureCookies() ? '; Secure' : ''}`;
  const authed = req => { const k = adminKey(); return !!k && getCookie(req, 'mis_admin') === adminToken(k); };

  const admin = express.Router();
  admin.use((req, res, next) => {
    // Writes must come from our own pages (blocks cross-site form posts).
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      let ok = true;
      if (origin) { try { ok = new URL(origin).host === req.headers.host; } catch { ok = false; } }
      if (!ok) return res.status(403).json({ ok: false });
    }
    next();
  });

  admin.post('/login', (req, res) => {
    const k = adminKey();
    if (!k) return res.status(503).json({ ok: false, error: 'not_configured' });
    if (!safeEqual(req.body?.password || '', k)) return res.status(401).json({ ok: false });
    res.set('Set-Cookie', `mis_admin=${adminToken(k)}; ${cookieFlags()}`).json({ ok: true });
  });
  admin.post('/logout', (req, res) => res.set('Set-Cookie', `mis_admin=; ${cookieFlags().replace(/Max-Age=\d+/, 'Max-Age=0')}`).json({ ok: true }));

  admin.use((req, res, next) => {
    if (!adminKey()) return res.status(503).json({ ok: false, error: 'not_configured' });
    if (!authed(req)) return res.status(401).json({ ok: false, error: 'signin' });
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Admin picks the city (one admin page for every city).
  const cityOf = req => {
    const id = req.query.city || req.body?.city;
    return CITIES[id] && id !== 'national' ? id : (req.city.id !== 'national' ? req.city.id : Object.keys(CITIES).find(c => c !== 'national'));
  };

  const inviteLink = (city, req, token) => {
    const host = CITIES[city].hosts[0];
    return `${host ? 'https' : req.protocol}://${host || req.headers.host}/join/${token}`;
  };

  // Activity for the date range picked in /admin (7, 30, 90 or 365 days).
  const activityFor = async (city, daysParam) => {
    const days = [7, 30, 90, 365].includes(Number(daysParam)) ? Number(daysParam) : 30;
    const since = new Date(Date.now() - days * 864e5).toISOString();
    try { return { available: true, days, ...summarize(await db().listEvents(city, since), rolesOf(CITIES[city].resources)) }; }
    catch (e) { console.error(e.message); return { available: false, error: true, days }; }
  };

  admin.get('/summary', async (req, res) => {
    const city = cityOf(req);
    try {
      const [all, invites, reviews] = await Promise.all([db().listProviders(city), db().listInvites(city), db().listReviews()]);
      const byInvite = Object.fromEntries(all.filter(p => p.invite_id).map(p => [p.invite_id, { id: p.id, name: p.name, status: p.status }]));
      res.json({
        city, cities: Object.values(CITIES).filter(c => c.id !== 'national').map(c => ({ id: c.id, place: c.place })),
        db: db().kind,
        pending: all.filter(p => p.status === 'pending'),
        overdue: all.filter(isOverdue),
        approved: all.filter(p => p.status === 'approved'),
        hidden: all.filter(p => p.status === 'hidden' || p.status === 'rejected'),
        invites: invites.map(i => ({ ...i, link: inviteLink(city, req, i.token), submission: byInvite[i.id] || null })),
        reviews,
        reconfirm_days: RECONFIRM_DAYS,
        activity: await activityFor(city, req.query.days),
        maintenance: maintenanceFor(CITIES[city]),
      });
    } catch (e) { console.error(e.message); res.status(500).json({ ok: false, error: 'db' }); }
  });

  const STATUS_FOR = { approve: 'approved', reject: 'rejected', hide: 'hidden', restore: 'approved' };
  admin.post('/providers/:id', async (req, res) => {
    const { action } = req.body || {};
    const p = await db().getProvider(req.params.id).catch(() => null);
    if (!p) return res.status(404).json({ ok: false });
    const now = new Date().toISOString();
    let patch;
    if (STATUS_FOR[action]) {
      patch = { status: STATUS_FOR[action], reviewed_at: now };
      if (action === 'approve' || action === 'restore') patch.confirmed_at = now;
    } else if (action === 'confirm') patch = { confirmed_at: now };
    else if (action === 'edit') {
      const { row, error } = cleanProvider(req.body.fields || {}, { partial: true });
      if (error) return res.status(400).json({ ok: false, error });
      patch = Object.fromEntries(Object.entries(row).filter(([k]) => EDITABLE_FIELDS.includes(k)));
    } else return res.status(400).json({ ok: false, error: 'action' });
    res.json({ ok: true, provider: await db().updateProvider(p.id, patch) });
  });

  // Admin adds a listing directly (e.g. from a phone call): goes live immediately.
  admin.post('/providers', async (req, res) => {
    const { row, error } = cleanProvider(req.body?.fields || {});
    if (error) return res.status(400).json({ ok: false, error });
    const now = new Date().toISOString();
    res.json({ ok: true, provider: await db().insertProvider({ ...row, city_id: cityOf(req), status: 'approved', source: 'admin', reviewed_at: now, confirmed_at: now }) });
  });

  admin.post('/invites', async (req, res) => {
    const org = str(req.body?.org_name, 200);
    if (!org) return res.status(400).json({ ok: false, error: 'org_name' });
    const city = cityOf(req);
    const inv = await db().createInvite(city, org);
    res.json({ ok: true, invite: inv, link: inviteLink(city, req, inv.token) });
  });

  // ── City report (Phase 5) and directory download ──
  const reportFor = async req => {
    const city = cityOf(req);
    const day = s => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null);
    const to = day(req.query.to) || new Date().toISOString().slice(0, 10);
    const from = day(req.query.from) || new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const [events, providers] = await Promise.all([
      db().listEvents(city, from + 'T00:00:00Z'),
      db().listProviders(city, ['approved']),
    ]);
    const inRange = events.filter(e => e.created_at.slice(0, 10) <= to);
    const c = CITIES[city];
    return cityReport(inRange, { k: c.k_anon_threshold || 15, providers, from, to, city: c.place || c.name || city, roles: rolesOf(c.resources), framework: c.report || DEFAULT_FRAMEWORK, retail: retailFindings(c),
      local: c.local || {}, prices: priceNote(c) });
  };
  admin.get('/report', async (req, res) => {
    try { res.json(await reportFor(req)); } catch (e) { console.error(e.message); res.status(500).json({ ok: false }); }
  });
  admin.get('/report.csv', async (req, res) => {
    try {
      const r = await reportFor(req);
      res.type('text/csv').set('Content-Disposition', `attachment; filename="make-it-stretch-report-${r.from}-to-${r.to}.csv"`).send(reportCsv(r));
    } catch (e) { console.error(e.message); res.status(500).end(); }
  });
  admin.get('/directory.csv', async (req, res) => {
    const city = cityOf(req);
    const rows = await db().listProviders(city, ['approved']);
    res.type('text/csv').set('Content-Disposition', `attachment; filename="food-sites-${city}-${new Date().toISOString().slice(0, 10)}.csv"`).send(directoryCsv(rows));
  });

  admin.post('/reviews/:lang', async (req, res) => {
    const status = req.body?.status === 'approved' ? 'approved' : 'pending';
    const r = await db().updateReview(req.params.lang, {
      status, reviewer: str(req.body?.reviewer, 200), note: str(req.body?.note, 1000),
      reviewed_at: status === 'approved' ? new Date().toISOString() : null,
    });
    if (!r) return res.status(404).json({ ok: false });
    res.json({ ok: true, review: r });
  });

  app.use('/api/admin', admin);
}
