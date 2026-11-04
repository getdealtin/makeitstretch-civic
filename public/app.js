// Make It Stretch: client.
// The shared engine runs right here in the browser (served from /engine), so the
// blurred preview updates instantly and a plan still builds if the connection drops
// after the page loads. City identity comes from /api/config; strings from /i18n.

import en from './i18n/en.js';
import {
  buildCart, matchRecipes, planWeeks, groupShoppingList, zipToInfo,
  matchBox, BOX_GROUPS, foodLabel,
} from '/engine/index.js';

const STRINGS = { en };
let S = en;
const t = (key, vars = {}) => (S[key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
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
  { key: 'avoid', none: 'none', options: ['gluten', 'dairy', 'meat', 'eggs', 'peanuts', 'fish'] },
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
  const lang = (navigator.language || 'en').slice(0, 2);
  if (city.languages?.includes(lang) && STRINGS[lang]) { S = STRINGS[lang]; document.documentElement.lang = lang; }

  document.getElementById('brand-name').textContent = city.name;
  const place = document.getElementById('brand-place');
  if (city.place) { place.textContent = city.place; place.hidden = false; }
  document.getElementById('disclaimer').textContent = city.disclaimer || '';
  document.title = city.place ? `${city.name} · ${city.place}` : city.name;
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  if (qs) document.querySelector('link[href="/theme.css"]').href = '/theme.css' + qs;

  getRecipes(); getPrices(null); // warm up in the background
  renderIntro();
}

function focusTop(sel) {
  const el = app.querySelector(sel);
  if (el) { el.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }
}

// ── Start screen: two doors ─────────────────────────────────────
function renderIntro() {
  app.innerHTML = `
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
}

// ── Budget flow ─────────────────────────────────────────────────
function go(i) {
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
    i === STEPS.length - 1 ? showResults() : go(i + 1);
  };
  form.querySelector('#back').addEventListener('click', () => (i === 0 ? renderIntro() : go(i - 1)));
  form.querySelector('#skip')?.addEventListener('click', () => { answers.zip = null; go(i + 1); });
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
      ${day ? ['breakfast', 'dinner'].map(s => day[s][0] ? `<p class="preview-meal">${esc(t(s))}: ${esc(day[s][0].title)}</p>` : '').join('') : ''}
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
      </div></fieldset>`;
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
async function showResults() {
  app.innerHTML = `<div class="loading" role="status"><div class="spinner" aria-hidden="true"></div>${esc(t('building'))}</div>`;
  try { renderResults(await computePlan(answers)); }
  catch {
    app.innerHTML = `<p class="error" role="alert">${esc(t('error_plan'))}</p>
      <button class="btn btn-primary" id="retry">${esc(t('build_plan'))}</button>`;
    app.querySelector('#retry').onclick = showResults;
  }
}

const residents = () => (city.resources || []).filter(r => r.audience !== 'organizations');
const orgs = () => (city.resources || []).filter(r => r.audience === 'organizations');

function helpSection() {
  const card = r => `
    <article class="help-card ${r.audience === 'organizations' ? 'org' : ''}">
      <h3>${esc(r.name)}</h3><p>${esc(r.description)}</p>
      <div class="help-actions">
        ${r.phone ? `<a href="tel:${esc(r.phone)}">${esc(t('call', { phone: r.phone }))}</a>` : ''}
        ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(t('visit'))}<span class="sr-only"> (${esc(r.name)})</span></a>` : ''}
      </div>
    </article>`;
  if (!residents().length) return '';
  return `<section class="section" id="help" aria-labelledby="h-help" tabindex="-1">
    <div class="section-head"><h2 id="h-help">${esc(t('sec_help'))}</h2></div>
    <div class="help-list">${residents().map(card).join('')}</div>
    ${orgs().length ? `<h3 class="orgs-head">${esc(t('sec_help_orgs'))}</h3><div class="help-list">${orgs().map(card).join('')}</div>` : ''}
  </section>`;
}

function renderResults(plan) {
  const { input, result: s, shopping, weeks, priced } = plan;
  const peopleLabel = input.people === 1 ? t('person') : t('people', { n: input.people });
  const calNote = s.calPct >= 80 ? t('cal_ok') : s.calPct >= 60 ? t('cal_low') : t('cal_tight');
  const nItems = s.cart.length;

  // Which option is chosen per meal slot: key "w-d-slot" → index (0 = main pick, 1 = alternate).
  const choice = {};
  const recipes = new Map();
  weeks.flat().forEach(d => { if (!d.leftover) ['breakfast', 'lunch', 'dinner'].forEach(sl => d[sl].forEach(r => recipes.set(String(r.id), r))); });

  const listHtml = shopping.map(g => `
    <div class="cat-head"><h3 class="shop-cat">${esc(t('cat_' + g.cat))}</h3>
      <span class="cat-sub">$${money(g.items.reduce((a, i) => a + i.subtotal, 0))}</span></div>
    <ul class="rows">${g.items.map(i => {
      const name = foodLabel(i.id);
      return `<li class="row">
        <input type="checkbox" id="ck-${i.id}">
        <label for="ck-${i.id}">${esc(name)} <span class="qty">×${i.qty}</span></label>
        <button type="button" class="info" aria-expanded="false" aria-controls="more-${i.id}"
          aria-label="${esc(t('more_about', { item: name }))}">ⓘ</button>
        <span class="price">$${money(i.subtotal)}</span>
        <div class="more" id="more-${i.id}" hidden><span class="size">${esc(i.name)}</span> ${esc(i.note)}${i.tip ? `<div class="shop-tip">${esc(i.tip)}</div>` : ''}</div>
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
                <button type="button" class="meal-pick" data-key="${wi}-${di}-${sl}">${esc(d[sl][0].title)}</button></div>` : '').join('')}
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

    <section class="section" id="list" aria-labelledby="h-list" tabindex="-1">
      <div class="section-head"><h2 id="h-list">${esc(t('sec_list'))}</h2>
        <span class="head-hint no-print">${esc(t('tips_hint'))}</span></div>
      ${listHtml}
      <div class="shop-total"><span>${esc(t('total'))}</span><span>$${money(s.spent)}</span></div>
      <p class="price-note">${esc(t('price_note', { label: priced.label }))}</p>
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
    openRecipe(opts[ci], opts[1 - ci] ? {
      justSwapped,
      alt: opts[1 - ci],
      onSwap: () => {
        choice[b.dataset.key] = 1 - ci;
        b.textContent = opts[1 - ci].title;
        app.querySelector('#announce').textContent = t('swapped', { title: opts[1 - ci].title });
        showMeal(b, true);
      },
    } : {});
  };
  app.querySelectorAll('.meal-pick').forEach(b => b.addEventListener('click', () => showMeal(b)));

  app.querySelector('#print').onclick = () => window.print();
  app.querySelector('#restart').onclick = renderIntro;
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
    <h2 id="recipe-title" tabindex="-1">${esc(r.title)}</h2>
    ${justSwapped ? `<p class="swapped-note">${esc(t('in_your_plan'))}</p>` : ''}
    ${r.srv ? `<p class="muted">${esc(t('serves', { n: r.srv }))}</p>` : ''}
    <h3>${esc(t('ingredients'))}</h3>
    <ul>${(r.ingredients || []).map(i => `<li>${esc(i)}${missing?.includes(i) ? ` <span class="need-tag">${esc(t('box_need'))}</span>` : ''}</li>`).join('')}</ul>
    <h3>${esc(t('steps'))}</h3>
    <p>${esc(r.instructions)}</p>
    ${alt ? `<div class="alt"><p class="eyebrow">${esc(justSwapped ? t('swap_back') : t('another_option'))}</p>
      <p class="alt-title">${esc(alt.title)}</p>
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
  app.innerHTML = `
    <form class="step" id="boxform" novalidate>
      <h2 id="q" tabindex="-1">${esc(t('box_title'))}</h2>
      <p class="hint">${esc(t('box_hint'))}</p>
      ${BOX_GROUPS.map(g => `<fieldset class="pref-group"><legend>${esc(t('box_group_' + g.id))}</legend><div class="chips">
        ${g.items.map(id => `<button type="button" class="chip" data-item="${id}" aria-pressed="${box.items.includes(id)}">${esc(foodLabel(id))}</button>`).join('')}
      </div></fieldset>`).join('')}
      <fieldset class="pref-group"><legend>${esc(t('pref_avoid'))}</legend><div class="chips">
        ${['none', 'gluten', 'dairy', 'meat', 'eggs', 'peanuts', 'fish'].map(v => `<button type="button" class="chip" data-avoid="${v}"
          aria-pressed="${v === 'none' ? box.avoid.length === 0 : box.avoid.includes(v)}">${esc(t('avoid_' + v))}</button>`).join('')}
      </div></fieldset>
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
    renderBoxResults();
  };
  focusTop('#q');
}

async function renderBoxResults() {
  app.innerHTML = `<div class="loading" role="status"><div class="spinner" aria-hidden="true"></div>${esc(t('loading_data'))}</div>`;
  let matches;
  try { matches = matchBox(await getRecipes(), box.items, { avoid: box.avoid }); }
  catch { app.innerHTML = `<p class="error" role="alert">${esc(t('error_plan'))}</p>`; return; }
  const byId = new Map(matches.map(m => [String(m.recipe.id), m]));

  app.innerHTML = `
    <section class="summary" aria-labelledby="res-title">
      <p class="eyebrow">${esc(t('door_box'))}</p>
      <h2 id="res-title" tabindex="-1">${esc(t('box_res_title'))}</h2>
      <p class="sum-facts">${esc(t('box_res_sub', { n: box.items.length }))}</p>
      ${residents().length ? `<nav class="jump no-print" aria-label="${esc(t('plan_nav'))}">
        <a href="#help" class="jump-help">${esc(t('jump_help'))} <span>${esc(t('jump_help_sub', { n: residents().length }))} ↓</span></a></nav>` : ''}
    </section>
    <section class="section" aria-label="${esc(t('box_res_title'))}">
      ${matches.length ? `<ul class="box-list">${matches.map(m => `
        <li class="box-card">
          <span class="box-slot">${esc(t(m.recipe.slot))}</span>
          <button type="button" class="meal-pick box-title" data-id="${m.recipe.id}">${esc(m.recipe.title)}</button>
          <p class="box-line"><b>${esc(t('box_uses'))}:</b> ${esc(m.uses.join(', '))}</p>
          <p class="box-line ${m.missing.length ? 'need' : 'have-all'}">${m.missing.length
            ? `<b>${esc(t('box_need'))}:</b> ${esc(m.missing.join(', '))}` : esc(t('box_have_all'))}</p>
        </li>`).join('')}</ul>` : `<p class="box-none">${esc(t('box_none'))}</p>`}
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
  app.querySelectorAll('.box-title').forEach(b => b.addEventListener('click', () => {
    const m = byId.get(b.dataset.id); openRecipe(m.recipe, { missing: m.missing });
  }));
  app.querySelector('#edit').onclick = renderBox;
  app.querySelector('#print').onclick = () => window.print();
  app.querySelector('#to-budget').onclick = () => { answers = fresh(); go(0); };
}

// Print every week, not just the one on screen.
window.addEventListener('beforeprint', () => document.querySelectorAll('.week-panel').forEach(p => { p.dataset.wasHidden = p.hidden; p.hidden = false; }));
window.addEventListener('afterprint', () => document.querySelectorAll('.week-panel').forEach(p => { p.hidden = p.dataset.wasHidden === 'true'; }));

boot();
