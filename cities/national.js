// CITY CONFIG CARD: makeitstretch.org itself, for everyone outside a partner city.
// One site (owner decision, Nov 19 2026): the main site runs the tool for anyone in the U.S. Prices follow
// the visitor's ZIP region; help is national. A partner city's ZIP code switches that person onto the
// city's own card (its `zips` list), and their activity counts in that city's report. Set ONE_SITE=off
// in Render to go back to the old landing page (see README "One site").
export default {
  id: 'national',
  // The main site's own addresses (so it is never mistaken for DEFAULT_CITY). With ONE_SITE=off, server.js
  // gives these hosts DEFAULT_CITY again, exactly as before Nov 19.
  hosts: ['makeitstretch.org', 'www.makeitstretch.org'],
  // The address the site is actually served at: Render redirects makeitstretch.org to www (checked Nov 27 2026).
  // Search and link-preview tags (server/seo.js) must name this one, not an address that redirects.
  canonical_host: 'www.makeitstretch.org',
  name: 'Make It Stretch',
  place: null,
  tagline: 'Turn the grocery money you have into a week of real meals.',
  maker: 'Margin Ventures LLC',
  disclaimer: 'An independent tool by Margin Ventures LLC. Not an official government website.',
  // Same purple as the logo and the Austin site (owner decision, Nov 17: one look everywhere).
  branding: {
    tokens: {
      '--violet': '#38377E', '--indigo-ink': '#26264F', '--green': '#2F8B5C', '--green-text': '#236B46',
      '--text': '#2B2B33', '--text-muted': '#6A6A72', '--label-gray': '#9A9788',
      '--cream': '#E4E1D4', '--tint': '#F3F1E7', '--tint-light': '#FBFAF4', '--rule': '#DDDACB',
      '--on-violet': '#F4F3FB', '--on-violet-eyebrow': '#B7B2E8', '--page': '#FFFFFF',
    },
    fonts: { display: 'Zilla Slab', body: 'Source Serif 4', label: 'Inter' },
  },
  price_region: null, // null = use the visitor's ZIP region (U.S. averages before a ZIP is given)
  price_region_label: null,
  local_prices: {},
  languages: ['en', 'es', 'vi', 'zh-Hans'],
  civic_layer: false,
  k_anon_threshold: 15,
  sources: [],
  focus_area: null,
  // "Need help with anything else?" on the main site (owner request, Nov 22 2026): national listings only
  // (findhelp, HRSA health centers, free clinics, USA.gov ID replacement) plus 2-1-1.
  needs: ['rent', 'health', 'childcare', 'jobs', 'id'],
  // "Where to shop" everywhere (owner decision, Nov 22 2026): every U.S. grocery store and farmers market on
  // USDA's SNAP list (scripts/build-snap-stores.py --national). No WIC, Double Up or hours notes: those are
  // shown only where a city has checked them. No bus trip planner: Directions opens the person's maps app.
  local: { stores: 'snap-stores-us.json' },
  // Links checked Nov 19, 2026. USDA's food agency now lives at fna.usda.gov (fns.usda.gov redirects there);
  // Benefits.gov closed in 2024, so SNAP points to USDA's state directory. Feeding America and 211.org were
  // confirmed by search (both block automated checks from the build workspace).
  resources: [
    { id: 'foodbank', role: 'food_help', name: 'Find a food bank near you', description: 'Enter your ZIP code to find food banks in the Feeding America network near you, and the pantries and meal programs they work with.', url: 'https://www.feedingamerica.org/find-your-local-foodbank', kind: 'food', audience: 'residents', event: 'foodbank_clicked', verified: '2026-11-19 confirmed by search (site blocks automated checks)' },
    { id: '211', role: 'food_help', name: 'Call 2-1-1', description: 'A live person helps you find food and other help near you. Available almost everywhere in the U.S.', phone: '211', url: 'https://www.211.org', kind: 'phone', audience: 'residents', event: 'resource_clicked', verified: '2026-11-19 confirmed by search (site blocks automated checks)' },
    { id: 'snap', role: 'benefits', name: 'SNAP food benefits', description: 'Monthly money for food on a card that works at most grocery stores. Find how to apply in your state.', url: 'https://www.fna.usda.gov/snap/state-directory', kind: 'benefits', audience: 'residents', event: 'snap_screener_clicked', verified: '2026-11-19 link opened (200), title "SNAP State Directory of Resources"' },
    { id: 'wic', role: 'benefits', name: 'WIC', description: 'Free food and nutrition help for pregnant people, new parents and children under 5. Choose your state to apply.', url: 'https://www.fna.usda.gov/wic/apply', kind: 'benefits', audience: 'residents', event: 'wic_clicked', verified: '2026-11-19 link opened (200), title "How to Apply for WIC"' },
  ],

  // DRAFT translations, pending native-speaker review (same as every city's).
  i18n: {
    es: {
      tagline: 'Convierta el dinero que tiene para comida en una semana de comidas de verdad.',
      disclaimer: 'Una herramienta independiente de Margin Ventures LLC. No es un sitio web oficial del gobierno.',
      resources: {
        foodbank: { name: 'Encuentre un banco de comida cerca de usted', description: 'Escriba su código postal para encontrar bancos de comida de la red Feeding America cerca de usted, y las despensas y programas de comidas con los que trabajan.' },
        211: { name: 'Llame al 2-1-1', description: 'Una persona le ayuda a encontrar comida y otra ayuda cerca de usted. Disponible en casi todo Estados Unidos.' },
        snap: { name: 'SNAP (beneficios de comida)', description: 'Dinero cada mes para comida en una tarjeta que se acepta en la mayoría de los supermercados. Vea cómo solicitarlo en su estado.' },
        wic: { name: 'WIC', description: 'Comida gratis y ayuda con nutrición para personas embarazadas, padres de bebés y niños menores de 5 años. Elija su estado para solicitarlo.' },
      },
    },
    vi: {
      tagline: 'Biến số tiền đi chợ bạn có thành một tuần ăn uống đầy đủ.',
      disclaimer: 'Một công cụ độc lập của Margin Ventures LLC. Không phải trang web chính thức của chính phủ.',
      resources: {
        foodbank: { name: 'Tìm ngân hàng thực phẩm gần bạn', description: 'Nhập mã bưu điện để tìm các ngân hàng thực phẩm trong mạng lưới Feeding America gần bạn, cùng các kho thực phẩm và chương trình bữa ăn mà họ hợp tác.' },
        211: { name: 'Gọi 2-1-1', description: 'Một nhân viên sẽ giúp bạn tìm thực phẩm và các trợ giúp khác gần bạn. Có ở hầu hết mọi nơi tại Hoa Kỳ.' },
        snap: { name: 'SNAP (trợ cấp thực phẩm)', description: 'Tiền mua thực phẩm hằng tháng trên một thẻ dùng được ở hầu hết các cửa hàng tạp hóa. Xem cách nộp đơn ở tiểu bang của bạn.' },
        wic: { name: 'WIC', description: 'Thực phẩm miễn phí và hỗ trợ dinh dưỡng cho người mang thai, cha mẹ có con nhỏ và trẻ em dưới 5 tuổi. Chọn tiểu bang của bạn để nộp đơn.' },
      },
    },
    'zh-Hans': {
      tagline: '把手头的买菜钱变成一周像样的饭菜。',
      disclaimer: 'Margin Ventures LLC 推出的独立工具，不是政府官方网站。',
      resources: {
        foodbank: { name: '查找附近的食物银行', description: '输入邮政编码，查找您附近 Feeding America 网络中的食物银行，以及与它们合作的食物发放处和供餐项目。' },
        211: { name: '拨打 2-1-1', description: '会有工作人员帮您查找附近的食物和其他帮助。美国几乎所有地区都可以拨打。' },
        snap: { name: 'SNAP（食品补助）', description: '每月发放买食物的钱，存在一张大多数超市都能用的卡上。查看您所在州的申请方法。' },
        wic: { name: 'WIC', description: '为孕妇、婴儿的父母和 5 岁以下儿童提供免费食物和营养帮助。选择您所在的州即可申请。' },
      },
    },
  },
};
