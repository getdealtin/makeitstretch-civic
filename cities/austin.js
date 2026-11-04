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

  // Grant geography: Council Districts 1–4, east of I-35. Used for reporting, not gating:
  // anyone can use the tool with any zip.
  focus_area: 'Council Districts 1–4 (eastern crescent)',

  // Local help, HSDS-lite shape so it can feed a registry later.
  // verified: how/when the entry was last checked. Re-verify before launch.
  resources: [
    {
      id: 'ctfb-find-food',
      name: 'Central Texas Food Bank: Find Food Now',
      description: 'Enter your zip to find free groceries near you: pantries, mobile distributions, and meal sites. Many sites only ask for your zip and household size.',
      url: 'https://www.centraltexasfoodbank.org/find-food-now',
      kind: 'food', audience: 'residents', event: 'foodbank_clicked',
      verified: '2026-11-04 web search; confirm URL before launch',
    },
    {
      id: '211-texas',
      name: '2-1-1 Texas',
      description: 'Call 2-1-1 for same-day food help near you. Press 2 for help applying for state benefits like SNAP.',
      phone: '211', url: 'https://www.211texas.org',
      kind: 'phone', audience: 'residents', event: 'resource_clicked',
      verified: '2026-11-04 web search; confirm menu options before launch',
    },
    {
      id: 'tx-snap',
      name: 'SNAP (food benefits): Your Texas Benefits',
      description: 'Monthly money for groceries on a Lone Star Card. Apply online in about 20–30 minutes.',
      url: 'https://www.yourtexasbenefits.com',
      kind: 'benefits', audience: 'residents', event: 'snap_screener_clicked',
      verified: '2026-11-04 web search',
    },
    {
      id: 'tx-wic',
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
};
