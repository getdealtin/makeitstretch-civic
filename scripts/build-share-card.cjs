// Makes public/icons/share-card.png: the 1200×630 picture shown when a link to the site is texted or posted
// (owner choice, Nov 27 2026). The app icon and the site's own fonts and colors; no other art.
// Run: node scripts/build-share-card.cjs   (needs Playwright's Chromium)
const { chromium } = require('playwright');
const path = require('path');
const root = path.join(__dirname, '..', 'public');
const font = f => 'data:font/woff2;base64,' + require('fs').readFileSync(path.join(root, 'fonts', f)).toString('base64');
const icon = require('fs').readFileSync(path.join(root, 'icons', 'icon.svg'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Zilla;src:url(${font('zilla-slab-latin-600-normal.woff2')})}
@font-face{font-family:Inter;src:url(${font('inter-latin-wght-normal.woff2')})}
html,body{margin:0}
.card{width:1200px;height:630px;background:#38377E;display:flex;align-items:center;gap:72px;padding:0 90px;box-sizing:border-box;color:#fff}
.icon svg{width:280px;height:280px;border-radius:60px;display:block}
h1{font-family:Zilla;font-weight:600;font-size:84px;line-height:1.05;margin:0}
p{font-family:Inter;font-size:38px;color:#F3DDB0;margin:28px 0 0}
</style></head><body><div class="card"><div class="icon">${icon}</div>
<div><h1>Make the grocery money you have last</h1><p>Free shopping list and meal plan</p></div></div></body></html>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(html); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(root, 'icons', 'share-card.png') });
  await b.close();
  console.log('wrote public/icons/share-card.png');
})();
