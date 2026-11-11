// Live BLS prices that survive a BLS outage (owner go-ahead, Nov 11 2026).
//
// Before: each region's BLS prices were kept 24 hours in memory. When BLS was down or slow, every
// request waited up to 8 seconds for it again, a lapsed day dropped straight to the built-in
// averages, and every restart or deploy started empty. Now:
//   1. Fresh prices (under 24 hours old) are used as they are.
//   2. When they're older, BLS is asked again. If it fails, the last good prices are kept (BLS
//      updates monthly, so yesterday's are close) and BLS isn't asked again for 15 minutes, so
//      people don't wait and the daily request limit isn't used up.
//   3. The last good prices are saved in the database, so a restart picks up where it left off.
//   4. status() says how old each region's prices are, for the admin page.
// The built-in averages are used only when there have never been live prices for a region.

export const FRESH_MS = 24 * 3600e3;   // ask BLS again after this
export const RETRY_MS = 15 * 60e3;     // after a failure, wait this long before asking again
export const STALE_MS = 3 * 24 * 3600e3; // the admin page flags prices older than this

/**
 * @param {object} o
 * @param {(region: string) => Promise<object|null>} o.fetchPrices  ask BLS; null on any failure
 * @param {{ load: (region) => Promise<{prices, fetched_at}|null>, save: (region, prices, fetchedAt) => Promise<void> }} [o.store]
 * @param {() => number} [o.now]
 */
export function makeLivePrices({ fetchPrices, store = null, now = () => Date.now() }) {
  const mem = new Map();       // region → { prices, at }
  const failedAt = new Map();  // region → time of the last failed ask
  const loaded = new Set();    // regions already looked up in the store
  const asking = new Map();    // region → the ask in flight (one at a time per region)

  async function fromStore(region) {
    if (loaded.has(region) || !store) return;
    loaded.add(region);
    try {
      const row = await store.load(region);
      const at = row && Date.parse(row.fetched_at);
      if (row?.prices && at && !(mem.get(region)?.at > at)) mem.set(region, { prices: row.prices, at });
    } catch (e) { console.warn('[prices] could not read saved prices:', e.message); }
  }

  async function ask(region) {
    const prices = await fetchPrices(region).catch(() => null);
    if (!prices || !Object.keys(prices).length) {
      failedAt.set(region, now());
      console.warn(`[prices] BLS did not answer for ${region}; ${mem.has(region) ? 'keeping the last good prices' : 'using built-in averages'}`);
      return;
    }
    failedAt.delete(region);
    const at = now();
    mem.set(region, { prices, at });
    if (store) await store.save(region, prices, new Date(at).toISOString()).catch(e => console.warn('[prices] could not save prices:', e.message));
  }

  return {
    /** The best live prices for a region (fresh, or the last good ones), or null if there have never been any. */
    async get(region) {
      await fromStore(region);
      const hit = mem.get(region);
      const fresh = hit && now() - hit.at < FRESH_MS;
      const waiting = failedAt.has(region) && now() - failedAt.get(region) < RETRY_MS;
      if (!fresh && !waiting) {
        if (!asking.has(region)) asking.set(region, ask(region).finally(() => asking.delete(region)));
        await asking.get(region);
      }
      return mem.get(region)?.prices || null;
    },
    /** How old each region's live prices are, for the admin page. */
    status() {
      const t = now();
      return [...new Set([...mem.keys(), ...failedAt.keys()])].sort().map(region => {
        const hit = mem.get(region);
        return { region, fetched_at: hit ? new Date(hit.at).toISOString() : null, stale: !hit || t - hit.at > STALE_MS,
          last_failure: failedAt.has(region) ? new Date(failedAt.get(region)).toISOString() : null };
      });
    },
  };
}
