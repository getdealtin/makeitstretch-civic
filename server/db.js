// Database access for the food directory, invites and translation reviews.
// Two implementations behind one interface:
//   • supabaseDb: the real one (Supabase REST/PostgREST, server-side secret key).
//   • memoryDb:   in-process, for tests and local runs without database keys.
// Every row is tagged with city_id: one database serves every city.

import crypto from 'node:crypto';

export const PUBLIC_FIELDS = [
  'id', 'name', 'kind', 'address', 'city', 'zip', 'phone', 'website', 'hours',
  'access', 'id_required', 'languages', 'offers', 'description', 'confirmed_at',
];
export const EDITABLE_FIELDS = [
  ...PUBLIC_FIELDS.filter(f => f !== 'id' && f !== 'confirmed_at'),
  'contact_name', 'contact_email', 'contact_phone', 'admin_note',
];

export const newToken = () => crypto.randomBytes(18).toString('base64url');

// ── In-memory ───────────────────────────────────────────────────
export function memoryDb() {
  const providers = new Map(), invites = new Map();
  const events = [];
  const reviews = new Map(['es', 'vi', 'zh-Hans'].map(l => [l, { lang: l, status: 'pending', reviewer: null, reviewed_at: null, note: null }]));
  const now = () => new Date().toISOString();
  const copy = o => (o ? structuredClone(o) : null);
  return {
    kind: 'memory',
    async listProviders(city, statuses) {
      return [...providers.values()].filter(p => p.city_id === city && (!statuses || statuses.includes(p.status)))
        .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)).map(copy);
    },
    async getProvider(id) { return copy(providers.get(id)); },
    async insertProvider(row) {
      const p = {
        languages: [], offers: [], status: 'pending', reviewed_at: null, confirmed_at: null, invite_id: null,
        ...row, id: crypto.randomUUID(), submitted_at: now(), updated_at: now(),
      };
      providers.set(p.id, p); return copy(p);
    },
    async updateProvider(id, patch) {
      const p = providers.get(id); if (!p) return null;
      Object.assign(p, patch, { updated_at: now() }); return copy(p);
    },
    async createInvite(city, orgName) {
      const i = { id: crypto.randomUUID(), city_id: city, org_name: orgName, token: newToken(), created_at: now(), used_at: null };
      invites.set(i.id, i); return copy(i);
    },
    async inviteByToken(token) { return copy([...invites.values()].find(i => i.token === token)); },
    async markInviteUsed(id) { const i = invites.get(id); if (i && !i.used_at) i.used_at = now(); },
    async listInvites(city) {
      return [...invites.values()].filter(i => i.city_id === city).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(copy);
    },
    async listReviews() { return [...reviews.values()].map(copy); },
    async insertEvent(ev) { events.push({ ...ev, created_at: now() }); },
    async listEvents(city, since) { return events.filter(e => e.city_id === city && e.created_at >= since).map(copy); },
    async updateReview(lang, patch) { const r = reviews.get(lang); if (!r) return null; Object.assign(r, patch); return copy(r); },
  };
}

// ── Supabase (PostgREST) ────────────────────────────────────────
export function supabaseDb({ url, key, fetchImpl = fetch }) {
  const base = url.replace(/\/+$/, '') + '/rest/v1/';
  const call = async (path, { method = 'GET', body, prefer } = {}) => {
    const r = await fetchImpl(base + path, {
      method,
      headers: {
        apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`db ${method} ${path.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.status === 204 ? null : r.json();
  };
  const enc = encodeURIComponent;
  const one = rows => (Array.isArray(rows) ? rows[0] || null : rows);
  return {
    kind: 'supabase',
    listProviders: (city, statuses) => call(`providers?city_id=eq.${enc(city)}${statuses ? `&status=in.(${statuses.map(enc).join(',')})` : ''}&order=submitted_at.desc`),
    getProvider: async id => one(await call(`providers?id=eq.${enc(id)}`)),
    insertProvider: async row => one(await call('providers', { method: 'POST', body: row, prefer: 'return=representation' })),
    updateProvider: async (id, patch) => one(await call(`providers?id=eq.${enc(id)}`, { method: 'PATCH', body: { ...patch, updated_at: new Date().toISOString() }, prefer: 'return=representation' })),
    createInvite: async (city, orgName) => one(await call('invites', { method: 'POST', body: { city_id: city, org_name: orgName, token: newToken() }, prefer: 'return=representation' })),
    inviteByToken: async token => one(await call(`invites?token=eq.${enc(token)}`)),
    markInviteUsed: id => call(`invites?id=eq.${enc(id)}&used_at=is.null`, { method: 'PATCH', body: { used_at: new Date().toISOString() } }),
    listInvites: city => call(`invites?city_id=eq.${enc(city)}&order=created_at.desc`),
    listReviews: () => call('translation_reviews?order=lang'),
    insertEvent: ev => call('events', { method: 'POST', body: ev, prefer: 'return=minimal' }),
    // PostgREST returns at most 1,000 rows per request, so page through.
    listEvents: async (city, since) => {
      const out = [];
      for (let off = 0; off < 200000; off += 1000) {
        const page = await call(`events?select=session_id,event,lang,data,created_at&city_id=eq.${enc(city)}&created_at=gte.${enc(since)}&order=created_at.asc&limit=1000&offset=${off}`);
        out.push(...page);
        if (page.length < 1000) break;
      }
      return out;
    },
    updateReview: async (lang, patch) => one(await call(`translation_reviews?lang=eq.${enc(lang)}`, { method: 'PATCH', body: patch, prefer: 'return=representation' })),
  };
}

export function makeDb(env = process.env) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SECRET_KEY || env.SUPABASE_KEY;
  return url && key ? supabaseDb({ url, key }) : memoryDb();
}
