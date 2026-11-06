// Phase 6 accessibility audit: every screen x 4 languages, plus keyboard-only runs, reflow, spacing.
// Run: PORT=3101 ADMIN_KEY=local-test node server.js, then: node scripts/a11y-audit.cjs (needs Playwright + Chromium).
// Checks every screen in four languages (axe WCAG 2.2 AA + best practice), one h1 per screen,
// heading order, tap targets, 320px reflow, text spacing, page titles, keyboard-only flow, forced colors.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const axeSrc = fs.readFileSync('/home/user/makeitstretch-civic/node_modules/axe-core/axe.min.js', 'utf8');
const URL = process.env.AUDIT_URL || 'http://localhost:3101';
const D = require('path').join(__dirname, '../.audit/'); fs.mkdirSync(D, { recursive: true });
const findings = [];
const add = (screen, kind, detail) => findings.push({ screen, kind, detail });

async function check(p, screen, { spacing = true } = {}) {
  await p.waitForTimeout(250);
  if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ content: axeSrc });
  const ax = await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
  for (const v of ax.violations) add(screen, 'axe:' + v.id, v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | '));
  const r = await p.evaluate(() => {
    const vis = el => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && b.width > 0 && b.height > 0; };
    const out = {};
    out.title = document.title; out.lang = document.documentElement.lang;
    out.h1 = [...document.querySelectorAll('h1')].filter(vis).length;
    const hs = [...document.querySelectorAll('h1,h2,h3,h4')].filter(vis).map(h => +h.tagName[1]);
    out.skips = hs.filter((l, i) => i && l > hs[i - 1] + 1).length;
    out.small = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, [role=button]')].filter(vis).filter(el => {
      const b = el.getBoundingClientRect();
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p,li,dd')) return false; // inline text links are exempt
      if (el.type === 'radio' || el.type === 'checkbox') { const l = el.closest('label'); if (l) { const lb = l.getBoundingClientRect(); return lb.width < 24 || lb.height < 24; } }
      return b.width < 24 || b.height < 24;
    }).map(el => el.outerHTML.slice(0, 80));
    out.overflowX = document.documentElement.scrollWidth - innerWidth;
    return out;
  });
  if (r.h1 !== 1 && !screen.includes('results')) add(screen, 'one-h1', `h1 count ${r.h1}`);
  if (r.skips) add(screen, 'heading-skip', `${r.skips} skipped heading levels`);
  if (r.small.length) add(screen, 'target-size', r.small.slice(0, 3).join(' | '));
  if (r.overflowX > 1) add(screen, 'overflow-x', r.overflowX + 'px');
  if (spacing) {
    const clipped = await p.evaluate(() => {
      const st = document.createElement('style'); st.id = 'ts';
      st.textContent = '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }';
      document.head.append(st);
      const bad = [...document.querySelectorAll('body *')].filter(el => {
        const s = getComputedStyle(el); if (!/hidden|clip/.test(s.overflow + s.overflowX + s.overflowY)) return false;
        if (el.classList.contains('sr-only') || el.closest('[aria-hidden=true]')) return false;
        return el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2;
      }).map(el => el.className || el.tagName);
      st.remove(); return bad;
    });
    if (clipped.length) add(screen, 'text-spacing-clip', clipped.slice(0, 4).join(', '));
  }
  return r;
}

async function budgetFlow(p, tag, cap) {
  await p.goto(URL + '/'); await p.waitForSelector('#door-budget'); cap.titles.push(await p.title());
  await check(p, tag + ' intro');
  await p.click('#door-budget'); await check(p, tag + ' step budget'); cap.titles.push(await p.title());
  await p.fill('#budget', '60'); await p.keyboard.press('Enter');
  await check(p, tag + ' step days');
  await p.click('[data-group=days][data-value="7"]'); await p.click('button[type=submit]');
  await check(p, tag + ' step people');
  await p.click('[data-group=people][data-value="2"]'); await p.click('button[type=submit]');
  await check(p, tag + ' step zip');
  await p.fill('#zip', '78702'); await p.click('button[type=submit]');
  await check(p, tag + ' step prefs'); cap.titles.push(await p.title());
  await p.click('button[type=submit]'); await p.waitForSelector('#k-save', { timeout: 20000 });
  await check(p, tag + ' results', { spacing: true }); cap.titles.push(await p.title());
  // Plan home: open every card and check each panel on its own
  for (const id of await p.$$eval('[data-open-panel]', b => b.map(x => x.dataset.openPanel))) {
    await p.click(`[data-open-panel="${id}"]`); await p.waitForTimeout(300);
    await check(p, tag + ' panel ' + id, { spacing: false });
    await p.click('#to-home'); await p.waitForTimeout(200);
  }
}
async function boxFlow(p, tag) {
  await p.goto(URL + '/'); await p.click('#door-box'); await check(p, tag + ' box');
  for (const id of ['rice', 'drybeans', 'tuna', 'oats']) { const b = await p.$(`[data-item=${id}]`); if (b) await b.click(); }
  await p.click('#boxform button[type=submit]'); await p.waitForSelector('.hub', { timeout: 20000 });
  await check(p, tag + ' box results');
  for (const id of await p.$$eval('[data-open-panel]', b => b.map(x => x.dataset.openPanel))) {
    await p.click(`[data-open-panel="${id}"]`); await p.waitForTimeout(300);
    await check(p, tag + ' box panel ' + id, { spacing: false });
    await p.click('#to-home'); await p.waitForTimeout(200);
  }
}

(async () => {
  const b = await chromium.launch(); const titles = {};
  // 1. Every screen, four languages, desktop + phone
  for (const [lang, loc] of [['en', 'en-US'], ['es', 'es-US'], ['vi', 'vi-VN'], ['zh', 'zh-CN']]) {
    for (const [dev, opts] of [['desk', { viewport: { width: 1280, height: 900 } }], ['phone', { ...devices['iPhone 13'] }]]) {
      const c = await b.newContext({ ...opts, locale: loc }); const p = await c.newPage();
      await p.addInitScript(() => { try { localStorage.setItem('mis:test', '1'); } catch {} });
      const cap = { titles: [] }; const tag = `${lang}/${dev}`;
      await budgetFlow(p, tag, cap); titles[tag] = cap.titles;
      await boxFlow(p, tag);
      await c.close();
    }
  }
  // 2. Other pages (English)
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await c.newPage();
  for (const [name, path] of [['landing', '/?site=landing'], ['share', '/share'], ['privacy', '/privacy'], ['add-site', '/add-site'], ['admin login', '/admin']]) {
    await p.goto(URL + path); await p.waitForTimeout(600); await check(p, name);
  }
  await p.fill('#pw', 'local-test'); await p.click('button[type=submit]'); await p.waitForSelector('#open-report');
  await check(p, 'admin', { spacing: false });
  await p.click('#open-report'); await p.waitForSelector('.report'); await check(p, 'admin report', { spacing: false });
  await c.close();
  // 3. Reflow: 320px wide (= 1280px at 400% zoom)
  const rc = await b.newContext({ viewport: { width: 320, height: 640 } }); const rp = await rc.newPage();
  await rp.addInitScript(() => { try { localStorage.setItem('mis:test', '1'); } catch {} });
  await budgetFlow(rp, 'reflow320', { titles: [] }); await boxFlow(rp, 'reflow320');
  for (const [name, path] of [['landing', '/?site=landing'], ['share', '/share'], ['privacy', '/privacy'], ['add-site', '/add-site']]) { await rp.goto(URL + path); await rp.waitForTimeout(500); await check(rp, 'reflow320 ' + name, { spacing: false }); }
  await rp.goto(URL + '/'); await rp.screenshot({ path: D + 'reflow320-home.png', fullPage: true });
  await rc.close();
  // 4. Keyboard only: budget flow end to end
  const kc = await b.newContext({ viewport: { width: 1280, height: 900 } }); const kp = await kc.newPage();
  await kp.addInitScript(() => { try { localStorage.setItem('mis:test', '1'); } catch {} });
  await kp.goto(URL + '/'); await kp.waitForSelector('#door-budget');
  const kb = { steps: [], noRing: new Set(), focusAfterView: [] };
  const ring = async () => kp.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e); const ok = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'; return ok ? null : (e.id || e.className || e.tagName); });
  const tabTo = async (pred, max = 60) => { for (let i = 0; i < max; i++) { await kp.keyboard.press('Tab'); const r = await ring(); if (r) kb.noRing.add(r); if (await kp.evaluate(pred)) return true; } return false; };
  const where = () => kp.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  kb.steps.push(['reach budget door', await tabTo(() => document.activeElement?.id === 'door-budget')]);
  await kp.keyboard.press('Enter'); await kp.waitForTimeout(200); kb.focusAfterView.push(await where());
  kb.steps.push(['reach budget input', await tabTo(() => document.activeElement?.id === 'budget')]);
  await kp.keyboard.type('60'); await kp.keyboard.press('Enter'); await kp.waitForTimeout(200); kb.focusAfterView.push(await where());
  for (const [grp, val] of [['days', '7'], ['people', '2']]) {
    kb.steps.push([`reach ${grp}=${val}`, await tabTo(() => document.activeElement?.dataset?.value === arguments[0], 40).catch(() => false)]);
  }
  await kc.close();
  // Simpler keyboard pass for option groups: tab through and activate with Space
  const k2 = await b.newContext({ viewport: { width: 1280, height: 900 } }); const k2p = await k2.newPage();
  await k2p.addInitScript(() => { try { localStorage.setItem('mis:test', '1'); } catch {} });
  await k2p.goto(URL + '/'); await k2p.waitForSelector('#door-budget'); await k2p.focus('#door-budget'); await k2p.keyboard.press('Enter');
  await k2p.waitForTimeout(150); await k2p.focus('#budget'); await k2p.keyboard.type('60'); await k2p.keyboard.press('Enter'); await k2p.waitForTimeout(200);
  const kbOpt = async (group, value) => { for (let i = 0; i < 30; i++) { await k2p.keyboard.press('Tab'); const hit = await k2p.evaluate(([g, v]) => { const e = document.activeElement; return e?.dataset?.group === g || e?.name === g ? (e.dataset.value === v || e.value === v) : false; }, [group, value]); if (hit) { await k2p.keyboard.press('Space'); return true; } } return false; };
  const kbSubmit = async () => { await k2p.keyboard.press('Enter'); await k2p.waitForTimeout(250); };
  kb.days = await kbOpt('days', '7'); await k2p.focus('button[type=submit]'); await kbSubmit();
  kb.people = await kbOpt('people', '2'); await k2p.focus('button[type=submit]'); await kbSubmit();
  kb.zipFocus = await k2p.evaluate(() => document.activeElement?.id); await k2p.focus('#skip'); await k2p.keyboard.press('Enter'); await k2p.waitForTimeout(250);
  await k2p.focus('button[type=submit]'); await k2p.keyboard.press('Enter');
  kb.results = !!(await k2p.waitForSelector('#k-save', { timeout: 20000 }).catch(() => null));
  kb.resultsFocus = await k2p.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  // Tab through the whole results page: any focusable without a visible ring?
  for (let i = 0; i < 200; i++) { await k2p.keyboard.press('Tab'); const r = await k2p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'BODY'; const s = getComputedStyle(e); const ok = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'; return ok ? null : (e.id || e.className || e.tagName); }); if (r === 'BODY') break; if (r) kb.noRing.add(r); }
  await k2.close();
  kb.noRing = [...kb.noRing];
  // 5. Forced colors (Windows high contrast)
  const fc = await b.newContext({ viewport: { width: 1280, height: 900 }, forcedColors: 'active' }); const fp = await fc.newPage();
  await fp.goto(URL + '/'); await fp.waitForTimeout(500); await fp.screenshot({ path: D + 'forced-colors-home.png' }); await fc.close();
  await b.close();
  const byKind = {}; for (const f of findings) (byKind[f.kind] ||= []).push(f.screen + ' → ' + f.detail);
  console.log(JSON.stringify({ byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, { n: v.length, ex: [...new Set(v)].slice(0, 6) }])), titles, kb }, null, 1));
})();
