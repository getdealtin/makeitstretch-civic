// "Keep this plan", with no account and nothing stored on our server.
//   • Link:   the plan's inputs are packed into the URL after "#". Browsers never
//             send that part to the server, and the engine is deterministic, so the
//             link rebuilds the exact same plan.
//   • Phone:  the same packed state in this browser's localStorage (opt-in only).
//   • Text / email: opens the person's own app with the list filled in.
// Pure functions here; app.js wires them to the page.

import { BOX_GROUPS } from '../engine/box.js';

const ALLOWED = {
  leftover: ['yes', 'sometimes', 'no'],
  store: ['full', 'dollar', 'corner'],
  cuisine: ['american', 'latin', 'asian', 'southern', 'mediterranean'],
  avoid: ['gluten', 'dairy', 'meat', 'eggs', 'peanuts', 'fish'],
  have: ['rice', 'beans', 'oats', 'eggs', 'potatoes', 'bread', 'pasta', 'oil'],
  boxItems: BOX_GROUPS.flatMap(g => g.items),
};
const pick = (v, key) => (Array.isArray(v) ? v : []).filter(x => ALLOWED[key].includes(x));
const one = (v, key, dflt) => (ALLOWED[key].includes(v) ? v : dflt);

// ── Packing ─────────────────────────────────────────────────────
export function encodeState(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeState(str) {
  try {
    const bin = atob(String(str).replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  } catch { return null; }
}

/** answers + swaps + checkmarks → compact object. */
export function packPlan(a, { swaps = [], checked = [] } = {}) {
  return {
    v: 1, t: 'p', b: a.budget, d: a.days, p: a.people, z: a.zip || undefined,
    l: a.leftover, s: a.store, c: a.cuisine, a: a.avoid, h: a.have,
    w: swaps.length ? swaps : undefined, k: checked.length ? checked : undefined,
  };
}

/** Untrusted input (a link anyone could edit) → safe answers, or null. */
export function unpackPlan(o) {
  if (!o || o.t !== 'p') return null;
  const budget = Number(o.b), days = Number(o.d), people = Number(o.p);
  if (!(budget >= 1 && budget <= 9999) || !(days >= 1 && days <= 31) || !(people >= 1 && people <= 20)) return null;
  return {
    answers: {
      budget, days, people, zip: /^\d{5}$/.test(o.z || '') ? o.z : null,
      leftover: one(o.l, 'leftover', 'sometimes'), store: one(o.s, 'store', 'full'),
      cuisine: pick(o.c, 'cuisine'), avoid: pick(o.a, 'avoid'), have: pick(o.h, 'have'),
    },
    swaps: (Array.isArray(o.w) ? o.w : []).filter(k => /^\d{1,2}-\d-(breakfast|lunch|dinner)$/.test(k)),
    checked: (Array.isArray(o.k) ? o.k : []).filter(k => /^[a-z]{2,20}$/.test(k)),
  };
}

export const packBox = b => ({ v: 1, t: 'b', i: b.items, a: b.avoid.length ? b.avoid : undefined });

export function unpackBox(o) {
  if (!o || o.t !== 'b') return null;
  const items = pick(o.i, 'boxItems');
  return items.length ? { items, avoid: pick(o.a, 'avoid') } : null;
}

/** "#p=…" / "#b=…" → { kind, state } or null. */
export function readHash(hash) {
  const m = /^#([pb])=([A-Za-z0-9_-]+)$/.exec(hash || '');
  if (!m) return null;
  const raw = decodeState(m[2]);
  const state = m[1] === 'p' ? unpackPlan(raw) : unpackBox(raw);
  return state ? { kind: m[1] === 'p' ? 'plan' : 'box', state } : null;
}

export const planHash = packed => '#p=' + encodeState(packed);
export const boxHash = packed => '#b=' + encodeState(packed);

// ── Text for "Text it to me" / "Email it to me" ─────────────────
const money = n => Number(n).toFixed(2);

/** Shopping list (+ week 1 meals for email) as plain text. */
export function planText({ title, shopping, weeks, choice = {}, total, url, labels, full = false, titleOf = r => r.title }) {
  const lines = [title, '', `${labels.list} ($${money(total)})`];
  for (const g of shopping) for (const i of g.items) lines.push(`☐ ${i.label} ×${i.qty}  $${money(i.subtotal)}`);
  if (full && weeks.length) {
    lines.push('', labels.week1);
    weeks[0].forEach((d, di) => {
      if (d.leftover) { lines.push(`${d.dayName}: ${labels.leftover}`); return; }
      const meals = ['breakfast', 'lunch', 'dinner'].map(sl => d[sl][choice[`0-${di}-${sl}`] || 0]).filter(Boolean).map(titleOf);
      lines.push(`${d.dayName}: ${meals.join(' · ')}`);
    });
  }
  lines.push('', `${labels.link} ${url}`);
  return lines.join('\n');
}

export function boxText({ title, matches, url, labels, titleOf = r => r.title, ingOf = w => w }) {
  const lines = [title, ''];
  for (const m of matches) lines.push(`• ${titleOf(m.recipe)}${m.missing.length ? ` (${labels.need}: ${m.missing.map(ingOf).join(', ')})` : ''}`);
  lines.push('', `${labels.link} ${url}`);
  return lines.join('\n');
}

// iOS and Android both accept "sms:?&body=".
export const smsHref = body => 'sms:?&body=' + encodeURIComponent(body);
export const mailHref = (subject, body) => 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);

// ── Saved plans on this phone: a list, newest first ─────────────
// Entry: { id, kind: 'plan'|'box', hash, title, detail, at }. Capped so storage stays small;
// past the cap the oldest entry drops off (the page says so).
export const SAVED_MAX = 12;

export function savedList(st, key) {
  const v = st.get(key);
  if (Array.isArray(v)) return v.filter(e => e && typeof e.hash === 'string' && e.id);
  // Carry over the earlier one-slot format ({ hash, title, at }).
  if (v && typeof v.hash === 'string') {
    const list = [{ id: 'm' + (v.at || 0), kind: v.hash.startsWith('#b=') ? 'box' : 'plan', hash: v.hash, title: v.title || '', detail: '', at: v.at || 0 }];
    st.set(key, list);
    return list;
  }
  return [];
}

/** Adds to the top of the list. Returns { id, dropped } (dropped = how many old entries fell off), or null if storage failed. */
export function addSaved(st, key, entry, now = Date.now()) {
  const id = 's' + now.toString(36) + Math.random().toString(36).slice(2, 6);
  const list = [{ id, at: now, ...entry }, ...savedList(st, key)];
  const kept = list.slice(0, SAVED_MAX);
  return st.set(key, kept) ? { id, dropped: list.length - kept.length } : null;
}

export function updateSaved(st, key, id, patch) {
  const list = savedList(st, key);
  const i = list.findIndex(e => e.id === id);
  if (i < 0) return false;
  list[i] = { ...list[i], ...patch };
  return st.set(key, list);
}

export function removeSaved(st, key, id) {
  const list = savedList(st, key).filter(e => e.id !== id);
  return list.length ? st.set(key, list) : (st.del(key), true);
}

export const findSaved = (st, key, id) => savedList(st, key).find(e => e.id === id) || null;

// ── This-phone storage (opt-in; private mode or blocked storage fails quietly) ──
export const store = {
  get(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; } },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};
