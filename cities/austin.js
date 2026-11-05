// ─────────────────────────────────────────────────────────────
// CITY CONFIG CARD — Austin, TX (instance #1)
// Everything Austin-specific lives here and only here. The engine never
// sees a city name. To add a city, copy this file, change the values,
// and register it in cities/index.js.
// ─────────────────────────────────────────────────────────────

export default {
  id: 'austin',
  hosts: ['austin.makeitstretch.org'],

  // Public identity. "The Enough Project" is the internal/grant program name
  // only (name collision with enoughproject.org); the public brand is Make It Stretch.
  name: 'Make It Stretch',
  place: 'Austin',
  region: 'TX',
  tagline: 'Turn the grocery money you have into a week of real meals.',
  maker: 'Margin Ventures LLC',
  // Impersonation guardrail: aligned with Austin's visual language, never presented
  // as the City. No city logo, wordmark or seal unless the City authorizes co-branding.
  disclaimer: 'An independent tool built for Austin residents by Margin Ventures LLC. Not an official City of Austin website.',

  // Tokens from the Enough Project × Jeremiah Program brief (spec §4).
  branding: {
    tokens: {
      '--violet': '#38377E',
      '--indigo-ink': '#26264F',
      '--green': '#2F8B5C',          // accent: bars, borders, progress
      '--green-text': '#236B46',     // accessible text/link green (AA on white and cream)
      '--text': '#2B2B33',
      '--text-muted': '#6A6A72',
      '--label-gray': '#9A9788',
      '--cream': '#E4E1D4',
      '--tint': '#F3F1E7',
      '--tint-light': '#FBFAF4',
      '--rule': '#DDDACB',
      '--on-violet': '#F4F3FB',
      '--on-violet-eyebrow': '#B7B2E8',
      '--page': '#FFFFFF',
    },
    // Close stand-ins for the City's Museo Slab display direction (Museo Slab is
    // licensed via Adobe; swap in once licensed). All self-hosted: no third-party requests.
    fonts: { display: 'Zilla Slab', body: 'Source Serif 4', label: 'Inter' },
  },

  // Price data. BLS publishes average prices for 4 Census regions, not Austin, so the
  // South region is the fallback. local_prices is where the Community Data Stewards'
  // quarterly shelf-price capture lands (spec §11) and it overrides BLS item by item.
  price_region: 'south',
  price_region_label: 'U.S. South region averages (BLS)',
  local_prices: {},

  // Austin's top three non-English languages (City language-access data). Each shows as
  // "pending review" in /admin until a native speaker signs off.
  languages: ['en', 'es', 'vi', 'zh-Hans'],
  civic_layer: false,
  k_anon_threshold: 15,

  // Source tags allowed on links and printed QR codes (?src=...). Anything else is ignored.
  // Add a tag here before using it on a flyer or partner link.
  sources: ['library', 'ctfb', 'pantry', 'partner', 'flyer', 'qr', 'social', 'city', 'packet'],
  // Names for this city's own partner tags on the /share page (general tags like 'library' are named there).
  source_labels: { ctfb: 'Central Texas Food Bank', city: 'City of Austin office or program' },

  // Grant geography: Council Districts 1–4, east of I-35. Used for reporting, not gating:
  // anyone can use the tool with any zip.
  focus_area: 'Council Districts 1–4 (eastern crescent)',

  // City report framing: the shared measures (server/report.js METRICS) grouped by the
  // Austin-Travis County Food Plan goals the FACE grant is tied to. Another city writes its own
  // `report` block, or leaves it out to get the neutral default layout.
  report: {
    title: 'Food access report',
    labels: { benefits: 'SNAP or WIC', food_help: 'a food bank or 2-1-1' },
    sections: [
      { goal: 'Goal 6 · Access', intro: 'Where people seek help stretching food money, how short budgets are, and where they can shop.', metrics: ['zip', 'budget_band', 'store', 'store_by_zip', 'cuisine'] },
      { goal: 'Strategy 6.6 · Benefits navigation', intro: 'People routed toward SNAP and WIC. These are link taps, not applications: the tool cannot see who applies.', metrics: ['routed', 'benefits_by_zip'] },
      { goal: 'Goal 4 · Preparedness (strategy 4.2)', intro: 'Food-box items recipients report they cannot use, and dietary needs. A recipient-reported proxy for the Food Plan’s culturally relevant and medically necessary food indicators, not a measure of food in storage.', metrics: ['cant_use', 'cant_group', 'cant_reason', 'cant_item', 'unlisted_food', 'diet'] },
      { goal: 'Strategy 6.7 · Language and technology barriers', intro: 'Language used, and whether people kept plans to use later.', metrics: ['language'] },
      { goal: 'Outcomes', intro: 'Asked when someone returns to a saved plan or link.', metrics: ['outcome', 'returns'] },
      { goal: 'Goal 9 · Empower (participation)', intro: 'Organizations taking part through the food directory.', metrics: ['directory'] },
      { goal: 'How people found the tool', intro: 'From source tags on links and printed QR codes.', metrics: ['sources'] },
    ],
  },

  // Local help, HSDS-lite shape so it can feed a registry later.
  // verified: how/when the entry was last checked. Re-verify before launch.
  resources: [
    {
      id: 'ctfb-find-food',
      role: 'food_help',
      name: 'Central Texas Food Bank: Find Food Now',
      description: 'Enter your zip to find free groceries near you: pantries, mobile distributions, and meal sites. Many sites only ask for your zip and household size.',
      url: 'https://www.centraltexasfoodbank.org/find-food-now',
      kind: 'food', audience: 'residents', event: 'foodbank_clicked',
      verified: '2026-11-04 web search; confirm URL before launch',
    },
    {
      id: '211-texas',
      role: 'food_help',
      name: '2-1-1 Texas',
      description: 'Call 2-1-1 for same-day food help near you. Press 2 for help applying for state benefits like SNAP.',
      phone: '211', url: 'https://www.211texas.org',
      kind: 'phone', audience: 'residents', event: 'resource_clicked',
      verified: '2026-11-04 web search; confirm menu options before launch',
    },
    {
      id: 'tx-snap',
      role: 'benefits',
      name: 'SNAP (food benefits): Your Texas Benefits',
      description: 'Monthly money for groceries on a Lone Star Card. Apply online in about 20–30 minutes.',
      url: 'https://www.yourtexasbenefits.com',
      kind: 'benefits', audience: 'residents', event: 'snap_screener_clicked',
      verified: '2026-11-04 web search',
    },
    {
      id: 'tx-wic',
      role: 'benefits',
      name: 'Texas WIC',
      description: 'Free food and nutrition help for pregnant people, new parents, and kids under 5. You can get WIC and SNAP at the same time.',
      url: 'https://texaswic.org',
      kind: 'benefits', audience: 'residents', event: 'wic_clicked',
      verified: 'not yet verified',
    },
    {
      id: 'keep-austin-fed',
      name: 'Keep Austin Fed',
      description: 'Rescues surplus food and delivers it free to Austin charities that feed people. For organizations, not individuals.',
      url: 'https://www.keepaustinfed.org',
      kind: 'org', audience: 'organizations', event: 'resource_clicked',
      verified: '2026-11-04 web search: partner-recipient program for charities',
    },
  ],

  // This city's own text in each language. DRAFT, pending native-speaker review.
  // Organization names stay as the organizations write them; descriptions are translated.
  i18n: {
    es: {
      tagline: 'Convierta el dinero que tiene para comida en una semana de comidas de verdad.',
      disclaimer: 'Una herramienta independiente hecha para los residentes de Austin por Margin Ventures LLC. No es un sitio web oficial de la Ciudad de Austin.',
      price_region_label: 'promedios de la región Sur de EE. UU. (BLS)',
      resources: {
        'ctfb-find-food': { name: 'Central Texas Food Bank: Find Food Now (Encuentre comida)', description: 'Escriba su código postal para encontrar despensa gratis cerca de usted: despensas, repartos móviles y lugares de comida. En muchos lugares solo le piden su código postal y cuántas personas viven en su casa.' },
        '211-texas': { name: '2-1-1 Texas', description: 'Llame al 2-1-1 para recibir ayuda con comida el mismo día cerca de usted. Marque 2 para recibir ayuda con beneficios del estado como SNAP.' },
        'tx-snap': { name: 'SNAP (beneficios de comida): Your Texas Benefits', description: 'Dinero cada mes para comprar comida con la tarjeta Lone Star. Puede solicitarlo en línea en unos 20–30 minutos.' },
        'tx-wic': { name: 'Texas WIC', description: 'Comida gratis y ayuda con nutrición para personas embarazadas, padres de bebés y niños menores de 5 años. Puede recibir WIC y SNAP al mismo tiempo.' },
        'keep-austin-fed': { name: 'Keep Austin Fed', description: 'Rescata comida que sobra y la entrega gratis a organizaciones de Austin que dan de comer. Es para organizaciones, no para personas.' },
      },
    },
    vi: {
      tagline: 'Biến số tiền đi chợ bạn có thành một tuần ăn uống đầy đủ.',
      disclaimer: 'Một công cụ độc lập do Margin Ventures LLC xây dựng cho cư dân Austin. Đây không phải trang web chính thức của Thành phố Austin.',
      price_region_label: 'giá trung bình khu vực miền Nam Hoa Kỳ (BLS)',
      resources: {
        'ctfb-find-food': { name: 'Central Texas Food Bank: Find Food Now (Tìm thực phẩm)', description: 'Nhập mã bưu điện để tìm thực phẩm miễn phí gần bạn: kho thực phẩm, điểm phát di động và nơi phát bữa ăn. Nhiều nơi chỉ hỏi mã bưu điện và số người trong nhà.' },
        '211-texas': { name: '2-1-1 Texas', description: 'Gọi 2-1-1 để được giúp thực phẩm ngay trong ngày ở gần bạn. Bấm số 2 để được giúp đăng ký các phúc lợi của tiểu bang như SNAP.' },
        'tx-snap': { name: 'SNAP (phiếu thực phẩm): Your Texas Benefits', description: 'Tiền mua thực phẩm hằng tháng nạp vào thẻ Lone Star. Đăng ký trực tuyến mất khoảng 20–30 phút.' },
        'tx-wic': { name: 'Texas WIC', description: 'Thực phẩm miễn phí và hỗ trợ dinh dưỡng cho người mang thai, cha mẹ có con mới sinh và trẻ dưới 5 tuổi. Bạn có thể nhận WIC và SNAP cùng lúc.' },
        'keep-austin-fed': { name: 'Keep Austin Fed', description: 'Thu gom thực phẩm dư thừa và giao miễn phí cho các tổ chức từ thiện ở Austin. Dành cho tổ chức, không dành cho cá nhân.' },
      },
    },
    'zh-Hans': {
      tagline: '把手头的买菜钱变成一周像样的饭菜。',
      disclaimer: '由 Margin Ventures LLC 为奥斯汀居民打造的独立工具。本网站不是奥斯汀市（City of Austin）的官方网站。',
      price_region_label: '美国南部地区平均价格（BLS）',
      resources: {
        'ctfb-find-food': { name: 'Central Texas Food Bank: Find Food Now（查找食物）', description: '输入邮政编码，查找附近的免费食物：食物发放处、流动发放点和供餐点。很多地方只问您的邮政编码和家里几口人。' },
        '211-texas': { name: '2-1-1 Texas', description: '拨打 2-1-1，获得附近当天的食物帮助。按 2 可获得申请 SNAP 等州福利的帮助。' },
        'tx-snap': { name: 'SNAP（食品福利）：Your Texas Benefits', description: '每月发放到 Lone Star 卡上的买菜钱。网上申请大约需要 20–30 分钟。' },
        'tx-wic': { name: 'Texas WIC', description: '为孕妇、新生儿父母和 5 岁以下儿童提供免费食物和营养帮助。WIC 和 SNAP 可以同时领取。' },
        'keep-austin-fed': { name: 'Keep Austin Fed', description: '回收多余的食物，免费送给奥斯汀的慈善机构。面向机构，不面向个人。' },
      },
    },
  },
};
