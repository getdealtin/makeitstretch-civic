// Offline helper for the installed app (owner request, Nov 11 2026).
//
// Network first, always: when there's a connection, people get the latest site, prices and listings
// (so a deploy reaches phones right away). Each page, script, price list and recipe file that loads
// is kept in a cache, and when there's no connection (or it hangs for SLOW_MS), the kept copy is used.
// That's enough for the planner to work offline: it runs in the browser from the kept engine,
// recipes and prices. Saved plans already live on the phone (keep.js).
//
// Never kept: anything that isn't a plain GET, anonymous usage events, admin and partner pages.

const CACHE = 'mis-v1';
const SLOW_MS = 4000;
const NEVER = [/^\/api\/event/, /^\/api\/admin/, /^\/admin/, /^\/join\//, /^\/add-site/, /^\/api\/providers\/submit/];

self.addEventListener('install', e => {
  // Keep the home page from the start, so opening the app offline always shows something.
  e.waitUntil(caches.open(CACHE).then(c => c.add('/')).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('mis-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || NEVER.some(re => re.test(url.pathname))) return;
  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const kept = () => cache.match(req, { ignoreVary: true })
    .then(hit => hit || (req.mode === 'navigate' ? cache.match('/') : undefined));
  const fresh = fetch(req).then(res => {
    if (res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  // A hanging connection (one bar in a store aisle) falls back to the kept copy after SLOW_MS.
  const slow = new Promise(resolve => setTimeout(resolve, SLOW_MS)).then(kept);
  try {
    const first = await Promise.race([fresh, slow]);
    if (first) return first;
    return await fresh;
  } catch {
    const hit = await kept();
    if (hit) return hit;
    throw new Error('offline and not kept');
  }
}
