// Listings every city gets, so a new city never has to remember to copy them from Austin.
//
// A shared listing is added to a city only when the city offers that need (its `needs` list), and its
// link can be built from the city's own place name. Its translations live here too, so every language
// the city offers has them. Austin's own listings stay in cities/austin.js.

/**
 * @typedef {object} SharedListing
 * @property {string}   id
 * @property {string[]} needs      which "Need help with anything else?" topics it belongs to
 * @property {(city: object) => string} url  built from the city's place and state
 * Everything else matches a city listing (org, taxonomy, name, description, kind, audience, event,
 * verified), plus i18n: { <lang>: { name, description } }.
 */

/** @type {SharedListing[]} */
export const SHARED_LISTINGS = [
  {
    // Owner decision Nov 8 2026: NAFC has no local chapters; its members are individual free and
    // charitable clinics, found through its national clinic finder. The link opens that finder already
    // searched for the city. NAFC's site blocks automated checks, so the address pattern was confirmed
    // from NAFC's own published search pages, not by opening it from here.
    id: 'nafc-find-clinic', needs: ['health'],
    org: 'National Association of Free & Charitable Clinics',
    taxonomy: ['1206'],
    name: 'Free and charitable clinics near you (NAFC)',
    description: 'A national directory of free and charitable clinics and pharmacies. Many serve people without insurance at little or no cost. Call a clinic to ask who it can see.',
    url: city => `https://nafcclinics.org/clinics/search?search=${encodeURIComponent([city.place, city.region].filter(Boolean).join(', '))}&search_radius=25`,
    kind: 'service', audience: 'needs', event: 'resource_clicked',
    verified: '2026-11-08 address pattern from NAFC’s published search pages (its site blocks automated checks; open once by hand)',
    i18n: {
      es: { name: 'Clínicas gratuitas y benéficas cerca de usted (NAFC)', description: 'Un directorio nacional de clínicas y farmacias gratuitas y benéficas. Muchas atienden a personas sin seguro a bajo costo o gratis. Llame a la clínica para saber a quién puede atender.' },
      vi: { name: 'Phòng khám miễn phí và từ thiện gần bạn (NAFC)', description: 'Danh bạ toàn quốc các phòng khám và nhà thuốc miễn phí, từ thiện. Nhiều nơi khám cho người không có bảo hiểm với chi phí thấp hoặc miễn phí. Hãy gọi phòng khám để hỏi họ nhận khám cho ai.' },
      'zh-Hans': { name: '附近的免费和慈善诊所（NAFC）', description: '全国免费和慈善诊所及药房名录。很多诊所为没有保险的人提供低价或免费服务。请打电话问诊所可以为哪些人看病。' },
    },
  },
];

/**
 * A city's config card with the shared listings it qualifies for: same order every time (the city's
 * own listings first), and their translations merged into the city's i18n.
 */
export function withSharedListings(card) {
  const needs = new Set(card.needs || []);
  const own = new Set((card.resources || []).map(r => r.id));
  const extra = SHARED_LISTINGS.filter(s => s.needs.some(n => needs.has(n)) && !own.has(s.id));
  if (!extra.length) return card;
  const i18n = { ...(card.i18n || {}) };
  for (const lang of card.languages || []) {
    if (lang === 'en') continue;
    const strings = Object.fromEntries(extra.filter(s => s.i18n?.[lang]).map(s => [s.id, s.i18n[lang]]));
    i18n[lang] = { ...(i18n[lang] || {}), resources: { ...(i18n[lang]?.resources || {}), ...strings } };
  }
  const listings = extra.map(({ i18n: _, url, ...s }) => ({ ...s, url: url(card) }));
  return { ...card, resources: [...card.resources, ...listings], i18n };
}
