// Search engines and link previews (owner choice, Nov 27 2026: "Go with your updated change").
// Nothing here changes what a visitor sees on the page. It adds, to every page the server sends:
//   - a clear title and description on the home page (what people search for: free, meal plan, food pantry)
//   - a canonical address (the city's own main web address, no ?query), so the main site and a city site,
//     and www / ?via=share / ?src= variants, aren't counted as separate pages
//   - link-preview tags (Open Graph), so a texted or posted link shows the share card, not a bare address
// plus /robots.txt and /sitemap.xml for each web address.

export const SHARE_IMAGE = '/icons/share-card.png'; // 1200×630, made by scripts/build-share-card.cjs

/** Pages search engines should list (each served at this path on every city's web address). */
export const PUBLIC_PAGES = ['/', '/about', '/how-plans-work', '/privacy', '/share-a-meal'];

const DESCRIPTION = 'Plan meals from your food pantry box and make your grocery budget stretch.';
const TAIL = 'Free, no sign-up, in English, Spanish, Vietnamese and Chinese.';

/** The home page's search title and description for a city (the national site has no place). */
export function homeSeo(city) {
  const place = city?.place;
  return {
    title: `Make It Stretch${place ? ' ' + place : ''}: Free meal plan for the grocery money you have`,
    description: place ? `${DESCRIPTION.replace(/\.$/, '')} in ${place}. ${TAIL}` : `${DESCRIPTION} ${TAIL}`,
  };
}

/** The city's main web address (its first host); the national site is makeitstretch.org. */
export const originFor = city => `https://${city?.hosts?.[0] || 'makeitstretch.org'}`;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Add the search and preview tags to a page's HTML. `home` pages also get the search title and description
 * (replacing the file's own); other pages keep their title, and their preview uses it.
 */
export function withSeo(html, { city, path, home = false }) {
  const origin = originFor(city);
  const url = origin + (path === '/' ? '/' : path);
  let out = html;
  let title, description;
  if (home) {
    ({ title, description } = homeSeo(city));
    out = out.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`);
  } else {
    title = (out.match(/<title>([^<]*)<\/title>/) || [])[1] || 'Make It Stretch';
    description = (out.match(/<meta name="description" content="([^"]*)">/) || [])[1] || homeSeo(city).description;
  }
  const tags = [
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Make It Stretch">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${origin}${SHARE_IMAGE}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="Make It Stretch: make the grocery money you have last. Free shopping list and meal plan.">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].map(t => '  ' + t).join('\n');
  return out.replace('</head>', `${tags}\n</head>`);
}

/** robots.txt: list everything public; keep out admin, partner sign-up links and the data API. */
export const robotsTxt = city => [
  'User-agent: *',
  'Disallow: /admin',
  'Disallow: /join/',
  'Disallow: /api/',
  '',
  `Sitemap: ${originFor(city)}/sitemap.xml`,
  '',
].join('\n');

/** sitemap.xml: the public pages at this city's web address. */
export const sitemapXml = city => [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...PUBLIC_PAGES.map(p => `  <url><loc>${originFor(city)}${p}</loc></url>`),
  '</urlset>',
  '',
].join('\n');
