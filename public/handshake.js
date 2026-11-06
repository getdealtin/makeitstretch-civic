// The consent handshake: a resident asks a service to contact her, sending only what she chooses.
// Shared by the browser (form + preview) and the server (the same checks again). No DOM here.
//
// How it works (off until a city turns it on: handshake: { enabled: true } in its config):
//   1. Matching happens on her phone. The "Need help with anything else?" panel already picks
//      services for a need from public listings, so nothing about her is sent to find them.
//   2. She picks one service that accepts requests and fills in only what she wants to share.
//   3. She sees exactly what will be sent, to whom, and agrees.
//   4. The server checks it again and passes it to that one service. It keeps no copy.

export const CONSENT_VERSION = '2026-11-06';

/** What she can share. Nothing else is ever accepted. */
export const FIELDS = [
  { key: 'first_name', max: 60 },
  { key: 'phone', max: 30, pattern: /^[0-9+().\-\s]{7,30}$/ },
  { key: 'email', max: 200, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  { key: 'reach_by', choices: ['call', 'text', 'email'] },
  { key: 'language', choices: ['en', 'es', 'vi', 'zh-Hans', 'other'] },
  { key: 'zip', pattern: /^\d{5}$/ },
  { key: 'note', max: 500 },
];
export const NEEDS = ['rent', 'health', 'childcare', 'jobs'];

const clean = (v, max) => {
  if (v == null) return '';
  return String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 200);
};

/**
 * Untrusted request → { request } or { error }. A request is { target, need, fields, consent }.
 * Unknown fields are dropped, empty ones left out, and there must be a way to reach her.
 */
export function cleanRequest(b = {}) {
  const target = clean(b.target, 80);
  if (!/^(resource|site):[A-Za-z0-9-]{1,64}$/.test(target)) return { error: 'target' };
  const need = NEEDS.includes(b.need) ? b.need : null;
  if (!need) return { error: 'need' };
  const fields = {};
  for (const f of FIELDS) {
    const v = clean(b.fields?.[f.key], f.max);
    if (!v) continue;
    if (f.choices && !f.choices.includes(v)) return { error: f.key };
    if (f.pattern && !f.pattern.test(v)) return { error: f.key };
    fields[f.key] = v;
  }
  if (!fields.phone && !fields.email) return { error: 'contact' };
  if (fields.reach_by === 'email' && !fields.email) return { error: 'email' };
  if ((fields.reach_by === 'call' || fields.reach_by === 'text') && !fields.phone) return { error: 'phone' };
  if (b.consent?.agreed !== true || b.consent?.version !== CONSENT_VERSION) return { error: 'consent' };
  return { request: { target, need, fields, consent: { version: CONSENT_VERSION, agreed: true } } };
}

/** Exactly what will be sent, in order, as [field key, value] pairs, for the preview she approves. */
export const preview = fields => FIELDS.filter(f => fields[f.key]).map(f => [f.key, fields[f.key]]);
