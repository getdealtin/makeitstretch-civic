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
  price_region_label: 'U.S. South region averages (BLS) and estimates',
  local_prices: {},

  // Austin's top three non-English languages (City language-access data). Each shows as
  // "pending review" in /admin until a native speaker signs off.
  languages: ['en', 'es', 'vi', 'zh-Hans'],
  civic_layer: false,
  k_anon_threshold: 15,

  // Source tags allowed on links and printed QR codes (?src=...). Anything else is ignored.
  // Add a tag here before using it on a flyer or partner link.
  // Needs offered after the plan ("Need help with anything else?"). 2-1-1 is shown for every need.
  needs: ['rent', 'health', 'childcare', 'jobs'],
  sources: ['library', 'ctfb', 'pantry', 'partner', 'flyer', 'qr', 'social', 'city', 'packet'],
  // Names for this city's own partner tags on the /share page (general tags like 'library' are named there).
  source_labels: { ctfb: 'Central Texas Food Bank', city: 'City of Austin office or program' },

  // Grant geography: Council Districts 1–4, east of I-35. Used for reporting, not gating:
  // anyone can use the tool with any zip.
  focus_area: 'Council Districts 1–4 (eastern crescent)',
  // ZIP codes used to approximate the focus area in the City report's food-retail findings.
  // ZIP codes and council districts don't line up exactly; the report says so.
  focus_zips: ['78702', '78721', '78723', '78724', '78741', '78744', '78725', '78617', '78719', '78752', '78753', '78758'],
  // Verified notes for stores on USDA's SNAP list, keyed by USDA's store name. Source:
  // sustainablefoodcenter.org/farmers-markets-support/sfc-farmers-markets (checked Nov 6, 2026):
  // SFC markets accept SNAP and WIC, double them up to $30 a week (Double Up Food Bucks Texas),
  // and run Saturdays 9 AM–1 PM. Add a note only from a verified source.
  wic_finder_url: 'https://find.texaswic.org/', // official Texas WIC store finder (checked Nov 6, 2026)
  store_notes: {
    'SFC Farmers Market Downtown': { wic: true, double: 'up30', hours: 'sat_9_1' },
    "Sfc Farmers' Market At Sunset Valley": { wic: true, double: 'up30', hours: 'sat_9_1' },
  },

  // City report framing: the shared measures (server/report.js METRICS) grouped by the
  // Austin-Travis County Food Plan goals the FACE grant is tied to. Another city writes its own
  // `report` block, or leaves it out to get the neutral default layout.
  report: {
    title: 'Food access report',
    // The two new, de-identified indicators returned to the City (FACE application), flagged in place.
    indicators: {
      routed: 'City indicator 1: people routed to benefits navigation (Food Plan strategy 6.6)',
      cant_group: 'City indicator 2: food-box food people can’t use, by reason (Food Plan Goal 4)',
    },
    labels: { benefits: 'SNAP or WIC', food_help: 'a food bank or 2-1-1' },
    sections: [
      { goal: 'Goal 6 · Access', intro: 'Where people seek help stretching food money, how short budgets are, and where they can shop.', metrics: ['zip', 'budget_band', 'budget_band_by_zip', 'store', 'store_by_zip', 'retail_mix', 'retail_by_zip', 'cuisine'] },
      { goal: 'Strategy 6.6 · Benefits navigation', intro: 'People routed toward SNAP and WIC. These are link taps, not applications: the tool cannot see who applies.', metrics: ['routed', 'benefits_by_zip'] },
      { goal: 'Goal 4 · Preparedness (strategy 4.2)', intro: 'Food-box items recipients report they cannot use, and dietary needs. A recipient-reported proxy for the Food Plan’s culturally relevant and medically necessary food indicators, not a measure of food in storage.', metrics: ['cant_use', 'cant_group', 'cant_reason', 'cant_item', 'unlisted_food', 'diet'] },
      { goal: 'Needs beyond food', intro: 'What else people asked about after getting their plan (rent and utilities, health care, child care, jobs and transportation). Taps on a need, not requests: no one is contacted. A de-identified signal for nonprofit partners.', metrics: ['needs', 'needs_by_zip'] },
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
      description: 'Enter your zip to find free groceries near you: pantries, mobile distributions, and meal sites.',
      url: 'https://www.centraltexasfoodbank.org/find-food-now',
      kind: 'food', audience: 'residents', event: 'foodbank_clicked',
      verified: '2026-11-06 link opened (200) and page title checked',
    },
    {
      id: '211-texas',
      role: 'food_help',
      name: '2-1-1 Texas',
      description: 'Call 2-1-1 to find food help and other services near you, including help with benefits like SNAP.',
      phone: '211', url: 'https://www.211texas.org',
      kind: 'phone', audience: 'residents', event: 'resource_clicked',
      verified: '2026-11-06 link opened (200) and page title checked',
    },
    {
      id: 'tx-snap',
      role: 'benefits',
      name: 'SNAP (food benefits): Your Texas Benefits',
      description: 'Monthly money for groceries on a Lone Star Card. You can apply online.',
      url: 'https://www.yourtexasbenefits.com',
      kind: 'benefits', audience: 'residents', event: 'snap_screener_clicked',
      verified: '2026-11-06 link opened (200) and page title checked',
    },
    {
      id: 'tx-wic',
      role: 'benefits',
      name: 'Texas WIC',
      description: 'Free food and nutrition help for pregnant people, new parents, and kids under 5. You can get WIC and SNAP at the same time.',
      url: 'https://texaswic.org',
      kind: 'benefits', audience: 'residents', event: 'wic_clicked',
      verified: '2026-11-06 link opened (200) and page title checked',
    },
    {
      id: 'keep-austin-fed',
      name: 'Keep Austin Fed',
      description: 'Rescues surplus food and delivers it free to Austin charities that feed people. For organizations, not individuals.',
      url: 'https://www.keepaustinfed.org',
      kind: 'org', audience: 'organizations', event: 'resource_clicked',
      verified: '2026-11-06 link opened (200) and page title checked',
    },
    // ── "Need help with anything else?" (after the plan): sources per need. Official pages,
    //    checked Nov 6, 2026 by web search. Phone numbers left out: sources disagreed.
    {
      id: 'coa-utility-discounts', needs: ["rent"],
      name: "City of Austin utility bill discounts",
      description: "Discounts on City of Austin utility bills for households with low or fixed incomes.",
      url: 'https://coautilities.com/wps/wcm/connect/occ/coa/util/support/customer-assistance/utility-bill-discounts',
      kind: 'service', audience: 'needs', event: 'resource_clicked',
      verified: '2026-11-06 link opened (200) and page title checked',
    },
    {
      id: 'tc-family-support', needs: ["rent"],
      name: "Travis County Family Support Services",
      description: "Help with rent and utility bills, plus social workers who can connect you to other services.",
      url: 'https://www.traviscountytx.gov/health-human-services/divisions/family-support-services',
      kind: 'service', audience: 'needs', event: 'resource_clicked',
      verified: '2026-11-06 link opened (200) and page title checked',
    },
    {
      id: 'communitycare', needs: ["health"],
      name: "CommUnityCare Health Centers",
      description: "Nonprofit health centers in Travis County: primary care, dental, pharmacy and behavioral health, including for people without insurance.",
      url: 'https://communitycaretx.org',
      kind: 'service', audience: 'needs', event: 'resource_clicked',
      verified: '2026-11-06 link opened (200) and page title checked',
    },
    {
      id: 'central-health-map', needs: ["health"],
      name: "Central Health: Medical Access Program (MAP)",
      description: "Health coverage for eligible Travis County residents.",
      url: 'https://www.centralhealth.net/map/',
      kind: 'service', audience: 'needs', event: 'resource_clicked',
      verified: '2026-11-06 link opened (200) and page title checked',
    },
    {
      id: 'wfs-childcare', needs: ["childcare"],
      name: "Workforce Solutions Capital Area: child care scholarships",
      description: "Help paying for child care for Travis County families who meet income guidelines and are working, looking for work, or in school or training.",
      url: 'https://wfscapitalarea.com/childcare/for-parents/applying/',
      kind: 'service', audience: 'needs', event: 'resource_clicked',
      verified: '2026-11-06 link opened (200) and page title checked',
    },
    {
      id: 'wfs-jobs', needs: ["jobs"],
      name: "Workforce Solutions Capital Area: find a job",
      description: "Free help finding work, and job training.",
      url: 'https://www.wfscapitalarea.com/',
      kind: 'service', audience: 'needs', event: 'resource_clicked',
      verified: '2026-11-06 link opened (200) and page title checked',
    },
    {
      id: 'capmetro-fares', needs: ["jobs"],
      name: "CapMetro reduced fares",
      description: "Lower bus and train fares, including Equifare for people with low incomes.",
      url: 'https://www.capmetro.org/fare/general-fares-overview/fares',
      kind: 'service', audience: 'needs', event: 'resource_clicked',
      verified: '2026-11-06 link opened (200) and page title checked',
    },
  ],

  // This city's own text in each language. DRAFT, pending native-speaker review.
  // Organization names stay as the organizations write them; descriptions are translated.
  i18n: {
    es: {
      tagline: 'Convierta el dinero que tiene para comida en una semana de comidas de verdad.',
      disclaimer: 'Una herramienta independiente hecha para los residentes de Austin por Margin Ventures LLC. No es un sitio web oficial de la Ciudad de Austin.',
      price_region_label: 'promedios de la región Sur de EE. UU. (BLS) y estimaciones',
      resources: {
        'ctfb-find-food': { name: 'Central Texas Food Bank: Find Food Now (Encuentre comida)', description: 'Escriba su código postal para encontrar comida gratis cerca de usted: despensas, repartos móviles y lugares de comida.' },
        '211-texas': { name: '2-1-1 Texas', description: 'Llame al 2-1-1 para encontrar ayuda con comida y otros servicios cerca de usted, incluida ayuda con beneficios como SNAP.' },
        'tx-snap': { name: 'SNAP (beneficios de comida): Your Texas Benefits', description: 'Dinero cada mes para comprar comida con la tarjeta Lone Star. Puede solicitarlo en línea.' },
        'tx-wic': { name: 'Texas WIC', description: 'Comida gratis y ayuda con nutrición para personas embarazadas, padres de bebés y niños menores de 5 años. Puede recibir WIC y SNAP al mismo tiempo.' },
        'keep-austin-fed': { name: 'Keep Austin Fed', description: 'Rescata comida que sobra y la entrega gratis a organizaciones de Austin que dan de comer. Es para organizaciones, no para personas.' },
        'coa-utility-discounts': { name: "Descuentos en las facturas de servicios de la Ciudad de Austin", description: "Descuentos en las facturas de servicios públicos de la Ciudad de Austin para hogares con ingresos bajos o fijos." },
        'tc-family-support': { name: "Servicios de Apoyo Familiar del Condado de Travis", description: "Ayuda con la renta y las facturas de servicios, y trabajadores sociales que pueden conectarle con otros servicios." },
        'communitycare': { name: "Centros de Salud CommUnityCare", description: "Centros de salud sin fines de lucro en el Condado de Travis: atención primaria, dental, farmacia y salud mental, también para personas sin seguro." },
        'central-health-map': { name: "Central Health: Programa de Acceso Médico (MAP)", description: "Cobertura de salud para residentes del Condado de Travis que califiquen." },
        'wfs-childcare': { name: "Workforce Solutions Capital Area: becas para cuidado infantil", description: "Ayuda para pagar el cuidado infantil para familias del Condado de Travis que cumplen los requisitos de ingresos y trabajan, buscan trabajo, estudian o están en capacitación." },
        'wfs-jobs': { name: "Workforce Solutions Capital Area: encontrar trabajo", description: "Ayuda gratis para encontrar trabajo y capacitación laboral." },
        'capmetro-fares': { name: "Tarifas reducidas de CapMetro", description: "Tarifas más bajas de autobús y tren, incluido Equifare para personas con ingresos bajos." },
      },
    },
    vi: {
      tagline: 'Biến số tiền đi chợ bạn có thành một tuần ăn uống đầy đủ.',
      disclaimer: 'Một công cụ độc lập do Margin Ventures LLC xây dựng cho cư dân Austin. Đây không phải trang web chính thức của Thành phố Austin.',
      price_region_label: 'giá trung bình khu vực miền Nam Hoa Kỳ (BLS) và giá ước tính',
      resources: {
        'ctfb-find-food': { name: 'Central Texas Food Bank: Find Food Now (Tìm thực phẩm)', description: 'Nhập mã bưu điện để tìm thực phẩm miễn phí gần bạn: kho thực phẩm, điểm phát di động và nơi phát bữa ăn.' },
        '211-texas': { name: '2-1-1 Texas', description: 'Gọi 2-1-1 để tìm trợ giúp thực phẩm và các dịch vụ khác gần bạn, kể cả trợ giúp về phúc lợi như SNAP.' },
        'tx-snap': { name: 'SNAP (phiếu thực phẩm): Your Texas Benefits', description: 'Tiền mua thực phẩm hằng tháng nạp vào thẻ Lone Star. Có thể đăng ký trực tuyến.' },
        'tx-wic': { name: 'Texas WIC', description: 'Thực phẩm miễn phí và hỗ trợ dinh dưỡng cho người mang thai, cha mẹ có con mới sinh và trẻ dưới 5 tuổi. Bạn có thể nhận WIC và SNAP cùng lúc.' },
        'keep-austin-fed': { name: 'Keep Austin Fed', description: 'Thu gom thực phẩm dư thừa và giao miễn phí cho các tổ chức từ thiện ở Austin. Dành cho tổ chức, không dành cho cá nhân.' },
        'coa-utility-discounts': { name: "Giảm giá hóa đơn tiện ích của Thành phố Austin", description: "Giảm giá hóa đơn điện nước của Thành phố Austin cho các hộ có thu nhập thấp hoặc cố định." },
        'tc-family-support': { name: "Dịch vụ Hỗ trợ Gia đình Quận Travis", description: "Trợ giúp tiền thuê nhà và hóa đơn tiện ích, cùng nhân viên xã hội có thể kết nối bạn với các dịch vụ khác." },
        'communitycare': { name: "Trung tâm Y tế CommUnityCare", description: "Các trung tâm y tế phi lợi nhuận ở Quận Travis: chăm sóc ban đầu, nha khoa, nhà thuốc và sức khỏe tâm thần, kể cả cho người không có bảo hiểm." },
        'central-health-map': { name: "Central Health: Chương trình Tiếp cận Y tế (MAP)", description: "Bảo hiểm y tế cho cư dân Quận Travis đủ điều kiện." },
        'wfs-childcare': { name: "Workforce Solutions Capital Area: học bổng giữ trẻ", description: "Trợ giúp chi phí giữ trẻ cho các gia đình ở Quận Travis đủ điều kiện thu nhập và đang đi làm, tìm việc, đi học hoặc đang được đào tạo." },
        'wfs-jobs': { name: "Workforce Solutions Capital Area: tìm việc làm", description: "Trợ giúp miễn phí để tìm việc và đào tạo nghề." },
        'capmetro-fares': { name: "Giá vé giảm của CapMetro", description: "Giá vé xe buýt và tàu thấp hơn, kể cả chương trình Equifare cho người có thu nhập thấp." },
      },
    },
    'zh-Hans': {
      tagline: '把手头的买菜钱变成一周像样的饭菜。',
      disclaimer: '由 Margin Ventures LLC 为奥斯汀居民打造的独立工具。本网站不是奥斯汀市（City of Austin）的官方网站。',
      price_region_label: '美国南部地区平均价格（BLS）及估算价格',
      resources: {
        'ctfb-find-food': { name: 'Central Texas Food Bank: Find Food Now（查找食物）', description: '输入邮政编码，查找附近的免费食物：食物发放处、流动发放点和供餐点。' },
        '211-texas': { name: '2-1-1 Texas', description: '拨打 2-1-1，查找附近的食物帮助和其他服务，包括 SNAP 等福利方面的帮助。' },
        'tx-snap': { name: 'SNAP（食品福利）：Your Texas Benefits', description: '每月发放到 Lone Star 卡上的买菜钱。可以在网上申请。' },
        'tx-wic': { name: 'Texas WIC', description: '为孕妇、新生儿父母和 5 岁以下儿童提供免费食物和营养帮助。WIC 和 SNAP 可以同时领取。' },
        'keep-austin-fed': { name: 'Keep Austin Fed', description: '回收多余的食物，免费送给奥斯汀的慈善机构。面向机构，不面向个人。' },
        'coa-utility-discounts': { name: "奥斯汀市公用事业账单折扣", description: "为低收入或固定收入家庭提供奥斯汀市公用事业账单折扣。" },
        'tc-family-support': { name: "特拉维斯县家庭支持服务", description: "帮助支付房租和公用事业账单，并有社工帮您联系其他服务。" },
        'communitycare': { name: "CommUnityCare 健康中心", description: "特拉维斯县的非营利健康中心：初级保健、牙科、药房和心理健康服务，没有保险的人也可以去。" },
        'central-health-map': { name: "Central Health：医疗服务计划（MAP）", description: "为符合条件的特拉维斯县居民提供医疗保障。" },
        'wfs-childcare': { name: "Workforce Solutions Capital Area：托儿补助", description: "为符合收入标准、正在工作、找工作、上学或参加培训的特拉维斯县家庭提供托儿费用帮助。" },
        'wfs-jobs': { name: "Workforce Solutions Capital Area：找工作", description: "免费帮助找工作，并提供职业培训。" },
        'capmetro-fares': { name: "CapMetro 优惠票价", description: "更便宜的公交和轻轨票价，包括为低收入人群提供的 Equifare。" },
      },
    },
  },
};
