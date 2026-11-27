// Search engines and link previews (owner choice, Nov 27 2026): title, description, canonical address,
// preview card, robots.txt and sitemap.xml, for the main site and each city site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { CITIES } from '../cities/index.js';
import { homeSeo, withSeo, robotsTxt, sitemapXml, PUBLIC_PAGES } from '../server/seo.js';

test('the home page title and description, as the owner approved them', () => {
  assert.deepEqual(homeSeo(CITIES.national), {
    title: 'Make It Stretch: Free meal plan for the grocery money you have',
    description: 'Plan meals from your food pantry box and make your grocery budget stretch. Free, no sign-up, in English, Spanish, Vietnamese and Chinese.',
  });
  const a = homeSeo(CITIES.austin);
  assert.equal(a.title, 'Make It Stretch Austin: Free meal plan for the grocery money you have');
  assert.match(a.description, /budget stretch in Austin\. Free, no sign-up/);
  assert.ok(homeSeo(CITIES.national).description.length <= 155, 'fits what Google shows');
});

test('tags: canonical is the city\'s own main address; the preview uses the share card', () => {
  const html = '<html><head><title>Make It Stretch</title>\n<meta name="description" content="old"></head><body></body></html>';
  const out = withSeo(html, { city: CITIES.national, path: '/', home: true });
  assert.match(out, /<title>Make It Stretch: Free meal plan/);
  assert.match(out, /<meta name="description" content="Plan meals from your food pantry box/);
  assert.match(out, /<link rel="canonical" href="https:\/\/makeitstretch\.org\/">/);
  assert.match(out, /og:image" content="https:\/\/makeitstretch\.org\/icons\/share-card\.png"/);
  assert.match(out, /twitter:card" content="summary_large_image"/);
  assert.equal(out.match(/<title>/g).length, 1);
  const about = withSeo(html.replace('Make It Stretch<', 'About · Make It Stretch<'), { city: CITIES.austin, path: '/about' });
  assert.match(about, /<title>About · Make It Stretch<\/title>/, 'other pages keep their own title');
  assert.match(about, /canonical" href="https:\/\/austin\.makeitstretch\.org\/about"/);
  assert.ok(existsSync(new URL('../public/icons/share-card.png', import.meta.url)));
});

test('robots.txt keeps out admin, partner links and the API, and names the sitemap', () => {
  const r = robotsTxt(CITIES.austin);
  for (const p of ['/admin', '/join/', '/api/']) assert.ok(r.includes(`Disallow: ${p}`));
  assert.match(r, /Sitemap: https:\/\/austin\.makeitstretch\.org\/sitemap\.xml/);
  const s = sitemapXml(CITIES.national);
  for (const p of PUBLIC_PAGES) assert.ok(s.includes(`<loc>https://makeitstretch.org${p}</loc>`));
  assert.ok(!s.includes('/admin'));
});

test('the server sends these on every web address (www and ?via=share point to the main address)', async () => {
  const child = spawn(process.execPath, ['--input-type=module', '-e',
    "const { default: app } = await import('./server.js'); const s = app.listen(0, () => console.log('PORT ' + s.address().port));"],
  { env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    const port = await new Promise((ok, no) => {
      let out = '';
      child.stdout.on('data', d => { out += d; const m = out.match(/PORT (\d+)/); if (m) ok(Number(m[1])); });
      child.on('exit', () => no(new Error('server exited')));
    });
    const get = (host, path = '/') => new Promise((ok, no) => http.get({ port, path, headers: { host } }, res => {
      let b = ''; res.on('data', c => { b += c; }); res.on('end', () => ok({ status: res.statusCode, type: res.headers['content-type'], body: b }));
    }).on('error', no));
    const home = await get('www.makeitstretch.org', '/?via=share');
    assert.equal(home.status, 200);
    assert.match(home.body, /<title>Make It Stretch: Free meal plan/);
    assert.match(home.body, /canonical" href="https:\/\/makeitstretch\.org\/"/);
    assert.match(home.body, /id="app"/);
    const austin = await get('austin.makeitstretch.org');
    assert.match(austin.body, /<title>Make It Stretch Austin: /);
    assert.match((await get('makeitstretch.org', '/about')).body, /canonical" href="https:\/\/makeitstretch\.org\/about"/);
    const robots = await get('austin.makeitstretch.org', '/robots.txt');
    assert.match(robots.type, /text\/plain/); assert.match(robots.body, /austin\.makeitstretch\.org\/sitemap\.xml/);
    const map = await get('makeitstretch.org', '/sitemap.xml');
    assert.match(map.type, /xml/); assert.match(map.body, /<loc>https:\/\/makeitstretch\.org\/how-plans-work<\/loc>/);
    const missing = await get('makeitstretch.org', '/no-such-page');
    assert.equal(missing.status, 404); assert.match(missing.body, /id="app"/);
  } finally { child.kill(); }
});
