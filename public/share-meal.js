// "Share a meal that stretches" (community recipes, owner decisions Nov 22 2026). One screen: the dish, when
// it's eaten, foods picked from the priced list (so the site can price it) with amounts, anything else typed
// (goes under "You'll also need"), steps, how many it feeds, where it's from and a name (both optional), and
// consent. POST /api/recipes/submit (server/community.js); nothing is shown until the owner approves it.
import { LANGS, pickLang, rememberLang, loadLang } from './i18n/index.js';
import { setFooterLinks } from './footer.js';
import { INGREDIENT_FOODS, cleanFoodWord } from '/engine/index.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const qs = location.search;
const WORDS = Object.keys(INGREDIENT_FOODS);
let city = null, lang = 'en', P = null, words = {}, done = null;
// What's been entered, kept across language switches.
const form = { title: '', slot: '', picked: [], extras: [], steps: '', serves: '4', origin: '', name: '', consent: false };
const label = w => words[w] || w;
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);

async function render(code) {
  lang = code;
  P = (await import(`./i18n/share-meal/${code}.js`)).default;
  words = code === 'en' ? {} : ((await loadLang(code)).data.ingredients || {});
  document.documentElement.lang = LANGS.find(l => l.code === code)?.html || code;
  document.title = `${P.title} · ${city?.name || 'Make It Stretch'}`;
  const root = document.getElementById('share');
  root.innerHTML = done ? thanksHtml() : formHtml();
  document.getElementById('disclaimer').textContent = city?.i18n?.[code]?.disclaimer || city?.disclaimer || '';
  document.querySelectorAll('.lang-switch button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === code));
  setFooterLinks(code, qs);
  if (!done) wire(); else document.getElementById('thanks-h')?.focus();
}

function formHtml() {
  return `<h1>${esc(P.title)}</h1>
  <p class="policy-intro">${esc(P.intro)}</p>
  <form id="share-form" class="share-form" novalidate>
    <label for="s-title">${esc(P.dish)}</label>
    <input id="s-title" maxlength="80" value="${esc(form.title)}" autocomplete="off">
    <fieldset class="share-slots"><legend>${esc(P.slot)}</legend>
      ${Object.entries(P.slots).map(([k, v]) => `<label class="pill-choice"><input type="radio" name="slot" value="${k}" ${form.slot === k ? 'checked' : ''}> ${esc(v)}</label>`).join('')}
    </fieldset>
    <fieldset class="share-ing"><legend>${esc(P.ing_h)}</legend>
      <p class="share-hint">${esc(P.ing_p)}</p>
      <label for="s-find" class="sr-only">${esc(P.find)}</label>
      <input id="s-find" type="search" placeholder="${esc(P.find_ph)}" autocomplete="off" aria-describedby="s-suggest-hint">
      <div id="s-suggest" class="share-suggest" aria-live="polite"></div>
      <span id="s-suggest-hint" class="sr-only">${esc(P.find)}</span>
      <ul id="s-picked" class="share-picked"></ul>
    </fieldset>
    <div class="share-extras">
      <p class="share-sub">${esc(P.extras_h)}</p>
      <p class="share-hint">${esc(P.extras_p)}</p>
      <div class="share-extras-row"><label for="s-extra" class="sr-only">${esc(P.extras_h)}</label>
        <input id="s-extra" maxlength="30" placeholder="${esc(P.extras_ph)}" autocomplete="off">
        <button type="button" class="btn btn-ghost btn-sm" id="s-extra-add">${esc(P.add)}</button></div>
      <p id="s-extras" class="share-extras-list"></p>
    </div>
    <label for="s-steps">${esc(P.steps)}</label>
    <textarea id="s-steps" rows="5" maxlength="1500">${esc(form.steps)}</textarea>
    <div class="share-two">
      <div><label for="s-serves">${esc(P.serves)}</label>
        <input id="s-serves" type="number" inputmode="numeric" min="1" max="20" value="${esc(form.serves)}"></div>
      <div><label for="s-origin">${esc(P.origin)}</label>
        <input id="s-origin" maxlength="80" placeholder="${esc(P.origin_ph)}" value="${esc(form.origin)}"></div>
    </div>
    <label for="s-name">${esc(P.name)}</label>
    <input id="s-name" maxlength="40" value="${esc(form.name)}" autocomplete="nickname" aria-describedby="s-name-p">
    <p class="share-hint" id="s-name-p">${esc(P.name_p)}</p>
    <label class="share-consent"><input type="checkbox" id="s-consent" ${form.consent ? 'checked' : ''}> <span>${esc(P.consent)}</span></label>
    <div class="connect-hp" aria-hidden="true"><label for="s-web">Website</label><input id="s-web" tabindex="-1" autocomplete="off"></div>
    <p class="connect-error" id="s-error" role="alert"></p>
    <button type="submit" class="btn btn-primary" id="s-send">${esc(P.send)}</button>
    <p class="share-hint">${esc(P.foot)}</p>
  </form>`;
}

function thanksHtml() {
  const by = done.name ? fill(P.shared_by, { name: done.name }) : P.shared_neighbor;
  return `<h1 id="thanks-h" tabindex="-1">${esc(done.name ? fill(P.thanks, { name: done.name }) : P.thanks_plain)}</h1>
  <p class="policy-intro">${esc(fill(P.thanks_p, { title: done.title }))}</p>
  <div class="community-preview">
    <p class="community-badge">${esc(P.preview)}</p>
    <p class="community-title">${esc(done.title)}</p>
    <p class="community-by">${esc(P.community)} · ${esc(by)}</p>
  </div>
  <p>${esc(P.thanks_note)}</p>
  <p class="share-actions"><a class="btn btn-ghost" href="/share-a-meal${esc(qs)}" id="s-again">${esc(P.another)}</a>
    <a class="btn btn-primary" href="/${esc(qs)}">${esc(P.back)}</a></p>`;
}

function wire() {
  const $ = id => document.getElementById(id);
  const save = () => {
    form.title = $('s-title').value; form.steps = $('s-steps').value; form.serves = $('s-serves').value;
    form.origin = $('s-origin').value; form.name = $('s-name').value; form.consent = $('s-consent').checked;
    form.slot = document.querySelector('input[name=slot]:checked')?.value || '';
  };
  document.getElementById('share-form').addEventListener('input', save);
  document.getElementById('share-form').addEventListener('change', save);

  const paintPicked = () => {
    $('s-picked').innerHTML = form.picked.map((p, i) => `<li><span class="share-food">${esc(label(p.word))}</span>
      <label class="sr-only" for="s-amt-${i}">${esc(P.amount)}: ${esc(label(p.word))}</label>
      <input id="s-amt-${i}" data-amt="${i}" maxlength="30" placeholder="${esc(P.amount_ph)}" value="${esc(p.amount)}">
      <button type="button" class="share-remove" data-rm="${i}" aria-label="${esc(P.remove)}: ${esc(label(p.word))}">×</button></li>`).join('');
    $('s-picked').querySelectorAll('[data-amt]').forEach(el => el.addEventListener('input', () => { form.picked[el.dataset.amt].amount = el.value; }));
    $('s-picked').querySelectorAll('[data-rm]').forEach(el => el.addEventListener('click', () => { form.picked.splice(Number(el.dataset.rm), 1); paintPicked(); $('s-find').focus(); }));
  };
  const paintExtras = () => {
    $('s-extras').innerHTML = form.extras.map((w, i) => `<span class="need-tag">${esc(w)} <button type="button" class="share-x" data-xrm="${i}" aria-label="${esc(P.remove)}: ${esc(w)}">×</button></span>`).join(' ');
    $('s-extras').querySelectorAll('[data-xrm]').forEach(el => el.addEventListener('click', () => { form.extras.splice(Number(el.dataset.xrm), 1); paintExtras(); }));
  };
  const suggest = () => {
    const q = $('s-find').value.trim().toLowerCase();
    if (!q) { $('s-suggest').innerHTML = ''; return; }
    const hits = WORDS.filter(w => !form.picked.some(p => p.word === w) && (w.includes(q) || label(w).toLowerCase().includes(q))).slice(0, 8);
    $('s-suggest').innerHTML = hits.length
      ? hits.map(w => `<button type="button" class="pill-choice" data-add="${esc(w)}">+ ${esc(label(w))}</button>`).join('')
      : `<p class="share-hint">${esc(P.no_match)}</p>`;
    $('s-suggest').querySelectorAll('[data-add]').forEach(el => el.addEventListener('click', () => {
      if (form.picked.length < 15) form.picked.push({ word: el.dataset.add, amount: '' });
      $('s-find').value = ''; $('s-suggest').innerHTML = ''; paintPicked();
      document.querySelector(`[data-amt="${form.picked.length - 1}"]`)?.focus();
    }));
  };
  $('s-find').addEventListener('input', suggest);
  $('s-find').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('s-suggest').querySelector('[data-add]')?.click(); } });
  const addExtra = () => {
    const w = cleanFoodWord($('s-extra').value);
    if (w && !form.extras.includes(w) && form.extras.length < 8) form.extras.push(w);
    $('s-extra').value = ''; paintExtras();
  };
  $('s-extra-add').addEventListener('click', addExtra);
  $('s-extra').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } });
  paintPicked(); paintExtras();

  document.getElementById('share-form').addEventListener('submit', async e => {
    e.preventDefault(); save();
    const err = $('s-error'), btn = $('s-send');
    const serves = Number(form.serves);
    const problem = form.title.trim().length < 3 ? ['title', 's-title'] : !form.slot ? ['slot', null] : !form.picked.length ? ['ingredients', 's-find']
      : form.steps.trim().length < 20 ? ['steps', 's-steps'] : !(Number.isInteger(serves) && serves >= 1 && serves <= 20) ? ['serves', 's-serves']
      : !form.consent ? ['consent', 's-consent'] : null;
    if (problem) { err.textContent = P.err[problem[0]]; if (problem[1]) $(problem[1]).focus(); return; }
    err.textContent = ''; btn.disabled = true; btn.textContent = P.sending;
    try {
      const r = await fetch('/api/recipes/submit' + qs, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        title: form.title, slot: form.slot, ingredients: form.picked, extras: form.extras, steps: form.steps, serves,
        origin: form.origin, shared_by: form.name, consent: form.consent, website: $('s-web').value, lang,
      }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(String(r.status)), { code: j.error });
      done = { title: form.title.trim(), name: form.name.trim() };
      render(lang);
    } catch (x) {
      err.textContent = P.err[x.code] || P.err.error;
      btn.disabled = false; btn.textContent = P.send;
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
