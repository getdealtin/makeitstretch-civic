// City registry + resolver. One deploy serves every city; the request's host
// picks the config card (austin.makeitstretch.org → austin). A vanity domain
// is just another entry in that city's `hosts`.
/**
 * A city's settings ("config card", cities/<id>.js). Everything city-specific lives here; the engine never
 * sees a city name. `national` is the main site (makeitstretch.org) for everyone outside a partner city.
 * @typedef {object} CityCard
 * @property {string}   id            'austin', 'national'
 * @property {string[]} hosts         web addresses that open this city ('austin.makeitstretch.org')
 * @property {string}   name          public brand, always 'Make It Stretch'
 * @property {?string}  place         city name shown in the header ('Austin'); null for the main site
 * @property {string}   [region]      two-letter state ('TX')
 * @property {string}   tagline
 * @property {string}   maker         who runs it ('Margin Ventures LLC')
 * @property {string}   disclaimer    footer line; says it is not an official government site
 * @property {{tokens: Object<string,string>, fonts: {display:string, body:string, label:string}}} branding
 * @property {?('northeast'|'midwest'|'south'|'west')} price_region  BLS region; null = from the visitor's ZIP
 * @property {?string}  price_region_label   English label for those prices (translated in i18n)
 * @property {Object<string,number>} local_prices  shelf prices that override BLS, by food id (Data Stewards)
 * @property {string[]} languages     'en', 'es', 'vi', 'zh-Hans'
 * @property {number}   k_anon_threshold  report cells covering fewer people are hidden (15)
 * @property {string[]} sources       allowed ?src= tags on links and QR codes ('library', 'main', ...)
 * @property {Object<string,string>} [source_labels]  names for the city's own tags on /share
 * @property {string[]} [needs]       "Need help with anything else?" topics ('rent', 'health', ...)
 * @property {string[]} [zips]        partner cities only: ZIP codes that switch the main site to this city
 * @property {string[]} [focus_zips]  ZIP codes approximating the grant area, for the City report
 * @property {object}   [local]       local data files (SNAP stores, food access, council districts) and links
 * @property {object}   [report]      City report layout (goals and the measures under each)
 * @property {Resource[]} resources   help shown to people (see Resource)
 * @property {Object<string, {tagline?:string, disclaimer?:string, price_region_label?:string,
 *   resources?: Object<string, {name:string, description:string}>}>} [i18n]  the city's own text, per language
 */

/**
 * One help listing on a city card.
 * @typedef {object} Resource
 * @property {string}  id
 * @property {string}  [org]          who runs it, as the organization writes its name
 * @property {string[]} [taxonomy]    Open Eligibility codes, for the open data feed (/api/hsds)
 * @property {'benefits'|'food_help'} [role]  how the City report groups taps on it
 * @property {string}  name
 * @property {string}  description
 * @property {string}  [url]
 * @property {string}  [phone]
 * @property {string}  kind           'food', 'phone', 'benefits', 'service'
 * @property {'residents'|'nearby'|'needs'|'organizations'} audience  where it shows: always, only near its
 *   ZIP ('nearby', with `site`), under a need ('needs', with `needs`), or for organizations
 * @property {string}  event          the anonymous event a tap records
 * @property {string}  verified       how and when the link was last checked (never sent to the browser)
 */

/**
 * What the browser gets from /api/config: the card minus internal fields, plus, on the main site with
 * ONE_SITE on, the partner cities and the ZIP codes that switch to each.
 * @typedef {object} PublicConfig
 * @property {Array<{id:string, place:string, region:?string}>} [partners]
 * @property {Object<string,string>} [partner_zips]  ZIP code → partner city id ('78702' → 'austin')
 */

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

/** Partner cities: cities whose card lists the ZIP codes that switch the main site onto them.
 * @type {CityCard[]} */
export const PARTNERS = Object.values(CITIES).filter(c => c.place && Array.isArray(c.zips) && c.zips.length);

/**
 * One site (owner decision, Nov 19 2026): on the main site (makeitstretch.org, the national card), a
 * partner city's ZIP code switches the visitor onto that city's card. The browser then asks for it with
 * ?city=<id>, which is honored only from the main site and only for partner cities.
 * @param {CityCard} siteCity  the city the request's host picked
 * @param {unknown} asked    the ?city= query value (any type: query strings can be arrays)
 * @returns {?CityCard}
 */
export function partnerFor(siteCity, asked) {
  if (siteCity.id !== 'national' || typeof asked !== 'string') return null;
  return PARTNERS.find(c => c.id === asked) || null;
}

/**
 * The subset of a config card that is safe to send to the browser.
 * @param {CityCard} c
 * @param {{oneSite?: boolean}} [opts]  oneSite: the main site lists partner cities and their ZIP codes
 * @returns {PublicConfig & object}
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
