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
  const providers = new Map(), invites = new Map(), priceCache = new Map();
  const events = [], messages = [], community = [];
  let communityNum = 0;
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
    /** Every event of these visits, in any city (a visit can start on the main site and move to a partner city). */
    async listEventsForSessions(ids) { const set = new Set(ids); return events.filter(e => set.has(e.session_id)).map(copy); },
    /** One site: move a visit's events since `since` from one city to another (see /api/event/move). */
    async moveSession(sessionId, from, to, since) { for (const e of events) if (e.session_id === sessionId && e.city_id === from && e.created_at >= since) e.city_id = to; },
    async updateReview(lang, patch) { const r = reviews.get(lang); if (!r) return null; Object.assign(r, patch); return copy(r); },
    // "Stay connected" (db/messages.sql): newest first.
    async insertMessage(row) { const m = { ...row, id: crypto.randomUUID(), created_at: now() }; messages.push(m); return copy(m); },
    async listMessages(limit = 200) { return [...messages].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit).map(copy); },
    async deleteMessage(id) { const i = messages.findIndex(m => m.id === id); if (i >= 0) messages.splice(i, 1); },
    // Community recipes (db/community-recipes.sql).
    async insertCommunityRecipe(row) { const r = { extras: [], status: 'pending', reviewed_at: null, ...row, id: crypto.randomUUID(), num: ++communityNum, submitted_at: now() }; community.push(r); return copy(r); },
    async listCommunityRecipes(statuses) { return community.filter(r => !statuses || statuses.includes(r.status)).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)).map(copy); },
    async getCommunityRecipe(id) { return copy(community.find(r => r.id === id)); },
    async updateCommunityRecipe(id, patch) { const r = community.find(x => x.id === id); if (!r) return null; Object.assign(r, patch); return copy(r); },
    async getPriceCache(region) { return copy(priceCache.get(region)); },
    async savePriceCache(region, prices, fetchedAt) { priceCache.set(region, { region, prices, fetched_at: fetchedAt }); },
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
    // One site: a visit's events since its plan or box started move from the main site to a partner city.
    moveSession: (sessionId, from, to, since) => call(`events?session_id=eq.${enc(sessionId)}&city_id=eq.${enc(from)}&created_at=gte.${enc(since)}`, { method: 'PATCH', body: { city_id: to }, prefer: 'return=minimal' }),
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
    // Every event of these visits, in any city; ids are 12-character visit codes (checked when stored), 100 per request.
    listEventsForSessions: async ids => {
      const out = [];
      const safe = ids.filter(id => /^[a-z0-9]{12}$/.test(id));
      for (let i = 0; i < safe.length; i += 100) {
        out.push(...await call(`events?select=session_id,city_id,event,lang,data,created_at&session_id=in.(${safe.slice(i, i + 100).join(',')})&order=created_at.asc&limit=5000`));
      }
      return out;
    },
    updateReview: async (lang, patch) => one(await call(`translation_reviews?lang=eq.${enc(lang)}`, { method: 'PATCH', body: patch, prefer: 'return=representation' })),
    // Community recipes (db/community-recipes.sql).
    insertCommunityRecipe: async row => one(await call('community_recipes', { method: 'POST', body: row, prefer: 'return=representation' })),
    listCommunityRecipes: statuses => call(`community_recipes?order=submitted_at.desc${statuses ? `&status=in.(${statuses.map(enc).join(',')})` : ''}`),
    getCommunityRecipe: async id => one(await call(`community_recipes?id=eq.${enc(id)}`)),
    updateCommunityRecipe: async (id, patch) => one(await call(`community_recipes?id=eq.${enc(id)}`, { method: 'PATCH', body: patch, prefer: 'return=representation' })),
    // "Stay connected" (db/messages.sql): newest first.
    insertMessage: async row => one(await call('messages', { method: 'POST', body: row, prefer: 'return=representation' })),
    listMessages: (limit = 200) => call(`messages?order=created_at.desc&limit=${Number(limit) || 200}`),
    deleteMessage: id => call(`messages?id=eq.${enc(id)}`, { method: 'DELETE', prefer: 'return=minimal' }),
    // Last good BLS prices per region (db/price-cache.sql), so a restart keeps them.
    getPriceCache: async region => one(await call(`price_cache?region=eq.${enc(region)}&select=region,prices,fetched_at`)),
    savePriceCache: (region, prices, fetchedAt) => call('price_cache?on_conflict=region', { method: 'POST', body: { region, prices, fetched_at: fetchedAt }, prefer: 'resolution=merge-duplicates,return=minimal' }),
  };
}

export function makeDb(env = process.env) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SECRET_KEY || env.SUPABASE_KEY;
  return url && key ? supabaseDb({ url, key }) : memoryDb();
}
