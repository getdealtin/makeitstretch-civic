// "Stay connected" (owner decision, Nov 22 2026): the About page's form for updates, partners and press.
// The one place the site keeps an email address, and only because the person typed it in to be contacted
// (privacy policy: "If you sign up to stay connected…"). Stored in public.messages (db/messages.sql); the
// owner reads them in /admin and deletes one when someone asks to be removed.

export const ROLES = ['resident', 'partner', 'press', 'other'];
const LANGS = ['en', 'es', 'vi', 'zh-Hans'];
// A plain address check: something@something.something, no spaces, at most 254 characters.
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,189}\.[^\s@<>".]{2,}$/;

/** Untrusted request body → { email, role, message, lang } or null. */
export function cleanMessage(b) {
  if (!b || typeof b !== 'object') return null;
  if (b.website) return null; // a hidden field people never see; bots fill it in
  const email = String(b.email ?? '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return null;
  const role = ROLES.includes(b.role) ? b.role : 'other';
  // Message: optional, plain text, control characters dropped, at most 1,000 characters.
  const message = String(b.message ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 1000) || null;
  return { email, role, message, lang: LANGS.includes(b.lang) ? b.lang : 'en' };
}

/** @param {import('express').Express} app @param {{getDb: () => object}} opts */
export function mountConnect(app, { getDb }) {
  // Spam limit: 10 sign-ups per visitor per hour. The IP is used in memory here and never stored.
  const hits = new Map();
  setInterval(() => hits.clear(), 60 * 60e3).unref();
  app.post('/api/connect', async (req, res) => {
    const n = (hits.get(req.ip) || 0) + 1; hits.set(req.ip, n);
    if (n > 10) return res.status(429).json({ ok: false });
    // Only from our own pages (blocks cross-site form posts).
    const origin = req.headers.origin;
    if (origin) { try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ ok: false }); } catch { return res.status(403).json({ ok: false }); } }
    const m = cleanMessage(req.body);
    if (!m) return res.status(400).json({ ok: false, error: 'email' });
    try { await getDb().insertMessage({ ...m, city_id: req.city.id }); res.json({ ok: true }); }
    catch (e) { console.error(e.message); res.status(500).json({ ok: false }); }
  });
}
