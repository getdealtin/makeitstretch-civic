// "How your plan is made": the engine's principles in plain words (public/i18n/principles/), with the
// same language switch as the rest of the site.
import { LANGS, pickLang, rememberLang } from './i18n/index.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const qs = location.search;
let city = null;

async function render(code) {
  const P = (await import(`./i18n/principles/${code}.js`)).default;
  document.documentElement.lang = LANGS.find(l => l.code === code)?.html || code;
  document.title = `${P.title} · ${city?.name || 'Make It Stretch'}`;
  document.getElementById('policy').innerHTML = `
    <h1>${esc(P.title)}</h1>
    <p class="policy-intro">${esc(P.intro)}</p>
    <ol class="principles">${P.items.map(i => `<li id="${esc(i.id)}"><h2>${esc(i.h)}</h2><p>${esc(i.p)}</p></li>`).join('')}</ol>
    ${city?.id && city.id !== 'national' ? `<p><a class="btn btn-primary" href="/${esc(qs)}">${esc(P.back)}</a></p>` : ''}`;
  document.getElementById('disclaimer').textContent = city?.i18n?.[code]?.disclaimer || city?.disclaimer || '';
  document.querySelectorAll('.lang-switch button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === code));
}

(async () => {
  try { city = await (await fetch('/api/config' + qs)).json(); } catch { city = { languages: ['en'] }; }
  if (qs) document.querySelector('link[href="/theme.css"]').href = '/theme.css' + qs;
  if (city.name) document.getElementById('brand-name').textContent = city.name;
  if (city.place) { const p = document.getElementById('brand-place'); p.textContent = city.place; p.hidden = false; }
  const available = LANGS.map(l => l.code).filter(c => (city.languages || ['en']).includes(c));
  const nav = document.getElementById('lang-switch');
  if (available.length > 1) {
    nav.innerHTML = available.map(c => { const l = LANGS.find(x => x.code === c); return `<button type="button" lang="${l.html}" data-lang="${c}">${esc(l.label)}</button>`; }).join('');
    nav.hidden = false;
    nav.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { rememberLang(b.dataset.lang); render(b.dataset.lang); }));
  }
  render(pickLang(available));
})();
