// Make It Stretch: client. Renders the intake and the results from /api/plan.
// City identity comes from /api/config; strings come from /i18n/<lang>.js.

import en from './i18n/en.js';

const STRINGS = { en };
let S = en;
const t = (key, vars = {}) => (S[key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => Number(n).toFixed(2);

const app = document.getElementById('app');
let city = null;

// ── State ───────────────────────────────────────────────────────
const answers = {
  budget: null, days: null, people: null, zip: null,
  leftover: 'sometimes', cuisine: [], avoid: [], have: [], stores: [],
};
const STEPS = ['budget', 'days', 'people', 'zip', 'prefs'];
let stepIndex = -1; // -1 = intro

// Preference groups, ordered few → many options (choice architecture, spec §6).
const PREFS = [
  { key: 'leftover', single: true, options: ['yes', 'sometimes', 'no'] },
  { key: 'cuisine', none: 'any', options: ['american', 'latin', 'asian', 'southern', 'mediterranean'] },
  { key: 'avoid', none: 'none', options: ['gluten', 'dairy', 'meat', 'eggs', 'peanuts', 'fish'] },
  { key: 'stores', label: 'store', none: null, options: ['full', 'walmart', 'aldi', 'dollar', 'corner'] },
  { key: 'have', none: 'none', options: ['rice', 'beans', 'oats', 'eggs', 'potatoes', 'bread', 'pasta', 'oil'] },
];

// ── Boot ────────────────────────────────────────────────────────
async function boot() {
  try {
    city = await (await fetch('/api/config' + location.search)).json();
  } catch { city = { name: 'Make It Stretch', languages: ['en'], resources: [] }; }
  const lang = (navigator.language || 'en').slice(0, 2);
  if (city.languages?.includes(lang) && STRINGS[lang]) { S = STRINGS[lang]; document.documentElement.lang = lang; }

  document.getElementById('brand-name').textContent = city.name;
  const place = document.getElementById('brand-place');
  if (city.place) { place.textContent = city.place; place.hidden = false; }
  document.getElementById('disclaimer').textContent = city.disclaimer || '';
  document.title = city.place ? `${city.name} · ${city.place}` : city.name;
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });

  // Keep the city override (?city=) on theme in dev.
  if (location.search) document.querySelector('link[href="/theme.css"]').href = '/theme.css' + location.search;

  renderIntro();
}

// ── Intake ──────────────────────────────────────────────────────
function renderIntro() {
  stepIndex = -1;
  app.innerHTML = `
    <section class="intro">
      ${city.place ? `<p class="eyebrow">${esc(city.place)}</p>` : ''}
      <h1 tabindex="-1">${esc(t('intro_title'))}</h1>
      <p>${esc(t('intro_body'))}</p>
      <button class="btn btn-primary" id="start">${esc(t('intro_cta'))}</button>
    </section>`;
  app.querySelector('#start').onclick = () => go(0);
}

function go(i) {
  stepIndex = i;
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
        ${i > 0 ? `<button type="button" class="btn btn-ghost" id="back">${esc(t('back'))}</button>` : ''}
        <button type="submit" class="btn btn-primary">${esc(i === STEPS.length - 1 ? t('build_plan') : t('continue'))}</button>
        ${name === 'zip' ? `<button type="button" class="btn-link" id="skip">${esc(t('zip_skip'))}</button>` : ''}
      </div>
    </form>`;
  const form = app.querySelector('#step');
  STEP_WIRE[name]?.(form);
  form.onsubmit = e => {
    e.preventDefault();
    const err = STEP_SAVE[name](form);
    if (err) { form.querySelector('#err').textContent = t(err); return; }
    i === STEPS.length - 1 ? buildPlan() : go(i + 1);
  };
  form.querySelector('#back')?.addEventListener('click', () => go(i - 1));
  form.querySelector('#skip')?.addEventListener('click', () => { answers.zip = null; go(i + 1); });
  (form.querySelector('#budget, #zip') || form.querySelector('h2')).focus();
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
      const label = g.label || g.key;
      const opts = [...(g.none ? [g.none] : []), ...g.options];
      return `<fieldset class="pref-group"><legend>${esc(t('pref_' + label))}</legend><div class="chips">
        ${opts.map(v => {
          const on = g.single ? answers[g.key] === v : (v === g.none ? answers[g.key].length === 0 : answers[g.key].includes(v));
          return `<button type="button" class="chip" data-pref="${g.key}" data-value="${v}" aria-pressed="${on}">${esc(t(label + '_' + v))}</button>`;
        }).join('')}
      </div></fieldset>`;
    }).join('')}`,
};

function wireOptions(form, group, onPick) {
  form.querySelectorAll(`[data-group="${group}"]`).forEach(b => b.addEventListener('click', () => {
    form.querySelectorAll(`[data-group="${group}"]`).forEach(x => x.setAttribute('aria-pressed', x === b));
    onPick(Number(b.dataset.value));
  }));
}

const STEP_WIRE = {
  days: f => wireOptions(f, 'days', v => { answers.days = v; }),
  people: f => {
    const exact = f.querySelector('#people-exact');
    wireOptions(f, 'people', v => { answers.people = v; exact.value = ''; });
    exact.addEventListener('input', () => f.querySelectorAll('[data-group="people"]').forEach(x => x.setAttribute('aria-pressed', 'false')));
  },
  prefs: f => f.querySelectorAll('[data-pref]').forEach(b => b.addEventListener('click', () => {
    const g = PREFS.find(p => p.key === b.dataset.pref);
    const v = b.dataset.value;
    if (g.single) answers[g.key] = v;
    else if (v === g.none) answers[g.key] = [];
    else {
      const arr = answers[g.key];
      const at = arr.indexOf(v);
      at >= 0 ? arr.splice(at, 1) : arr.push(v);
    }
    // re-sync pressed states for this group
    f.querySelectorAll(`[data-pref="${g.key}"]`).forEach(x => {
      const xv = x.dataset.value;
      const on = g.single ? answers[g.key] === xv : (xv === g.none ? answers[g.key].length === 0 : answers[g.key].includes(xv));
      x.setAttribute('aria-pressed', on);
    });
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

// ── Plan ────────────────────────────────────────────────────────
async function buildPlan() {
  app.innerHTML = `<div class="loading" role="status"><div class="spinner" aria-hidden="true"></div>${esc(t('building'))}</div>`;
  try {
    const r = await fetch('/api/plan' + location.search, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(answers),
    });
    if (!r.ok) throw new Error(r.status);
    renderResults(await r.json());
  } catch {
    app.innerHTML = `<p class="error" role="alert">${esc(t('error_plan'))}</p>
      <button class="btn btn-primary" id="retry">${esc(t('build_plan'))}</button>`;
    app.querySelector('#retry').onclick = buildPlan;
  }
}

function renderResults(plan) {
  const { input, summary: s } = plan;
  const recipes = new Map();
  const peopleLabel = input.people === 1 ? t('person') : t('people', { n: input.people });
  const calNote = s.calPct >= 80 ? t('cal_ok') : s.calPct >= 60 ? t('cal_low') : t('cal_tight');

  const mealBtn = r => { recipes.set(String(r.id), r); return `<button type="button" class="meal-pick" data-recipe="${r.id}">${esc(r.title)}</button>`; };

  const weeksHtml = plan.weeks.map((week, wi) => `
    <details class="week" ${wi === 0 ? 'open' : ''}>
      <summary>${esc(t('week', { n: wi + 1 }))}</summary>
      ${week.map(d => d.leftover
        ? `<div class="day"><div class="day-name">${esc(d.dayName)}</div><p class="leftover">${esc(t('leftovers'))}</p></div>`
        : `<div class="day"><div class="day-name">${esc(d.dayName)}</div>
            ${['breakfast', 'lunch', 'dinner'].map(slot => d[slot].length ? `
              <div class="meal"><div class="meal-slot">${esc(t(slot))}</div>
                <div>${mealBtn(d[slot][0])}${d[slot][1] ? `<div class="meal-alt">${esc(t('or_try'))} ${mealBtn(d[slot][1])}</div>` : ''}</div>
              </div>` : '').join('')}
          </div>`).join('')}
    </details>`).join('');

  const shopHtml = plan.shopping.map(g => `
    <h3 class="shop-cat">${esc(t('cat_' + g.cat))}</h3>
    ${g.items.map(i => `
      <div class="shop-item">
        <input type="checkbox" id="ck-${i.id}" aria-describedby="note-${i.id}">
        <label for="ck-${i.id}">
          <span class="shop-name">${esc(i.name)} <span class="shop-qty">×${i.qty}</span></span>
          <span class="tier tier-${i.tier}">${esc(t('tier_' + i.tier))}</span>
          <div class="shop-note" id="note-${i.id}">${esc(i.note)}</div>
          ${i.tip ? `<div class="shop-tip">${esc(i.tip)}</div>` : ''}
        </label>
        <span class="shop-price">$${money(i.subtotal)}</span>
      </div>`).join('')}`).join('');

  const residents = (city.resources || []).filter(r => r.audience !== 'organizations');
  const orgs = (city.resources || []).filter(r => r.audience === 'organizations');
  const helpCard = r => `
    <article class="help-card ${r.audience === 'organizations' ? 'org' : ''}">
      <h3>${esc(r.name)}</h3><p>${esc(r.description)}</p>
      <div class="help-actions">
        ${r.phone ? `<a href="tel:${esc(r.phone)}">${esc(t('call', { phone: r.phone }))}</a>` : ''}
        ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(t('visit'))}<span class="sr-only"> (${esc(r.name)})</span></a>` : ''}
      </div>
    </article>`;

  app.innerHTML = `
    <section class="summary" aria-labelledby="res-title">
      <p class="eyebrow">${esc(t('res_eyebrow'))}</p>
      <h2 id="res-title" tabindex="-1">${esc(t('res_title', { days: input.days }))}</h2>
      <div class="stats">
        <div class="stat"><b>$${Math.round(input.budget)}</b><span>${esc(t('stat_budget'))}</span></div>
        <div class="stat"><b>${input.days}</b><span>${esc(t('stat_days'))}</span></div>
        <div class="stat"><b>${input.people}</b><span>${esc(t('stat_people'))}</span></div>
        <div class="stat"><b>$${money(s.pppd)}</b><span>${esc(t('stat_pppd'))}</span></div>
        <div class="stat"><b>$${money(s.ppmeal)}</b><span>${esc(t('stat_meal'))}</span></div>
      </div>
      <p>${esc(t('res_summary', { budget: money(input.budget), people: peopleLabel, days: input.days, pppd: money(s.pppd), ppmeal: money(s.ppmeal) }))}${s.remaining > 1 ? esc(t('res_left', { remaining: money(s.remaining) })) : ''}</p>
      <p class="cal-note">${esc(calNote)}</p>
    </section>

    <section class="section" aria-labelledby="h-list">
      <div class="section-head"><h2 id="h-list">${esc(t('sec_list'))}</h2>
        <button type="button" class="btn btn-ghost no-print" id="print">${esc(t('print'))}</button></div>
      ${shopHtml}
      <div class="shop-total"><span>${esc(t('total'))}</span><span>$${money(s.spent)}</span></div>
      <p class="price-note">${esc(t('price_note', { label: plan.prices.label }))}</p>
    </section>

    <section class="section" aria-labelledby="h-plan">
      <div class="section-head"><h2 id="h-plan">${esc(t('sec_plan'))}</h2></div>
      ${weeksHtml}
    </section>

    ${residents.length ? `<section class="section" aria-labelledby="h-help">
      <div class="section-head"><h2 id="h-help">${esc(t('sec_help'))}</h2></div>
      <div class="help-list">${residents.map(helpCard).join('')}</div>
      ${orgs.length ? `<h3 style="margin-top:24px">${esc(t('sec_help_orgs'))}</h3><div class="help-list">${orgs.map(helpCard).join('')}</div>` : ''}
    </section>` : ''}

    <div class="nav no-print"><button type="button" class="btn btn-ghost" id="restart">${esc(t('start_over'))}</button></div>

    <dialog id="recipe" aria-labelledby="recipe-title"><div class="dialog-body"></div></dialog>`;

  app.querySelector('#res-title').focus();
  app.querySelector('#print').onclick = () => window.print();
  app.querySelector('#restart').onclick = () => { Object.assign(answers, { budget: null, days: null, people: null, zip: null }); renderIntro(); };
  app.querySelectorAll('[data-recipe]').forEach(b => b.addEventListener('click', () => openRecipe(recipes.get(b.dataset.recipe))));
}

function openRecipe(r) {
  const dlg = app.querySelector('#recipe');
  dlg.querySelector('.dialog-body').innerHTML = `
    <button type="button" class="btn btn-ghost dialog-close" id="close">${esc(t('close'))}</button>
    <p class="eyebrow">${esc(t('recipe'))}</p>
    <h2 id="recipe-title">${esc(r.title)}</h2>
    ${r.srv ? `<p class="muted">${esc(t('serves', { n: r.srv }))}</p>` : ''}
    <h3>${esc(t('ingredients'))}</h3>
    <ul>${(r.ingredients || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
    <h3>${esc(t('steps'))}</h3>
    <p>${esc(r.instructions)}</p>`;
  dlg.querySelector('#close').onclick = () => dlg.close();
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }, { once: true });
  dlg.showModal();
}

// Print the whole plan, not just the open week.
window.addEventListener('beforeprint', () => document.querySelectorAll('details.week').forEach(d => { d.dataset.wasOpen = d.open; d.open = true; }));
window.addEventListener('afterprint', () => document.querySelectorAll('details.week').forEach(d => { d.open = d.dataset.wasOpen === 'true'; }));

boot();
