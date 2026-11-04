// City registry + resolver. One deploy serves every city; the request's host
// picks the config card (austin.makeitstretch.org → austin). A vanity domain
// is just another entry in that city's `hosts`.
import austin from './austin.js';
import national from './national.js';

export const CITIES = { austin, national };

/**
 * @param {string} host          request Host header
 * @param {string} [override]    ?city= query param (dev/testing only)
 * @param {string} [fallback]    DEFAULT_CITY env var
 */
export function resolveCity(host = '', override, fallback = 'national') {
  if (override && CITIES[override]) return CITIES[override];
  const h = host.toLowerCase().split(':')[0];
  for (const c of Object.values(CITIES)) if (c.hosts.includes(h)) return c;
  return CITIES[fallback] || national;
}

/** The subset of a config card that is safe to send to the browser. */
export function publicConfig(c) {
  return {
    id: c.id, name: c.name, place: c.place, tagline: c.tagline, maker: c.maker,
    disclaimer: c.disclaimer, branding: c.branding, price_region: c.price_region,
    price_region_label: c.price_region_label, languages: c.languages,
    resources: c.resources.map(({ verified, ...r }) => r),
    i18n: c.i18n || {},
  };
}
