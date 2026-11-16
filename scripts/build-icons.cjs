// Render the app icon (public/icons/icon.svg) to the PNG sizes phones need.
//   node scripts/build-icons.cjs
// icon-192/512: Android and the install prompt. icon-maskable-512: Android shapes it (circle,
// squircle), so the bread sits inside the middle 80% safe zone. apple-touch-icon (180): iPhone home
// screen; iOS rounds the corners itself, so it's a full square.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'public', 'icons');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#38377E"/>` +
  `<g transform="translate(512 512) scale(.8) translate(-512 -512)">${inner}</g></svg>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  for (const [file, size, src] of [['icon-192.png', 192, svg], ['icon-512.png', 512, svg], ['icon-maskable-512.png', 512, maskable], ['apple-touch-icon.png', 180, svg]]) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${src}`);
    await p.screenshot({ path: path.join(dir, file), omitBackground: false });
    console.log('wrote', file);
  }
  await b.close();
})();
