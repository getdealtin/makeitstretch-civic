// Make It Stretch: client.
// The shared engine runs right here in the browser (served from /engine), so the
// blurred preview updates instantly and a plan still builds if the connection drops
// after the page loads. City identity comes from /api/config; strings from /i18n.

import en from './i18n/en.js';
import { LANGS, pickLang, rememberLang, loadLang } from './i18n/index.js';
import {
  buildCart, matchRecipes, planWeeks, groupShoppingList, zipToInfo,
  matchBox, BOX_GROUPS, foodLabel,
} from '/engine/index.js';
import {
  packPlan, packBox, planHash, boxHash, readHash, planText, boxText, smsHref, mailHref, store,
  savedList, addSaved, updateSaved, removeSaved, findSaved,
} from './keep.js';

// ── Language ────────────────────────────────────────────────────
let S = en;   // UI strings for the current language
let D = {};   // data translations: foods, tips, ingredient words, recipes
let lang = 'en';
const t = (key, vars = {}) => (S[key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
// Display-only translations. The engine always works in English (ids and titles),
// so a plan is identical in every language and links work across languages.
const fName = id => D.foods?.[id]?.name || foodLabel(id);                 // "Dry Pinto Beans"
const fFull = (id, enName) => D.foods?.[id]?.full || enName;             // "Dry Pinto Beans (1 lb)"
const fNote = (id, enNote) => D.foods?.[id]?.note || enNote;
const fTip = enTip => (enTip && D.tips?.[enTip]) || enTip;
const ing = word => D.ingredients?.[word] || word;
const rTitle = r => D.recipes?.[r.id]?.title || r.title;
const rSteps = r => D.recipes?.[r.id]?.instructions || r.instructions;
const cityText = key => city?.i18n?.[lang]?.[key] || city?.[key];
const resText = (r, key) => city?.i18n?.[lang]?.resources?.[r.id]?.[key] || r[key];

// ── Anonymous activity (Phase 4; see /privacy) ──────────────────
// A random token for this visit only: kept in memory, gone when the tab closes, never stored on the device.
const SESSION = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
// "Don't count this browser" (set from /admin): test visits are never sent.
const TESTING = (() => { try { return localStorage.getItem('mis:test') === '1'; } catch { return false; } })();
// Source tag from links and printed QR codes (?src=library); the server keeps only the city's allowed tags.
const SRC = new URLSearchParams(location.search).get('src');
function track(event, data = {}) {
  if (TESTING) return;
  try {
    fetch('/api/event' + qs, {
      method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, session_id: SESSION, lang, data }),
    }).catch(() => {});
  } catch { /* never let counting break the page */ }
}
// What the next results render should record: a new build, a reopened plan, or nothing (re-render).
let logNext = null;
// "Can't use this" reasons, grouped as the Food Plan's Goal 4 indicators split them (must match server/events.js).
const CU_REASONS = {
  cultural: ['halal', 'kosher', 'unfamiliar'],
  medical: ['diabetic', 'low_sodium', 'allergy'],
  practical: ['no_kitchen', 'dont_know_how', 'spoiled'],
};

// Re-renders whatever is on screen (used when the language changes).
let current = () => renderIntro();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => Number(n).toFixed(2);
const qs = location.search; // keeps ?city= in dev

const app = document.getElementById('app');
let city = null;

// ── Data (loaded once, in the background) ───────────────────────
let recipesP = null;
const pricesP = {};
const getRecipes = () => (recipesP ||= fetch('/api/recipes' + qs).then(r => r.json()));
function getPrices(region) {
  const key = region || '_';
  return (pricesP[key] ||= fetch('/api/prices' + (qs ? qs + '&' : '?') + 'region=' + (region || '')).then(r => r.json()));
}
const regionFor = zip => (city?.price_region ? null : zipToInfo(zip || '')?.region) || null;

// ── State ───────────────────────────────────────────────────────
const fresh = () => ({
  budget: null, days: null, people: null, zip: null,
  leftover: 'sometimes', store: 'full', cuisine: [], avoid: [], have: [],
});
let answers = fresh();
let box = { items: [], avoid: [] };
const STEPS = ['budget', 'days', 'people', 'zip', 'prefs'];

// Preference groups, fewest → most options (choice architecture, spec §6).
const PREFS = [
  { key: 'leftover', single: true, options: ['yes', 'sometimes', 'no'] },
  { key: 'store', single: true, options: ['full', 'dollar', 'corner'] },
  { key: 'cuisine', none: 'any', options: ['american', 'latin', 'asian', 'southern', 'mediterranean'] },
  { key: 'avoid', none: 'none', options: ['gluten', 'dairy', 'meat', 'eggs', 'peanuts', 'fish', 'halal', 'kosher', 'diabetic', 'low_sodium'] },
  { key: 'have', none: 'none', options: ['rice', 'beans', 'oats', 'eggs', 'potatoes', 'bread', 'pasta', 'oil'] },
];

const engineInput = a => ({
  budget: a.budget, days: a.days || 7, people: a.people || 1,
  cuisine: a.cuisine, avoid: a.avoid, have: a.have,
  stores: a.store && a.store !== 'full' ? [a.store] : [], leftover: a.leftover,
});

/** Run the whole budget engine in the browser. */
async function computePlan(a) {
  const [recipes, priced] = await Promise.all([getRecipes(), getPrices(regionFor(a.zip))]);
  const input = engineInput(a);
  const result = buildCart(input, priced.prices);
  const bySlot = matchRecipes(recipes, { ingredients: result.cart.map(i => i.id), cuisine: input.cuisine, avoid: input.avoid });
  return { input, result, weeks: planWeeks(bySlot, input), shopping: groupShoppingList(result.cart), priced };
}

// ── Boot ────────────────────────────────────────────────────────
async function boot() {
  try { city = await (await fetch('/api/config' + qs)).json(); }
  catch { city = { name: 'Make It Stretch', languages: ['en'], resources: [] }; }
  const available = LANGS.map(l => l.code).filter(c => (city.languages || ['en']).includes(c));
  await setLang(pickLang(available), { render: false });
  renderLangSwitch(available);

  document.getElementById('brand-name').textContent = city.name;
  const place = document.getElementById('brand-place');
  if (city.place) { place.textContent = city.place; place.hidden = false; }
  document.title = city.place ? `${city.name} · ${city.place}` : city.name;
  if (qs) document.querySelector('link[href="/theme.css"]').href = '/theme.css' + qs;

  getRecipes(); getPrices(null); // warm up in the background
  track('page_view', SRC && (city.sources || []).includes(SRC) ? { src: SRC } : {});
  if (!openFromHash(location.hash, null, 'link')) renderIntro();
  // A different plan link opened in this same tab only changes the #part: no reload happens.
  // (Our own updates use replaceState, which doesn't fire this.)
  window.addEventListener('hashchange', () => { if (!openFromHash(location.hash, null, 'link')) renderIntro(); });
}

async function setLang(code, { render = true } = {}) {
  const { ui, data } = await loadLang(code);
  S = ui; D = data; lang = code;
  document.documentElement.lang = LANGS.find(l => l.code === code)?.html || code;
  document.getElementById('disclaimer').textContent = cityText('disclaimer') || '';
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('.lang-switch button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === code));
  if (render) current();
}

/** The visible language switch: each name written in its own language. */
function renderLangSwitch(available) {
  const nav = document.getElementById('lang-switch');
  if (!nav || available.length < 2) return;
  nav.innerHTML = available.map(c => {
    const l = LANGS.find(x => x.code === c);
    return `<button type="button" lang="${l.html}" data-lang="${c}" aria-pressed="${c === lang}">${esc(l.label)}</button>`;
  }).join('');
  nav.hidden = false;
  nav.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.lang === lang) return;
    track('language_changed', { from: lang, to: b.dataset.lang });
    rememberLang(b.dataset.lang);
    setLang(b.dataset.lang);
  }));
}

const saveKey = () => 'mis:saved:' + (city.id || 'default');
const setHash = h => history.replaceState(null, '', location.pathname + qs + h);
const linkFor = h => location.origin + location.pathname + qs + h;

// Which saved entry (if any) the plan on screen belongs to, so edits update that entry.
let openedSavedId = null;
const SAVED_SHOWN = 3; // most recent shown on the start screen; the rest behind a visible "Show all" button

/** Rebuild a plan or box from a "#p=…" / "#b=…" link. */
function openFromHash(hash, savedId = null, source = null) {
  const hit = readHash(hash);
  if (!hit) return false;
  openedSavedId = savedId;
  logNext = source ? { reopened: source } : null;
  if (hit.kind === 'plan') { answers = { ...fresh(), ...hit.state.answers }; showResults(hit.state); }
  else { box = hit.state; renderBoxResults(); }
  return true;
}

function focusTop(sel) {
  const el = app.querySelector(sel);
  if (el) { el.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }
}

// ── Start screen: two doors ─────────────────────────────────────
function renderIntro() {
  current = renderIntro;
  setHash('');
  openedSavedId = null;
  const saved = savedList(store, saveKey());
  const when = at => new Date(at).toLocaleDateString(document.documentElement.lang || 'en', { month: 'short', day: 'numeric' });
  app.innerHTML = `
    ${saved.length ? `<section class="saved-card" aria-labelledby="saved-title">
      <h2 id="saved-title">${esc(t('saved_list_title'))}</h2>
      <p class="saved-sub">${esc(t('saved_list_sub'))}</p>
      <ul class="saved-list">${saved.map((e, i) => `
        <li class="saved-item" ${i >= SAVED_SHOWN ? 'hidden' : ''}>
          <div class="saved-text">
            <b>${esc(e.title || t('saved_title'))}</b>
            <span>${esc([e.detail, e.at ? t('saved_on', { date: when(e.at) }) : ''].filter(Boolean).join(' · '))}</span>
            <button class="saved-del" data-del="${esc(e.id)}">${esc(t('remove_saved'))}<span class="sr-only">: ${esc(e.title)}</span></button>
          </div>
          <button class="btn btn-primary btn-sm" data-open="${esc(e.id)}">${esc(t('open_saved'))}<span class="sr-only">: ${esc(e.title)}</span></button>
        </li>`).join('')}
      </ul>
      ${saved.length > SAVED_SHOWN ? `<button class="saved-more" id="saved-more" aria-expanded="false">${esc(t('saved_show_all', { n: saved.length }))}</button>` : ''}
    </section>` : ''}
    <section class="intro">
      ${city.place ? `<p class="eyebrow">${esc(city.place)}</p>` : ''}
      <h1 tabindex="-1" id="intro-title">${esc(t('intro_title'))}</h1>
      <p>${esc(t('intro_body'))}</p>
      <div class="doors">
        <button class="door" id="door-budget"><b>${esc(t('door_budget'))}</b><span>${esc(t('door_budget_sub'))}</span></button>
        <button class="door" id="door-box"><b>${esc(t('door_box'))}</b><span>${esc(t('door_box_sub'))}</span></button>
      </div>
    </section>`;
  app.querySelector('#door-budget').onclick = () => { answers = fresh(); go(0); };
  app.querySelector('#door-box').onclick = () => { box = { items: [], avoid: [] }; renderBox(); };
  app.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
    const e = findSaved(store, saveKey(), b.dataset.open);
    if (!e || !openFromHash(e.hash, e.id, 'saved')) { removeSaved(store, saveKey(), b.dataset.open); renderIntro(); }
  }));
  app.querySelector('#saved-more')?.addEventListener('click', e => {
    app.querySelectorAll('.saved-item[hidden]').forEach(li => { li.hidden = false; });
    const first = app.querySelectorAll('.saved-item')[SAVED_SHOWN]?.querySelector('[data-open]');
    e.currentTarget.remove();
    first?.focus();
  });
  app.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    removeSaved(store, saveKey(), b.dataset.del);
    renderIntro();
    (app.querySelector('[data-open]') || app.querySelector('#door-budget')).focus();
  }));
}

// ── Budget flow ─────────────────────────────────────────────────
function go(i) {
  current = () => go(i);
  setHash('');
  openedSavedId = null;
  const name = STEPS[i];
  const pct = Math.round((i / STEPS.length) * 100);
  app.innerHTML = `
    <div class="progress">
      <div class="progress-bar" aria-hidden="true"><div class="progress-fill" style="width:${pct}%"></div></div>
      <p class="progress-label">${esc(t('step_of', { n: i + 1, total: STEPS.length }))}</p>
    </div>
    <form class="step" id="step" novalidate>
      ${STEP_VIEWS[name]()}
      <p class="error" id="err" role="alert"></p>
      <div class="nav">
        <button type="button" class="btn btn-ghost" id="back">${esc(t('back'))}</button>
        <button type="submit" class="btn btn-primary">${esc(i === STEPS.length - 1 ? t('build_plan') : t('continue'))}</button>
        ${name === 'zip' ? `<button type="button" class="btn-link" id="skip">${esc(t('zip_skip'))}</button>` : ''}
      </div>
    </form>
    <div id="preview" class="preview" aria-hidden="true"></div>`;
  const form = app.querySelector('#step');
  const refresh = () => updatePreview(i);
  STEP_WIRE[name]?.(form, refresh);
  form.onsubmit = e => {
    e.preventDefault();
    const err = STEP_SAVE[name](form);
    if (err) { form.querySelector('#err').textContent = t(err); return; }
    track('step_completed', { step: name });
    if (i === STEPS.length - 1) { logNext = { built: true }; showResults(); } else go(i + 1);
  };
  form.querySelector('#back').addEventListener('click', () => (i === 0 ? renderIntro() : go(i - 1)));
  form.querySelector('#skip')?.addEventListener('click', () => { answers.zip = null; track('step_completed', { step: name }); go(i + 1); });
  (form.querySelector('#budget, #zip') || form.querySelector('h2')).focus();
  refresh();
}

// The "this close" preview: a real plan from the answers so far, sharpening each step.
let previewSeq = 0;
async function updatePreview(stepIdx) {
  const el = app.querySelector('#preview');
  if (!el) return;
  if (!answers.budget) { el.innerHTML = ''; return; }
  const seq = ++previewSeq;
  let plan;
  try { plan = await computePlan(answers); } catch { return; }
  if (seq !== previewSeq || !el.isConnected) return;
  const left = STEPS.length - stepIdx - 1; // steps after this one
  const blur = [7, 6, 4.5, 3, 1.5][stepIdx] ?? 1.5;
  const day = plan.weeks[0]?.find(d => !d.leftover);
  const items = plan.result.cart.length;
  el.innerHTML = `
    <div class="preview-card" style="--blur:${blur}px">
      <p class="eyebrow">${esc(t('res_eyebrow'))}</p>
      <p class="preview-big"><b>$${money(plan.result.pppd)}</b> ${esc(t('per_person_day'))}</p>
      ${day ? ['breakfast', 'dinner'].map(s => day[s][0] ? `<p class="preview-meal">${esc(t(s))}: ${esc(rTitle(day[s][0]))}</p>` : '').join('') : ''}
      <p class="preview-meal">${esc(t('preview_items', { n: items }))}</p>
    </div>
    <span class="preview-badge">${esc(left === 0 ? t('preview_badge_last') : left === 1 ? t('preview_badge_one') : t('preview_badge', { n: left }))}</span>`;
}

const optionBtn = (group, value, label, sub, pressed) =>
  `<button type="button" class="option" data-group="${group}" data-value="${value}" aria-pressed="${pressed}">
     <b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;

const STEP_VIEWS = {
  budget: () => `
    <h2 id="q" tabindex="-1">${esc(t('q_budget'))}</h2>
    <p class="hint" id="h">${esc(t('q_budget_hint'))}</p>
    <div class="money"><span aria-hidden="true">$</span>
      <input id="budget" type="number" inputmode="decimal" min="1" max="9999" step="any" placeholder="0"
        aria-labelledby="q" aria-describedby="h" value="${answers.budget ?? ''}"></div>`,

  days: () => `
    <h2 id="q" tabindex="-1">${esc(t('q_days'))}</h2>
    <div class="options" role="group" aria-labelledby="q">
      ${[['few', 4], ['week', 7], ['two', 14], ['month', 30]].map(([k, d]) =>
        optionBtn('days', d, t('days_' + k), t('days_' + k + '_sub'), answers.days === d)).join('')}
    </div>`,

  people: () => `
    <h2 id="q" tabindex="-1">${esc(t('q_people'))}</h2>
    <div class="options" role="group" aria-labelledby="q">
      ${[1, 2, 3, 5].map(n => optionBtn('people', n, t('people_' + n), '', answers.people === n)).join('')}
    </div>
    <p style="margin-top:18px"><label for="people-exact" class="muted">${esc(t('people_exact'))}</label><br>
      <input class="field field-sm" id="people-exact" type="number" inputmode="numeric" min="1" max="20"
        value="${answers.people && ![1, 2, 3, 5].includes(answers.people) ? answers.people : ''}"></p>`,

  zip: () => `
    <h2 id="q" tabindex="-1">${esc(t('q_zip'))}</h2>
    <p class="hint" id="h">${esc(t('q_zip_hint'))}</p>
    <input class="field" id="zip" type="text" inputmode="numeric" autocomplete="postal-code" maxlength="5"
      pattern="[0-9]{5}" placeholder="78702" aria-labelledby="q" aria-describedby="h" value="${answers.zip ?? ''}">`,

  prefs: () => `
    <h2 id="q" tabindex="-1">${esc(t('q_prefs'))}</h2>
    <p class="hint">${esc(t('q_prefs_hint'))}</p>
    ${PREFS.map(g => {
      const opts = [...(g.none ? [g.none] : []), ...g.options];
      return `<fieldset class="pref-group"><legend>${esc(t('pref_' + g.key))}</legend><div class="chips">
        ${opts.map(v => `<button type="button" class="chip" data-pref="${g.key}" data-value="${v}" aria-pressed="${prefOn(g, v)}">${esc(t(g.key + '_' + v))}</button>`).join('')}
      </div>${g.key === 'avoid' ? `<p class="fh avoid-note">${esc(t('avoid_note'))}</p>` : ''}</fieldset>`;
    }).join('')}`,
};

const prefOn = (g, v) => g.single ? answers[g.key] === v : (v === g.none ? answers[g.key].length === 0 : answers[g.key].includes(v));

function wireOptions(form, group, onPick) {
  form.querySelectorAll(`[data-group="${group}"]`).forEach(b => b.addEventListener('click', () => {
    form.querySelectorAll(`[data-group="${group}"]`).forEach(x => x.setAttribute('aria-pressed', x === b));
    onPick(Number(b.dataset.value));
  }));
}

const STEP_WIRE = {
  budget: (f, refresh) => f.querySelector('#budget').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    if (v >= 1 && v <= 9999) { answers.budget = v; refresh(); }
  }),
  days: (f, refresh) => wireOptions(f, 'days', v => { answers.days = v; refresh(); }),
  people: (f, refresh) => {
    const exact = f.querySelector('#people-exact');
    wireOptions(f, 'people', v => { answers.people = v; exact.value = ''; refresh(); });
    exact.addEventListener('input', () => {
      f.querySelectorAll('[data-group="people"]').forEach(x => x.setAttribute('aria-pressed', 'false'));
      const n = parseInt(exact.value, 10);
      if (n >= 1 && n <= 20) { answers.people = n; refresh(); }
    });
  },
  zip: (f, refresh) => f.querySelector('#zip').addEventListener('input', e => {
    if (/^\d{5}$/.test(e.target.value)) { answers.zip = e.target.value; refresh(); }
  }),
  prefs: (f, refresh) => f.querySelectorAll('[data-pref]').forEach(b => b.addEventListener('click', () => {
    const g = PREFS.find(p => p.key === b.dataset.pref);
    const v = b.dataset.value;
    if (g.single) answers[g.key] = v;
    else if (v === g.none) answers[g.key] = [];
    else { const arr = answers[g.key]; const at = arr.indexOf(v); at >= 0 ? arr.splice(at, 1) : arr.push(v); }
    f.querySelectorAll(`[data-pref="${g.key}"]`).forEach(x => x.setAttribute('aria-pressed', prefOn(g, x.dataset.value)));
    refresh();
  })),
};

const STEP_SAVE = {
  budget: f => {
    const v = parseFloat(f.querySelector('#budget').value);
    if (!(v >= 1 && v <= 9999)) return 'err_budget';
    answers.budget = Math.round(v * 100) / 100;
  },
  days: () => (answers.days ? null : 'err_days'),
  people: f => {
    const exact = parseInt(f.querySelector('#people-exact').value, 10);
    if (exact >= 1 && exact <= 20) answers.people = exact;
    return answers.people ? null : 'err_people';
  },
  zip: f => {
    const z = f.querySelector('#zip').value.trim();
    if (!z) { answers.zip = null; return null; }
    if (!/^\d{5}$/.test(z)) return 'err_zip';
    answers.zip = z;
  },
  prefs: () => null,
};

// ── Results ─────────────────────────────────────────────────────
async function showResults(restore = {}) {
  app.innerHTML = `<div class="loading" role="status"><div class="spinner" aria-hidden="true"></div>${esc(t('building'))}</div>`;
  try { renderResults(await computePlan(answers), restore); }
  catch {
    app.innerHTML = `<p class="error" role="alert">${esc(t('error_plan'))}</p>
      <button class="btn btn-primary" id="retry">${esc(t('build_plan'))}</button>`;
    app.querySelector('#retry').onclick = () => showResults(restore);
  }
}

const residents = () => (city.resources || []).filter(r => r.audience !== 'organizations');
const orgs = () => (city.resources || []).filter(r => r.audience === 'organizations');

function helpSection() {
  const card = r => `
    <article class="help-card ${r.audience === 'organizations' ? 'org' : ''}">
      <h3>${esc(resText(r, 'name'))}</h3><p>${esc(resText(r, 'description'))}</p>
      <div class="help-actions">
        ${r.phone ? `<a href="tel:${esc(r.phone)}" data-track="resource" data-target="${esc(r.id)}" data-action="call">${esc(t('call', { phone: r.phone }))}</a>` : ''}
        ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener" data-track="resource" data-target="${esc(r.id)}" data-action="website">${esc(t('visit'))}<span class="sr-only"> (${esc(resText(r, 'name'))})</span></a>` : ''}
      </div>
    </article>`;
  if (!residents().length) return '';
  return `<section class="section" id="help" aria-labelledby="h-help" tabindex="-1">
    <div class="section-head"><h2 id="h-help">${esc(t('sec_help'))}</h2></div>
    <div id="sites" hidden><h3 class="sites-head">${esc(t('sites_title'))}</h3><div id="sites-zip" class="sites-zip no-print"></div><div class="help-list" id="sites-list"></div>
      <h3 class="sites-head">${esc(t('sites_more_help'))}</h3></div>
    <div class="help-list">${residents().map(card).join('')}</div>
    ${orgs().length ? `<h3 class="orgs-head">${esc(t('sec_help_orgs'))}</h3><div class="help-list">${orgs().map(card).join('')}</div>` : ''}
    <p class="add-site no-print"><a href="/add-site${qs}">${esc(t('add_site_cta'))}</a></p>
  </section>`;
}

// A zip typed only to sort food sites. Kept for the visit; it never changes the plan.
let siteZip = null;

function renderSitesZip(box, zip) {
  const slot = box.querySelector('#sites-zip');
  const hasZip = /^\d{5}$/.test(zip || '');
  if (hasZip) {
    slot.innerHTML = `<p class="sites-sorted">${esc(t('sites_sorted', { zip }))}
      <button type="button" class="btn-link sites-change">${esc(t('sites_zip_change'))}</button></p>`;
    slot.querySelector('.sites-change').onclick = () => { renderSitesZip(box, null); slot.querySelector('input')?.focus(); };
    return;
  }
  slot.innerHTML = `<form class="sites-zip-form" novalidate>
      <label for="sites-zip-input">${esc(t('sites_zip_prompt'))}</label>
      <div class="sites-zip-row">
        <input id="sites-zip-input" class="fi fi-sm" inputmode="numeric" autocomplete="postal-code" maxlength="5" pattern="[0-9]{5}">
        <button type="submit" class="btn-xs-site">${esc(t('sites_zip_go'))}</button>
      </div>
      <p class="error" role="alert"></p>
    </form>`;
  const f = slot.querySelector('form');
  f.onsubmit = async e => {
    e.preventDefault();
    const v = f.querySelector('input').value.trim();
    if (!/^\d{5}$/.test(v)) { f.querySelector('.error').textContent = t('sites_zip_err'); return; }
    siteZip = v;
    track('zip_added_later', { zip: v });
    await loadSites(v);
    box.querySelector('.sites-sorted')?.setAttribute('tabindex', '-1');
    box.querySelector('.sites-sorted')?.focus();
  };
}

/** Approved local food sites, nearest the zip first. Fills the help section after it renders.
 *  No zip yet? A small box asks for one right there, where it's useful. */
async function loadSites(zip) {
  const box = app.querySelector('#sites');
  if (!box) return;
  let sites = [];
  try { sites = await (await fetch('/api/providers' + (qs ? qs + '&' : '?') + 'zip=' + (zip || ''))).json(); } catch { return; }
  if (!Array.isArray(sites) || !sites.length || !box.isConnected) return;
  const month = iso => new Date(iso).toLocaleDateString(document.documentElement.lang || 'en', { month: 'long', year: 'numeric' });
  const shown = sites.slice(0, 6);
  box.querySelector('#sites-list').innerHTML = shown.map(p => {
    const where = [p.address, p.zip].filter(Boolean).join(', ');
    const facts = [
      p.access ? t('access_' + p.access) : '',
      p.id_required === true ? t('id_yes') : p.id_required === false ? t('id_no') : '',
    ].filter(Boolean).join(' · ');
    const offers = (p.offers || []).map(o => t('offers_' + o)).join(' · ');
    const langs = (p.languages || []).filter(l => l !== 'en').map(l => t('lang_' + l));
    return `<article class="help-card site-card">
      <span class="site-kind">${esc(t('kind_' + p.kind))}</span>
      <h3>${esc(p.name)}</h3>
      ${where ? `<p class="site-where">${esc(where)}</p>` : ''}
      ${p.hours ? `<p><b>${esc(t('hours'))}${esc(t('label_colon'))}</b> ${esc(p.hours)}</p>` : ''}
      ${facts ? `<p>${esc(facts)}</p>` : ''}
      ${offers ? `<p class="site-offers">${esc(offers)}</p>` : ''}
      ${langs.length ? `<p>${esc(t('speaks', { langs: langs.join(t('list_sep')) }))}</p>` : ''}
      ${p.description ? `<p class="muted">${esc(p.description)}</p>` : ''}
      <div class="help-actions">
        ${where ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ', ' + where)}" target="_blank" rel="noopener" data-track="site" data-target="${esc(p.id)}" data-action="directions">${esc(t('directions'))}<span class="sr-only"> (${esc(p.name)})</span></a>` : ''}
        ${p.phone ? `<a href="tel:${esc(p.phone)}" data-track="site" data-target="${esc(p.id)}" data-action="call">${esc(t('call', { phone: p.phone }))}</a>` : ''}
        ${p.website ? `<a href="${esc(p.website)}" target="_blank" rel="noopener" data-track="site" data-target="${esc(p.id)}" data-action="website">${esc(t('visit'))}<span class="sr-only"> (${esc(p.name)})</span></a>` : ''}
      </div>
      ${p.confirmed_at ? `<p class="site-confirmed">${esc(t('confirmed_on', { date: month(p.confirmed_at) }))}</p>` : ''}
    </article>`;
  }).join('');
  renderSitesZip(box, zip);
  box.hidden = false;
  const jump = app.querySelector('.jump-help span');
  if (jump) jump.textContent = t('jump_help_sub', { n: residents().length + shown.length }) + ' ↓';
}

function renderResults(plan, restore = {}) {
  current = () => openFromHash(location.hash, openedSavedId);
  const { input, result: s, shopping, weeks, priced } = plan;
  const peopleLabel = input.people === 1 ? t('person') : t('people', { n: input.people });
  const calNote = s.calPct >= 80 ? t('cal_ok') : s.calPct >= 60 ? t('cal_low') : t('cal_tight');
  const nItems = s.cart.length;

  // Which option is chosen per meal slot: key "w-d-slot" → index (0 = main pick, 1 = alternate).
  const choice = {};
  for (const k of restore.swaps || []) {
    const [w, d, sl] = k.split('-');
    if (weeks[w]?.[d]?.[sl]?.[1]) choice[k] = 1;
  }
  const checked = new Set(restore.checked || []);
  const recipes = new Map();
  weeks.flat().forEach(d => { if (!d.leftover) ['breakfast', 'lunch', 'dinner'].forEach(sl => d[sl].forEach(r => recipes.set(String(r.id), r))); });

  const listHtml = shopping.map(g => `
    <div class="cat-head"><h3 class="shop-cat">${esc(t('cat_' + g.cat))}</h3>
      <span class="cat-sub">$${money(g.items.reduce((a, i) => a + i.subtotal, 0))}</span></div>
    <ul class="rows">${g.items.map(i => {
      const name = fName(i.id);
      return `<li class="row">
        <input type="checkbox" id="ck-${i.id}" data-item="${i.id}" ${checked.has(i.id) ? 'checked' : ''}>
        <label for="ck-${i.id}">${esc(name)} <span class="qty">×${i.qty}</span></label>
        <button type="button" class="info" aria-expanded="false" aria-controls="more-${i.id}"
          aria-label="${esc(t('more_about', { item: name }))}">ⓘ</button>
        <span class="price">$${money(i.subtotal)}</span>
        <div class="more" id="more-${i.id}" hidden><span class="size">${esc(fFull(i.id, i.name))}</span> ${esc(fNote(i.id, i.note))}${i.tip ? `<div class="shop-tip">${esc(fTip(i.tip))}</div>` : ''}</div>
      </li>`;
    }).join('')}</ul>`).join('');

  const weekPanel = (week, wi) => `
    <div class="week-panel" data-week="${wi}" ${wi === 0 ? '' : 'hidden'}>
      <p class="print-only week-print-title">${esc(t('week_of', { n: wi + 1, total: weeks.length }))}</p>
      ${week.map((d, di) => d.leftover
        ? `<div class="d"><div class="day-name">${esc(d.dayName)}</div><p class="lo">${esc(t('leftovers'))}</p></div>`
        : `<div class="d"><div class="day-name">${esc(d.dayName)}</div>
            ${['breakfast', 'lunch', 'dinner'].map(sl => d[sl].length ? `
              <div class="m"><span>${esc(t(sl))}</span>
                <button type="button" class="meal-pick" data-key="${wi}-${di}-${sl}">${esc(rTitle(d[sl][choice[`${wi}-${di}-${sl}`] || 0]))}</button></div>` : '').join('')}
          </div>`).join('')}
    </div>`;

  app.innerHTML = `
    <section class="summary" aria-labelledby="res-title">
      <p class="eyebrow">${esc(t('res_eyebrow'))}</p>
      <h2 id="res-title" tabindex="-1">${esc(t('res_title', { days: input.days }))}</h2>
      <p class="sum-big"><b>$${money(s.pppd)}</b> ${esc(t('per_person_day'))} · <b>$${money(s.ppmeal)}</b> ${esc(t('a_meal'))}</p>
      <p class="sum-facts">${esc(t('res_facts', { budget: Math.round(input.budget), people: peopleLabel, days: input.days }))} ${esc(calNote)}${s.remaining > 1 ? ' ' + esc(t('res_left', { remaining: money(s.remaining) })) : ''}</p>
      <nav class="jump no-print" aria-label="${esc(t('plan_nav'))}">
        <a href="#list">${esc(t('jump_list'))} <span>${esc(t('jump_list_sub', { n: nItems, total: money(s.spent) }))} ↓</span></a>
        <a href="#meals">${esc(t('jump_meals'))} <span>${esc(weeks.length === 1 ? t('jump_meals_sub_1') : t('jump_meals_sub', { n: weeks.length }))} ↓</span></a>
        ${residents().length ? `<a href="#help" class="jump-help">${esc(t('jump_help'))} <span>${esc(t('jump_help_sub', { n: residents().length }))} ↓</span></a>` : ''}
      </nav>
    </section>

    ${keepBar()}

    <section class="section" id="list" aria-labelledby="h-list" tabindex="-1">
      <div class="section-head"><h2 id="h-list">${esc(t('sec_list'))}</h2>
        <span class="head-hint no-print">${esc(t('tips_hint'))}</span></div>
      ${listHtml}
      <div class="shop-total"><span>${esc(t('total'))}</span><span>$${money(s.spent)}</span></div>
      <p class="price-note">${esc(t('price_note', { label: cityText('price_region_label') || priced.label }))}</p>
    </section>

    <section class="section" id="meals" aria-labelledby="h-plan" tabindex="-1">
      <div class="section-head"><h2 id="h-plan">${esc(t('sec_plan'))}</h2></div>
      ${weeks.length > 1 ? `<div class="wk no-print">
        <button type="button" id="wk-prev" aria-label="${esc(t('prev_week'))}">‹</button>
        <span id="wk-label" aria-live="polite">${esc(t('week_of', { n: 1, total: weeks.length }))}</span>
        <button type="button" id="wk-next" aria-label="${esc(t('next_week'))}">›</button></div>` : ''}
      ${weeks.map(weekPanel).join('')}
      <p class="muted meals-hint no-print">${esc(t('meals_hint'))}</p>
    </section>

    ${helpSection()}

    <div class="nav no-print">
      <button type="button" class="btn btn-ghost" id="print">${esc(t('print'))}</button>
      <button type="button" class="btn btn-ghost" id="restart">${esc(t('start_over'))}</button>
    </div>
    <p class="sr-only" id="announce" aria-live="polite"></p>
    <dialog id="recipe" aria-labelledby="recipe-title"><div class="dialog-body"></div></dialog>`;

  focusTop('#res-title');
  wireJumps();
  loadSites(answers.zip || siteZip);
  if (logNext?.built) track('plan_built', {
    budget: input.budget, days: input.days, people: input.people, zip: answers.zip, store: answers.store,
    cuisine: input.cuisine, avoid: input.avoid, have: input.have, leftover: input.leftover,
    pppd: s.pppd, cal_pct: s.calPct, items: s.cart.length, spent: s.spent,
  });
  else if (logNext?.reopened) { track('plan_reopened', { source: logNext.reopened, kind: 'plan' }); askOutcome('plan'); }
  logNext = null;

  // Keep this plan: the link, the saved copy and the text/email bodies all follow the live state.
  const title = t('res_title', { days: input.days });
  const currentHash = () => planHash(packPlan(answers, {
    swaps: Object.keys(choice).filter(k => choice[k] === 1),
    checked: [...app.querySelectorAll('.row input:checked')].map(x => x.dataset.item),
  }));
  const sync = wireKeep({
    title,
    savedTitle: t('saved_plan_title', { days: input.days }),
    detail: `$${Math.round(input.budget)} · ${peopleLabel}`,
    kind: 'plan',
    hash: currentHash,
    text: full => planText({
      title: `${city.name}${city.place ? ' · ' + city.place : ''}: ${title}`,
      shopping: shopping.map(g => ({ items: g.items.map(i => ({ label: fName(i.id), qty: i.qty, subtotal: i.subtotal })) })),
      weeks, choice, total: s.spent, url: linkFor(currentHash()), full, titleOf: rTitle,
      labels: { list: t('sec_list'), week1: t('week_of', { n: 1, total: weeks.length }), leftover: t('leftover_short'), link: t('full_plan_link') },
    }),
  });
  app.querySelectorAll('.row input').forEach(x => x.addEventListener('change', sync));

  // Shopping list: tips open on tap.
  app.querySelectorAll('.info').forEach(b => b.addEventListener('click', () => {
    const open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', open);
    app.querySelector('#' + b.getAttribute('aria-controls')).hidden = !open;
  }));

  // One week at a time.
  let wk = 0;
  const showWeek = n => {
    wk = (n + weeks.length) % weeks.length;
    app.querySelectorAll('.week-panel').forEach(p => { p.hidden = Number(p.dataset.week) !== wk; });
    app.querySelector('#wk-label').textContent = t('week_of', { n: wk + 1, total: weeks.length });
  };
  app.querySelector('#wk-prev')?.addEventListener('click', () => showWeek(wk - 1));
  app.querySelector('#wk-next')?.addEventListener('click', () => showWeek(wk + 1));

  // Meals: recipe + swap to the alternate. After a swap the dialog stays open on the
  // new meal's recipe, with the swapped-out meal offered as the way back.
  const showMeal = (b, justSwapped = false) => {
    const [w, d, sl] = b.dataset.key.split('-');
    const opts = weeks[w][d][sl];
    const ci = choice[b.dataset.key] || 0;
    if (!justSwapped) track('recipe_opened', { recipe: opts[ci].id, flow: 'plan' });
    openRecipe(opts[ci], opts[1 - ci] ? {
      justSwapped,
      alt: opts[1 - ci],
      onSwap: () => {
        choice[b.dataset.key] = 1 - ci;
        track('meal_swapped', { recipe: opts[1 - ci].id });
        b.textContent = rTitle(opts[1 - ci]);
        app.querySelector('#announce').textContent = t('swapped', { title: rTitle(opts[1 - ci]) });
        sync();
        showMeal(b, true);
      },
    } : {});
  };
  app.querySelectorAll('.meal-pick').forEach(b => b.addEventListener('click', () => showMeal(b)));

  app.querySelector('#print').onclick = () => window.print();
  app.querySelector('#restart').onclick = renderIntro;
}

// ── Keep this plan (no account) ─────────────────────────────────
function keepBar() {
  return `<section class="keep no-print" aria-labelledby="h-keep">
    <h2 id="h-keep" class="keep-title">${esc(t('keep_title'))}</h2>
    <div class="keep-actions">
      <button type="button" class="keep-btn" id="k-save" aria-pressed="false">${esc(t('keep_save'))}</button>
      <a class="keep-btn" id="k-text" href="#">${esc(t('keep_text'))}</a>
      <a class="keep-btn" id="k-email" href="#">${esc(t('keep_email'))}</a>
      <button type="button" class="keep-btn" id="k-copy">${esc(t('keep_copy'))}</button>
    </div>
    <p class="keep-status" id="k-status" aria-live="polite"></p>
  </section>`;
}

/** Wires the keep bar. Returns sync(), to call whenever the plan changes. */
function wireKeep({ title, savedTitle, detail, kind, hash, text }) {
  const saveBtn = app.querySelector('#k-save');
  const status = app.querySelector('#k-status');
  const key = saveKey();
  // Which saved entry is this? The one it was opened from, or one saved with the identical plan.
  let savedId = (openedSavedId && findSaved(store, key, openedSavedId)) ? openedSavedId
    : savedList(store, key).find(e => e.hash === hash())?.id || null;
  const isSaved = () => !!(savedId && findSaved(store, key, savedId));
  const paintSave = () => {
    const on = isSaved();
    saveBtn.textContent = on ? t('keep_saved') : t('keep_save');
    saveBtn.setAttribute('aria-pressed', on);
  };
  const sync = () => {
    const h = hash();
    setHash(h);
    if (isSaved()) updateSaved(store, key, savedId, { hash: h });
    app.querySelector('#k-text').href = smsHref(text(false));
    app.querySelector('#k-email').href = mailHref(title, text(true));
  };
  saveBtn.onclick = () => {
    if (isSaved()) {
      removeSaved(store, key, savedId); savedId = null;
      status.textContent = t('keep_removed');
    } else {
      const r = addSaved(store, key, { kind, hash: hash(), title: savedTitle, detail });
      if (r) {
        track('plan_kept', { how: 'save', kind });
        savedId = r.id;
        status.textContent = t('keep_saved_msg') + (r.dropped ? ' ' + t('keep_dropped', { max: 12 }) : '');
      } else status.textContent = t('keep_save_failed');
    }
    paintSave();
  };
  app.querySelector('#k-copy').onclick = async () => {
    const url = linkFor(hash());
    track('plan_kept', { how: 'copy', kind });
    try { await navigator.clipboard.writeText(url); status.textContent = t('keep_copied'); }
    catch { status.innerHTML = `${esc(t('keep_copy_manual'))} <input class="keep-url" readonly value="${esc(url)}" aria-label="${esc(t('keep_copy'))}">`; status.querySelector('input').select(); }
  };
  app.querySelector('#k-text').addEventListener('click', () => track('plan_kept', { how: 'text', kind }));
  app.querySelector('#k-email').addEventListener('click', () => track('plan_kept', { how: 'email', kind }));
  sync(); paintSave();
  return sync;
}

// Jump links move focus too (keyboard and screen-reader users land in the section).
function wireJumps() {
  app.querySelectorAll('.jump a').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const target = app.querySelector(a.getAttribute('href'));
    target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  }));
}

function openRecipe(r, { alt, onSwap, missing, justSwapped } = {}) {
  const dlg = app.querySelector('#recipe');
  dlg.querySelector('.dialog-body').innerHTML = `
    <button type="button" class="btn btn-ghost dialog-close" id="close">${esc(t('close'))}</button>
    <p class="eyebrow">${esc(t('recipe'))}</p>
    <h2 id="recipe-title" tabindex="-1">${esc(rTitle(r))}</h2>
    ${justSwapped ? `<p class="swapped-note">${esc(t('in_your_plan'))}</p>` : ''}
    ${r.srv ? `<p class="muted">${esc(t('serves', { n: r.srv }))}</p>` : ''}
    <h3>${esc(t('ingredients'))}</h3>
    <ul>${(r.ingredients || []).map(i => `<li>${esc(ing(i))}${missing?.includes(i) ? ` <span class="need-tag">${esc(t('box_need'))}</span>` : ''}</li>`).join('')}</ul>
    <h3>${esc(t('steps'))}</h3>
    <p>${esc(rSteps(r))}</p>
    ${alt ? `<div class="alt"><p class="eyebrow">${esc(justSwapped ? t('swap_back') : t('another_option'))}</p>
      <p class="alt-title">${esc(rTitle(alt))}</p>
      <button type="button" class="btn ${justSwapped ? 'btn-ghost' : 'btn-primary'}" id="swap">${esc(justSwapped ? t('switch_back') : t('use_instead'))}</button></div>` : ''}`;
  dlg.querySelector('#close').onclick = () => dlg.close();
  dlg.querySelector('#swap')?.addEventListener('click', onSwap);
  dlg.onclick = e => { if (e.target === dlg) dlg.close(); };
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  if (justSwapped) dlg.querySelector('#recipe-title').focus();
}

// ── Food box flow ───────────────────────────────────────────────
function renderBox() {
  current = renderBox;
  setHash('');
  openedSavedId = null;
  app.innerHTML = `
    <form class="step" id="boxform" novalidate>
      <h2 id="q" tabindex="-1">${esc(t('box_title'))}</h2>
      <p class="hint">${esc(t('box_hint'))}</p>
      ${BOX_GROUPS.map(g => `<fieldset class="pref-group"><legend>${esc(t('box_group_' + g.id))}</legend><div class="chips">
        ${g.items.map(id => `<button type="button" class="chip" data-item="${id}" aria-pressed="${box.items.includes(id)}">${esc(fName(id))}</button>`).join('')}
      </div></fieldset>`).join('')}
      <fieldset class="pref-group"><legend>${esc(t('pref_avoid'))}</legend><div class="chips">
        ${['none', 'gluten', 'dairy', 'meat', 'eggs', 'peanuts', 'fish', 'halal', 'kosher', 'diabetic', 'low_sodium'].map(v => `<button type="button" class="chip" data-avoid="${v}"
          aria-pressed="${v === 'none' ? box.avoid.length === 0 : box.avoid.includes(v)}">${esc(t('avoid_' + v))}</button>`).join('')}
      </div><p class="fh avoid-note">${esc(t('avoid_note'))}</p></fieldset>
      <p class="error" id="err" role="alert"></p>
      <div class="nav sticky-go">
        <button type="button" class="btn btn-ghost" id="back">${esc(t('back'))}</button>
        <button type="submit" class="btn btn-primary">${esc(t('box_go'))}</button>
        <span class="muted count" id="count" aria-live="polite">${box.items.length ? esc(t('box_selected', { n: box.items.length })) : ''}</span>
      </div>
    </form>`;
  const f = app.querySelector('#boxform');
  f.querySelectorAll('[data-item]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.item; const at = box.items.indexOf(id);
    at >= 0 ? box.items.splice(at, 1) : box.items.push(id);
    b.setAttribute('aria-pressed', at < 0);
    f.querySelector('#count').textContent = box.items.length ? t('box_selected', { n: box.items.length }) : '';
  }));
  f.querySelectorAll('[data-avoid]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.avoid;
    if (v === 'none') box.avoid = [];
    else { const at = box.avoid.indexOf(v); at >= 0 ? box.avoid.splice(at, 1) : box.avoid.push(v); }
    f.querySelectorAll('[data-avoid]').forEach(x => x.setAttribute('aria-pressed',
      x.dataset.avoid === 'none' ? box.avoid.length === 0 : box.avoid.includes(x.dataset.avoid)));
  }));
  f.querySelector('#back').onclick = renderIntro;
  f.onsubmit = e => {
    e.preventDefault();
    if (!box.items.length) { f.querySelector('#err').textContent = t('err_box'); return; }
    logNext = { built: true };
    renderBoxResults();
  };
  focusTop('#q');
}

async function renderBoxResults() {
  current = () => openFromHash(location.hash, openedSavedId);
  app.innerHTML = `<div class="loading" role="status"><div class="spinner" aria-hidden="true"></div>${esc(t('loading_data'))}</div>`;
  let matches, boxValue = 0;
  try {
    matches = matchBox(await getRecipes(), box.items, { avoid: box.avoid });
    // What the box's items would cost at local prices: the "this box saved you $X" number.
    const priced = await getPrices(regionFor(siteZip));
    boxValue = +box.items.reduce((sum, id) => sum + (priced.prices[id] || 0), 0).toFixed(2);
  }
  catch { app.innerHTML = `<p class="error" role="alert">${esc(t('error_plan'))}</p>`; return; }
  const byId = new Map(matches.map(m => [String(m.recipe.id), m]));

  app.innerHTML = `
    <section class="summary" aria-labelledby="res-title">
      <p class="eyebrow">${esc(t('door_box'))}</p>
      <h2 id="res-title" tabindex="-1">${esc(t('box_res_title'))}</h2>
      <p class="sum-facts">${esc(t('box_res_sub', { n: box.items.length }))}</p>
      ${boxValue > 0 ? `<p class="sum-big box-value">${esc(t('box_value', { value: money(boxValue) }))}</p>` : ''}
      ${residents().length ? `<nav class="jump no-print" aria-label="${esc(t('plan_nav'))}">
        <a href="#help" class="jump-help">${esc(t('jump_help'))} <span>${esc(t('jump_help_sub', { n: residents().length }))} ↓</span></a></nav>` : ''}
    </section>
    ${keepBar()}
    <section class="section" aria-label="${esc(t('box_res_title'))}">
      ${matches.length ? `<ul class="box-list">${matches.map(m => `
        <li class="box-card">
          <span class="box-slot">${esc(t(m.recipe.slot))}</span>
          <button type="button" class="meal-pick box-title" data-id="${m.recipe.id}">${esc(rTitle(m.recipe))}</button>
          <p class="box-line"><b>${esc(t('box_uses'))}${esc(t('label_colon'))}</b> ${esc(m.uses.map(ing).join(t('list_sep')))}</p>
          <p class="box-line ${m.missing.length ? 'need' : 'have-all'}">${m.missing.length
            ? `<b>${esc(t('box_need'))}${esc(t('label_colon'))}</b> ${esc(m.missing.map(ing).join(t('list_sep')))}` : esc(t('box_have_all'))}</p>
        </li>`).join('')}</ul>` : `<p class="box-none">${esc(t('box_none'))}</p>`}
    </section>
    <section class="section cant-use no-print" aria-labelledby="h-cant">
      <div class="section-head"><h2 id="h-cant">${esc(t('cu_title'))}</h2></div>
      <p class="hint">${esc(t('cu_hint'))}</p>
      <ul class="cu-list">${box.items.map(id => `
        <li class="cu-row">
          <label for="cu-${id}">${esc(fName(id))}</label>
          <select id="cu-${id}" data-item="${id}">
            <option value="">${esc(t('cu_none'))}</option>
            ${Object.entries(CU_REASONS).map(([g, rs]) => `<optgroup label="${esc(t('cu_g_' + g))}">${rs.map(r => `<option value="${r}">${esc(t('cu_' + r))}</option>`).join('')}</optgroup>`).join('')}
          </select>
          <span class="cu-ok" aria-live="polite"></span>
        </li>`).join('')}</ul>
    </section>
    ${helpSection()}
    <div class="nav no-print">
      <button type="button" class="btn btn-ghost" id="edit">${esc(t('box_edit'))}</button>
      <button type="button" class="btn btn-ghost" id="print">${esc(t('print'))}</button>
      <button type="button" class="btn-link" id="to-budget">${esc(t('box_to_budget'))}</button>
    </div>
    <dialog id="recipe" aria-labelledby="recipe-title"><div class="dialog-body"></div></dialog>`;

  focusTop('#res-title');
  wireJumps();
  loadSites(siteZip);
  if (logNext?.built) track('box_built', { items: box.items, avoid: box.avoid, meals: matches.length, zip: siteZip, value: boxValue });
  else if (logNext?.reopened) { track('plan_reopened', { source: logNext.reopened, kind: 'box' }); askOutcome('box'); }
  logNext = null;
  // "Can't use this": one report per item per change (Food Plan Goal 4 cultural/medical proxy).
  app.querySelectorAll('.cu-row select').forEach(sel => sel.addEventListener('change', () => {
    const ok = sel.parentElement.querySelector('.cu-ok');
    if (!sel.value) { ok.textContent = ''; return; }
    track('cant_use', { item: sel.dataset.item, reason: sel.value });
    ok.textContent = t('cu_thanks');
  }));
  app.querySelectorAll('.box-title').forEach(b => b.addEventListener('click', () => {
    const m = byId.get(b.dataset.id);
    track('recipe_opened', { recipe: m.recipe.id, flow: 'box' });
    openRecipe(m.recipe, { missing: m.missing });
  }));
  wireKeep({
    title: t('box_res_title'),
    savedTitle: t('saved_box_title'),
    detail: box.items.length <= 3 ? box.items.map(fName).join(', ')
      : t('saved_box_detail', { first: box.items.slice(0, 2).map(fName).join(', '), n: box.items.length - 2 }),
    kind: 'box',
    hash: () => boxHash(packBox(box)),
    text: () => boxText({
      title: `${city.name}${city.place ? ' · ' + city.place : ''}: ${t('box_res_title')}`,
      matches, url: linkFor(boxHash(packBox(box))), titleOf: rTitle, ingOf: ing, labels: { need: t('box_need'), link: t('full_plan_link') },
    }),
  });
  app.querySelector('#edit').onclick = renderBox;
  app.querySelector('#print').onclick = () => window.print();
  app.querySelector('#to-budget').onclick = () => { answers = fresh(); go(0); };
}

// "Did you use this plan?" — asked once when someone comes back to a saved plan or a shared link.
function askOutcome(kind) {
  const summary = app.querySelector('.summary');
  if (!summary) return;
  summary.insertAdjacentHTML('beforebegin', `
    <section class="outcome no-print" aria-labelledby="outcome-q">
      <p id="outcome-q" class="outcome-q">${esc(t('outcome_q'))}</p>
      <div class="outcome-actions">${['yes', 'some', 'no'].map(a => `<button type="button" class="chip" data-answer="${a}">${esc(t('outcome_' + a))}</button>`).join('')}</div>
    </section>`);
  const box = app.querySelector('.outcome');
  box.querySelectorAll('[data-answer]').forEach(b => b.addEventListener('click', () => {
    track('plan_outcome', { answer: b.dataset.answer, kind });
    box.innerHTML = `<p class="outcome-q" role="status">${esc(t('outcome_thanks'))}</p>`;
  }));
}

// One listener for every help / food-site link on any page.
app.addEventListener('click', e => {
  const a = e.target.closest('a[data-track]');
  if (a) track('help_clicked', { target: a.dataset.target, kind: a.dataset.track, action: a.dataset.action });
});

// Print every week, not just the one on screen.
window.addEventListener('beforeprint', () => document.querySelectorAll('.week-panel').forEach(p => { p.dataset.wasHidden = p.hidden; p.hidden = false; }));
window.addEventListener('afterprint', () => document.querySelectorAll('.week-panel').forEach(p => { p.hidden = p.dataset.wasHidden === 'true'; }));

boot();
