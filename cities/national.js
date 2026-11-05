// CITY CONFIG CARD: the generic national fallback, used when a request's host
// doesn't match any city. Prices follow the visitor's zip region.
export default {
  id: 'national',
  hosts: [],
  name: 'Make It Stretch',
  place: null,
  tagline: 'Turn the grocery money you have into a week of real meals.',
  maker: 'Margin Ventures LLC',
  disclaimer: 'An independent tool by Margin Ventures LLC.',
  branding: {
    tokens: {
      '--violet': '#2F3B52', '--indigo-ink': '#1E2738', '--green': '#2F7D5C', '--green-text': '#236B46',
      '--text': '#2B2B33', '--text-muted': '#6A6A72', '--label-gray': '#8F8F96',
      '--cream': '#E6E4DE', '--tint': '#F3F2EE', '--tint-light': '#FAFAF7', '--rule': '#DEDCD5',
      '--on-violet': '#F4F5F8', '--on-violet-eyebrow': '#B9C3D6', '--page': '#FFFFFF',
    },
    fonts: { display: 'Zilla Slab', body: 'Source Serif 4', label: 'Inter' },
  },
  price_region: null, // null = use the visitor's zip region
  price_region_label: null,
  local_prices: {},
  languages: ['en'],
  civic_layer: false,
  k_anon_threshold: 15,
  sources: [],
  focus_area: null,
  resources: [
    { id: 'foodbank', name: 'Find a food bank near you', description: 'Free food, no questions asked. Feeding America has 200+ food banks nationwide.', url: 'https://www.feedingamerica.org/find-your-local-foodbank', kind: 'food', audience: 'residents', event: 'foodbank_clicked', verified: 'ported from live tool' },
    { id: '211', name: 'Call or text 2-1-1', description: 'Same-day emergency food help in most areas.', phone: '211', url: 'https://www.211.org', kind: 'phone', audience: 'residents', event: 'resource_clicked', verified: 'ported from live tool' },
    { id: 'snap', name: 'SNAP food benefits', description: 'Monthly food benefits on a card that works at most grocery stores.', url: 'https://www.benefits.gov/benefit/361', kind: 'benefits', audience: 'residents', event: 'snap_screener_clicked', verified: 'ported from live tool' },
    { id: 'wic', name: 'WIC', description: 'Free food and nutrition support for pregnant people and kids under 5.', url: 'https://www.fns.usda.gov/wic/wic-contacts', kind: 'benefits', audience: 'residents', event: 'wic_clicked', verified: 'ported from live tool' },
  ],
};
