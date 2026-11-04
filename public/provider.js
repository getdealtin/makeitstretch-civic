// Provider sign-up form (/add-site and personal invite links /join/<token>).
// Every submission goes to admin review before it appears on the site.

import en from './i18n/en.js';
import { LANGS, pickLang, rememberLang, loadLang } from './i18n/index.js';

let S = en, lang = 'en', city = null, invite = null;
const t = (key, vars = {}) => (S[key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const qs = location.search;
const app = document.getElementById('app');
const token = (location.pathname.match(/^\/join\/([A-Za-z0-9_-]{10,64})$/) || [])[1] || null;

const KINDS = ['pantry', 'fridge', 'meals', 'mutual_aid', 'other'];
const ACCESS = ['walkup', 'appointment', 'both'];
const OFFERS = ['groceries', 'produce', 'meals', 'baby', 'hygiene', 'other'];
const SPOKEN = ['en', 'es', 'vi', 'zh', 'ar', 'other'];

// Keeps what someone typed if they switch language mid-form.
let draft = {};
let sent = false;

async function boot() {
  try { city = await (await fetch('/api/config' + qs)).json(); } catch { city = { name: 'Make It Stretch', languages: ['en'] }; }
  if (qs) document.querySelector('link[href="/theme.css"]').href = '/theme.css' + qs;
  document.getElementById('brand-name').textContent = city.name;
  if (city.place) { const p = document.getElementById('brand-place'); p.textContent = city.place; p.hidden = false; }
  if (token) {
    try {
      const r = await fetch(`/api/invite/${token}${qs}`);
      invite = r.ok ? await r.json() : { ok: false };
    } catch { invite = { ok: false }; }
  }
  const available = LANGS.map(l => l.code).filter(c => (city.languages || ['en']).includes(c));
  await setLang(pickLang(available));
  const nav = document.getElementById('lang-switch');
  if (available.length > 1) {
    nav.innerHTML = available.map(c => { const l = LANGS.find(x => x.code === c); return `<button type="button" lang="${l.html}" data-lang="${c}" aria-pressed="${c === lang}">${esc(l.label)}</button>`; }).join('');
    nav.hidden = false;
    nav.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { rememberLang(b.dataset.lang); saveDraft(); setLang(b.dataset.lang); }));
  }
}

async function setLang(code) {
  S = (await loadLang(code)).ui; lang = code;
  document.documentElement.lang = LANGS.find(l => l.code === code)?.html || code;
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('.lang-switch button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === code));
  document.getElementById('disclaimer').textContent = city?.i18n?.[code]?.disclaimer || city?.disclaimer || '';
  document.title = t('pf_title') + ' · ' + (city?.name || '');
  sent ? renderThanks() : render();
}

function saveDraft() {
  const f = app.querySelector('form');
  if (!f) return;
  const fd = new FormData(f);
  draft = Object.fromEntries([...fd.entries()].filter(([k]) => !['offers', 'languages'].includes(k)));
  draft.offers = fd.getAll('offers'); draft.languages = fd.getAll('languages');
}

const v = k => esc(draft[k] ?? '');
const radios = (name, opts, label) => opts.map(o => `<label class="choice"><input type="radio" name="${name}" value="${o}" ${draft[name] === o ? 'checked' : ''}><span>${esc(label(o))}</span></label>`).join('');
const checks = (name, opts, label) => opts.map(o => `<label class="choice"><input type="checkbox" name="${name}" value="${o}" ${(draft[name] || []).includes(o) ? 'checked' : ''}><span>${esc(label(o))}</span></label>`).join('');

function render() {
  const title = invite?.ok ? t('pf_title_invite', { org: invite.org_name }) : t('pf_title');
  if (!draft.name && invite?.ok) draft.name = invite.org_name;
  const req = `<span class="req"> (${esc(t('pf_required'))})</span>`;
  app.innerHTML = `
    <form class="pform" id="pform" novalidate>
      <h1 tabindex="-1" id="pf-title">${esc(title)}</h1>
      <p class="hint">${esc(t('pf_intro'))}</p>
      ${token && !invite?.ok ? `<p class="notice">${esc(t('pf_bad_invite'))}</p>` : ''}

      <fieldset class="pf-sec"><legend><h2>${esc(t('pf_sec_site'))}</h2></legend>
        <label class="fl" for="f-name">${esc(t('pf_name'))}${req}</label>
        <input class="fi" id="f-name" name="name" maxlength="200" required value="${v('name')}" autocomplete="organization">

        <fieldset class="group"><legend class="fl">${esc(t('pf_kind'))}${req}</legend>
          <div class="choices">${radios('kind', KINDS, k => t('kind_' + k))}</div></fieldset>

        <label class="fl" for="f-address">${esc(t('pf_address'))}</label>
        <p class="fh" id="h-address">${esc(t('pf_address_hint'))}</p>
        <input class="fi" id="f-address" name="address" maxlength="300" aria-describedby="h-address" value="${v('address')}" autocomplete="street-address">

        <label class="fl" for="f-zip">${esc(t('pf_zip'))}${req}</label>
        <input class="fi fi-sm" id="f-zip" name="zip" inputmode="numeric" maxlength="5" required value="${v('zip')}" autocomplete="postal-code">

        <label class="fl" for="f-hours">${esc(t('pf_hours'))}</label>
        <p class="fh" id="h-hours">${esc(t('pf_hours_hint'))}</p>
        <input class="fi" id="f-hours" name="hours" maxlength="500" aria-describedby="h-hours" value="${v('hours')}">

        <fieldset class="group"><legend class="fl">${esc(t('pf_access'))}</legend>
          <div class="choices">${radios('access', ACCESS, a => t('access_' + a))}</div></fieldset>

        <fieldset class="group"><legend class="fl">${esc(t('pf_id'))}</legend>
          <div class="choices">${radios('id_required', ['yes', 'no'], a => t('pf_id_' + a))}</div></fieldset>

        <fieldset class="group"><legend class="fl">${esc(t('pf_offers'))}</legend>
          <div class="choices">${checks('offers', OFFERS, o => t('offers_' + o))}</div></fieldset>

        <fieldset class="group"><legend class="fl">${esc(t('pf_langs'))}</legend>
          <div class="choices">${checks('languages', SPOKEN, l => t('lang_' + l))}</div></fieldset>

        <label class="fl" for="f-phone">${esc(t('pf_phone'))}</label>
        <input class="fi" id="f-phone" name="phone" type="tel" maxlength="40" value="${v('phone')}">

        <label class="fl" for="f-website">${esc(t('pf_website'))}</label>
        <input class="fi" id="f-website" name="website" maxlength="300" value="${v('website')}" inputmode="url">

        <label class="fl" for="f-about">${esc(t('pf_about'))}</label>
        <p class="fh" id="h-about">${esc(t('pf_about_hint'))}</p>
        <textarea class="fi" id="f-about" name="description" rows="3" maxlength="1000" aria-describedby="h-about">${v('description')}</textarea>
      </fieldset>

      <fieldset class="pf-sec"><legend><h2>${esc(t('pf_sec_contact'))}</h2></legend>
        <p class="fh">${esc(t('pf_contact_hint'))}</p>
        <label class="fl" for="f-cname">${esc(t('pf_contact_name'))}</label>
        <input class="fi" id="f-cname" name="contact_name" maxlength="200" value="${v('contact_name')}" autocomplete="name">
        <label class="fl" for="f-cemail">${esc(t('pf_contact_email'))}</label>
        <input class="fi" id="f-cemail" name="contact_email" type="email" maxlength="200" value="${v('contact_email')}" autocomplete="email">
        <label class="fl" for="f-cphone">${esc(t('pf_contact_phone'))}</label>
        <input class="fi" id="f-cphone" name="contact_phone" type="tel" maxlength="40" value="${v('contact_phone')}" autocomplete="tel">
      </fieldset>

      <div class="hp" aria-hidden="true"><label>Company website<input name="company_website" tabindex="-1" autocomplete="off"></label></div>
      <p class="error" id="err" role="alert"></p>
      <button class="btn btn-primary" type="submit" id="go">${esc(t('pf_submit'))}</button>
    </form>`;

  const f = app.querySelector('#pform');
  f.onsubmit = async e => {
    e.preventDefault();
    saveDraft();
    const err = f.querySelector('#err'), go = f.querySelector('#go');
    const fail = (key, focusSel) => { err.textContent = t(key); f.querySelector(focusSel)?.focus(); };
    if (!draft.name?.trim()) return fail('pf_err_name', '#f-name');
    if (!draft.kind) return fail('pf_err_kind', '[name=kind]');
    if (!/^\d{5}$/.test((draft.zip || '').trim())) return fail('pf_err_zip', '#f-zip');
    if (!draft.contact_email?.trim() && !draft.contact_phone?.trim()) return fail('pf_err_contact', '#f-cemail');
    go.disabled = true; go.textContent = t('pf_sending');
    try {
      const r = await fetch('/api/providers/submit' + qs, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, company_website: f.company_website.value, token }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.ok) { sent = true; draft = {}; return renderThanks(); }
      const map = { name: ['pf_err_name', '#f-name'], kind: ['pf_err_kind', '[name=kind]'], zip: ['pf_err_zip', '#f-zip'], contact: ['pf_err_contact', '#f-cemail'], rate: ['pf_err_rate'] };
      const [k, sel] = map[j.error] || ['pf_err_server'];
      fail(k, sel);
    } catch { fail('pf_err_server'); }
    go.disabled = false; go.textContent = t('pf_submit');
  };
}

function renderThanks() {
  app.innerHTML = `<section class="intro" aria-labelledby="pf-done"><h1 id="pf-done" tabindex="-1">${esc(t('pf_thanks_title'))}</h1><p>${esc(t('pf_thanks'))}</p></section>`;
  app.querySelector('#pf-done').focus();
}

boot();
