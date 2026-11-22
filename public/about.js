// About page (owner decision, Nov 22 2026): the story, Margin Ventures and the FACE grant, and the
// "Stay connected" form (POST /api/connect, server/connect.js). Same language switch as the rest of the site.
import { LANGS, pickLang, rememberLang } from './i18n/index.js';
import { setFooterLinks } from './footer.js';

// The City of Austin's announcement of the 2026 FACE grant recipients (Margin Ventures is listed; checked Nov 22 2026).
export const GRANT_URL = 'https://www.austintexas.gov/climate/news/city-invests-34-organizations-focused-food-access-climate-action-and-community';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const qs = location.search;
let city = null, lang = 'en', sent = false;

async function render(code) {
  lang = code;
  const P = (await import(`./i18n/about/${code}.js`)).default, C = P.connect;
  document.documentElement.lang = LANGS.find(l => l.code === code)?.html || code;
  document.title = `${P.title} · ${city?.name || 'Make It Stretch'}`;
  document.getElementById('about').innerHTML = `
    <p class="eyebrow">${esc(P.eyebrow)}</p>
    <h1>${esc(P.heading)}</h1>
    <p class="policy-intro">${esc(P.intro)}</p>
    ${P.sections.map(s => `<section><h2>${esc(s.h)}</h2>${s.p.map(t => `<p>${esc(t)}</p>`).join('')}
      ${s.link ? `<p><a href="${GRANT_URL}" target="_blank" rel="noopener">${esc(s.link)}</a></p>` : ''}</section>`).join('')}
    <section><h2>${esc(P.promises_h)}</h2><ul>${P.promises.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <p><a href="/how-plans-work${esc(qs)}">${esc(P.plan_link)}</a></p></section>
    <section class="connect" id="connect" aria-labelledby="h-connect">
      <h2 id="h-connect">${esc(C.h)}</h2>
      ${sent ? `<p class="connect-done" role="status" tabindex="-1">${esc(C.thanks)}</p>` : `
      <p>${esc(C.p)}</p>
      <form id="connect-form" novalidate>
        <label for="c-email">${esc(C.email)}</label>
        <input id="c-email" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="254">
        <fieldset class="connect-roles"><legend>${esc(C.role)}</legend>
          ${Object.entries(C.roles).map(([k, v], i) => `<label class="connect-role"><input type="radio" name="role" value="${k}" ${i === 0 ? 'checked' : ''}> ${esc(v)}</label>`).join('')}
        </fieldset>
        <label for="c-msg">${esc(C.message)}</label>
        <textarea id="c-msg" name="message" rows="4" maxlength="1000"></textarea>
        <div class="connect-hp" aria-hidden="true"><label for="c-web">Website</label><input id="c-web" name="website" tabindex="-1" autocomplete="off"></div>
        <p class="connect-error" id="c-error" role="alert"></p>
        <button type="submit" class="btn btn-primary" id="c-send">${esc(C.send)}</button>
        <p class="connect-note">${esc(C.note)} <a href="/privacy${esc(qs)}">${esc(P.privacy)}</a></p>
      </form>`}
    </section>
    ${city?.id && city.id !== 'national' ? `<p><a class="btn btn-ghost" href="/${esc(qs)}">${esc(P.back)}</a></p>` : ''}`;
  document.getElementById('disclaimer').textContent = city?.i18n?.[code]?.disclaimer || city?.disclaimer || '';
  document.querySelectorAll('.lang-switch button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === code));
  setFooterLinks(code, qs);
  wireForm(C);
  if (location.hash === '#connect') document.getElementById('connect')?.scrollIntoView();
}

function wireForm(C) {
  const form = document.getElementById('connect-form');
  if (!form) return;
  form.email.addEventListener('input', () => { document.getElementById('c-error').textContent = ''; });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('c-error'), btn = document.getElementById('c-send');
    const email = form.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = C.bad_email; form.email.focus(); return; }
    err.textContent = ''; btn.disabled = true; btn.textContent = C.sending;
    try {
      const r = await fetch('/api/connect' + qs, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: form.role.value, message: form.message.value, website: form.website.value, lang }) });
      if (r.status === 400) throw Object.assign(new Error('email'), { email: true });
      if (!r.ok) throw new Error(String(r.status));
      sent = true;
      await render(lang);
      document.querySelector('.connect-done')?.focus?.();
    } catch (x) {
      err.textContent = x.email ? C.bad_email : C.error;
      btn.disabled = false; btn.textContent = C.send;
    }
  });
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
