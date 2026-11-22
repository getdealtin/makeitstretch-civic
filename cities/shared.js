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
  {
    // Owner request, Nov 22 2026: federally funded community health centers (HRSA's finder).
    id: 'hrsa-health-centers', needs: ['health'],
    org: 'U.S. Health Resources and Services Administration (HRSA)',
    taxonomy: ['1206', '1184'],
    name: 'Community health centers near you',
    description: 'Health centers offer medical, dental and mental health care, with or without insurance. Ask about fees based on what you can afford.',
    url: () => 'https://findahealthcenter.hrsa.gov/',
    kind: 'service', audience: 'needs', event: 'resource_clicked',
    verified: '2026-11-22 link opened (200), page title "Find a Health Center"',
    i18n: {
      es: { name: 'Centros de salud comunitarios cerca de usted', description: 'Los centros de salud ofrecen atención médica, dental y de salud mental, con o sin seguro. Pregunte por tarifas según lo que pueda pagar.' },
      vi: { name: 'Trung tâm y tế cộng đồng gần bạn', description: 'Các trung tâm y tế khám bệnh, nha khoa và sức khỏe tâm thần, dù có hay không có bảo hiểm. Hãy hỏi về mức phí theo khả năng chi trả của bạn.' },
      'zh-Hans': { name: '附近的社区健康中心', description: '社区健康中心提供医疗、牙科和心理健康服务，有没有保险都可以去。可以询问按支付能力收费的标准。' },
    },
  },
  {
    // Owner request, Nov 22 2026: local programs for rides, work clothes, bills and more, searched by ZIP code.
    // Findhelp's site blocks automated checks (Cloudflare), so open it once by hand.
    id: 'findhelp', needs: ['rent', 'jobs', 'childcare'],
    org: 'Findhelp',
    taxonomy: ['1292', '1175', '1158', '1138'],
    name: 'Findhelp: local programs by ZIP code',
    description: 'Search your ZIP code for local programs: a ride, clothes for work, help paying a bill, and more. Free to use.',
    url: () => 'https://www.findhelp.org/',
    kind: 'service', audience: 'needs', event: 'resource_clicked',
    verified: '2026-11-22 the site blocks automated checks (Cloudflare 403); open once by hand',
    i18n: {
      es: { name: 'Findhelp: programas locales por código postal', description: 'Busque su código postal para encontrar programas locales: transporte, ropa para el trabajo, ayuda para pagar una cuenta y más. Es gratis.' },
      vi: { name: 'Findhelp: chương trình địa phương theo mã ZIP', description: 'Tìm theo mã ZIP để thấy các chương trình địa phương: xe đưa đón, quần áo đi làm, hỗ trợ trả hóa đơn và nhiều hơn nữa. Miễn phí.' },
      'zh-Hans': { name: 'Findhelp：按邮政编码查找本地项目', description: '输入邮政编码，查找本地项目：接送、上班穿的衣服、帮忙付账单等等。免费使用。' },
    },
  },
  {
    // Owner request, Nov 22 2026: where to replace each kind of ID or record (USA.gov).
    id: 'usagov-replace-id', needs: ['id'],
    org: 'USAGov',
    taxonomy: ['1384'],
    name: 'Replace a lost ID, birth certificate or Social Security card',
    description: 'USA.gov shows where to request a replacement for each kind of ID or record, from a driver’s license or state ID to a birth certificate or Social Security card.',
    url: () => 'https://www.usa.gov/replace-vital-documents',
    kind: 'service', audience: 'needs', event: 'resource_clicked',
    verified: '2026-11-22 link opened (200), page title "How to replace lost or stolen ID cards"; covers birth certificates and Social Security cards',
    i18n: {
      es: { name: 'Reponer una identificación, acta de nacimiento o tarjeta de Seguro Social', description: 'USA.gov indica dónde pedir un reemplazo de cada tipo de identificación o documento, desde la licencia de conducir o identificación estatal hasta el acta de nacimiento o la tarjeta de Seguro Social. La página está en inglés.' },
      vi: { name: 'Làm lại giấy tờ tùy thân, giấy khai sinh hoặc thẻ An sinh Xã hội bị mất', description: 'USA.gov cho biết nơi xin cấp lại từng loại giấy tờ, từ bằng lái xe hoặc thẻ căn cước tiểu bang đến giấy khai sinh hoặc thẻ An sinh Xã hội. Trang này bằng tiếng Anh.' },
      'zh-Hans': { name: '补办丢失的身份证件、出生证明或社会安全卡', description: 'USA.gov 说明每种证件该去哪里申请补办，从驾照或州身份证到出生证明和社会安全卡。该网页为英文。' },
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
