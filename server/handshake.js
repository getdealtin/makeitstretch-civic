// The consent handshake, server side (see public/handshake.js for the whole flow).
// Off unless a city sets handshake: { enabled: true }. While off, every route answers 404.
//
// The server is a relay, not a store: a request is checked, handed to the one service she chose,
// and dropped. Nothing is written to the database or the logs. What exists today:
//   • the checks, the routes and the consent record (version + agreed);
//   • receivers: which services accept requests, and where to deliver (server-only; never public);
//   • delivery: no real channel yet. Until one is added (email to the service's intake address, or
//     a service dashboard), sending answers 503 'no_delivery' and nothing leaves the server.
// Before turning it on: a delivery channel, services that agree to receive, the privacy page,
// and a security review.
import express from 'express';
import { cleanRequest } from '../public/handshake.js';

// Local preview only: HANDSHAKE_DEMO=1 turns it on with every "Need help" listing as a receiver and
// a delivery that throws the request away. Refused in production.
const demo = () => process.env.HANDSHAKE_DEMO === '1' && process.env.NODE_ENV !== 'production';

export const handshakeOn = city => demo() || city?.handshake?.enabled === true;

/** target ("resource:<id>" | "site:<uuid>") → { name, deliver } for services that accept requests. */
export function receiversFor(city) {
  if (demo()) return Object.fromEntries((city.resources || []).filter(r => r.audience === 'needs')
    .map(r => [`resource:${r.id}`, { name: r.org || r.name, deliver: 'discard' }]));
  return { ...(city.handshake?.receivers || {}) };
}

const DELIVERY = {
  discard: async () => {}, // demo: nothing is sent anywhere
};

export function mountHandshake(app, { delivery = DELIVERY } = {}) {
  const r = express.Router();
  const hits = new Map();
  const limited = ip => {
    const now = Date.now(), w = (hits.get(ip) || []).filter(t => now - t < 3600e3);
    w.push(now); hits.set(ip, w);
    return w.length > 5;
  };
  r.use((req, res, next) => (handshakeOn(req.city) ? next() : res.status(404).json({ error: 'not_enabled' })));

  // Which services accept requests: target ids and names only.
  r.get('/receivers', (req, res) => res.set('Cache-Control', 'no-cache')
    .json(Object.entries(receiversFor(req.city)).map(([target, v]) => ({ target, name: v.name }))));

  r.post('/request', express.json({ limit: '4kb' }), async (req, res) => {
    if (limited(req.ip)) return res.status(429).json({ ok: false, error: 'rate' });
    const { request, error } = cleanRequest(req.body);
    if (error) return res.status(400).json({ ok: false, error });
    const to = receiversFor(req.city)[request.target];
    if (!to) return res.status(400).json({ ok: false, error: 'target' });
    const send = delivery[to.deliver];
    if (!send) return res.status(503).json({ ok: false, error: 'no_delivery' });
    try {
      await send(to, { ...request, city: req.city.id, sent_at: new Date().toISOString() });
    } catch {
      return res.status(502).json({ ok: false, error: 'delivery_failed' }); // never log the request
    }
    res.json({ ok: true, sent_to: to.name });
  });

  app.use('/api/handshake', r);
}
