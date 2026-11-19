// City registry + resolver. One deploy serves every city; the request's host
// picks the config card (austin.makeitstretch.org → austin). A vanity domain
// is just another entry in that city's `hosts`.
import austin from './austin.js';
import national from './national.js';
import { withSharedListings } from './shared.js';

/** Every city, with the listings all cities share (cities/shared.js) already added. */
export const CITIES = Object.fromEntries([austin, national].map(card => [card.id, withSharedListings(card)]));

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

/** Partner cities: cities whose card lists the ZIP codes that switch the main site onto them. */
export const PARTNERS = Object.values(CITIES).filter(c => c.place && Array.isArray(c.zips) && c.zips.length);

/**
 * One site (owner decision, Nov 19 2026): on the main site (makeitstretch.org, the national card), a
 * partner city's ZIP code switches the visitor onto that city's card. The browser then asks for it with
 * ?city=<id>, which is honored only from the main site and only for partner cities.
 * @param {object} siteCity  the city the request's host picked
 * @param {unknown} asked    the ?city= query value
 */
export function partnerFor(siteCity, asked) {
  if (siteCity.id !== 'national' || typeof asked !== 'string') return null;
  return PARTNERS.find(c => c.id === asked) || null;
}

/**
 * The subset of a config card that is safe to send to the browser.
 * @param {object} c
 * @param {{oneSite?: boolean}} [opts]  oneSite: the main site lists partner cities and their ZIP codes
 */
export function publicConfig(c, { oneSite = false } = {}) {
  const partnerInfo = oneSite && c.id === 'national' ? {
    partners: PARTNERS.map(p => ({ id: p.id, place: p.place, region: p.region || null })),
    partner_zips: Object.fromEntries(PARTNERS.flatMap(p => p.zips.map(z => [z, p.id]))),
  } : {};
  return {
    id: c.id, name: c.name, place: c.place, tagline: c.tagline, maker: c.maker,
    disclaimer: c.disclaimer, branding: c.branding, price_region: c.price_region,
    price_region_label: c.price_region_label, languages: c.languages,
    resources: c.resources.map(({ verified, ...r }) => r),
    i18n: c.i18n || {},
    sources: c.sources || [],
    needs: c.needs || [],
    has_stores: !!c.local?.stores,
    region: c.region || null,
    transit_trip_url: c.local?.transit_trip_url || null,
    sample_zip: c.local?.sample_zip || null,
    wic_finder_url: c.wic_finder_url || null,
    ...partnerInfo,
  };
}
