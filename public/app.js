// Make It Stretch: client.
// The shared engine runs right here in the browser (served from /engine), so the
// blurred preview updates instantly and a plan still builds if the connection drops
// after the page loads. City identity comes from /api/config; strings from /i18n.

import en from './i18n/en.js';
import { ART } from './art.js';
import { LANGS, pickLang, rememberLang, loadLang } from './i18n/index.js';
import {
  planMeals, rebuildList, LEAVE_OUT, DIETS, DIET_NOTE_KEYS, groupShoppingList, zipToInfo,
  matchBox, BOX_GROUPS, foodLabel, findBoxFood, cleanFoodWord, INGREDIENT_FOODS, PANTRY_BASICS,
  twistsFor, TWIST_REPEATS,
} from '/engine/index.js';
import {
  packPlan, packBox, planHash, boxHash, readHash, planText, boxText, smsHref, mailHref, store,
  savedList, addSaved, updateSaved, removeSaved, findSaved,
} from './keep.js';

// ── Language ────────────────────────────────────────────────────
let S = en;   // UI strings for the current language
let D = {};   // data translations: foods, tips, ingredient words, recipes
let lang = 'en';
/** Escape, then show *word* as the accent word (headlines). */
const accent = s => esc(s).replace(/\*([^*]+)\*/g, '<em class="accent">$1</em>');
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
// NHLBI recipes (ids 1001+) come word for word, line by line; translations line up with the English.
const rTr = r => (Array.isArray(r.lines) && D.recipes?.[r.id]?.lines?.length === r.lines.length ? D.recipes[r.id] : null);
const NIH_BOOK = { latino: 'nih_book_latino', aa: 'nih_book_aa' };
/** Ingredients, steps and credit of an NHLBI recipe. chip(line) says whether to tag it "You'll also need". */
function nihRecipeHtml(r, chip) {
  const tr = rTr(r);
  const line = (l, i) => esc(tr ? tr.lines[i] : l.t);
  const note = tr ? tr.note : r.note;
  const steps = (tr ? tr.steps : r.steps) || [];
  const extra = (tr ? tr.extra : r.extra) || [];
  const credit = r.source && NIH_BOOK[r.source.book] ? t('nih_credit', { book: t(NIH_BOOK[r.source.book]), page: tr?.official ? tr.page || r.source.page + 1 : r.source.page }) : '';
  const trNote = tr ? (tr.official ? t('nih_official_es') : t('nih_our_translation')) : '';
  return `${note ? `<p class="recipe-note">${esc(note)}</p>` : ''}
    <h3>${esc(t('ingredients'))}</h3>
    <ul class="nih-lines">${r.lines.map((l, i) => l.h ? `<li class="ing-head">${line(l, i)}</li>`
      : `<li>${line(l, i)}${chip(l) ? ` <span class="need-tag">${esc(t('box_need'))}</span>` : ''}</li>`).join('')}</ul>
    <h3>${esc(t('steps'))}</h3>
    <ol class="nih-steps">${steps.map(st => `<li>${esc(st)}</li>`).join('')}</ol>
    ${extra.map(x => `<p>${x.h ? `<b>${esc(x.h)}</b> ` : ''}${esc(x.t)}</p>`).join('')}
    <p class="recipe-credit">${esc(credit)}${trNote ? ` ${esc(trNote)}` : ''}</p>`;
}
// "Ways to change it up" (draft, Nov 8): for a meal that comes up TWIST_REPEATS+ times, a few twists using
// only foods already on the list (engine/twists.js). Text is translated in D.twists.
const foodsOf = (r, onList) => (r.uses ? r.uses.map(u => u.id)
  : (r.ingredients || []).flatMap(w => (INGREDIENT_FOODS[w] || []).filter(id => onList.includes(id)).slice(0, 1)));
const twistText = tw => D.twists?.[tw.id] || tw.text;
const twistsHtml = (r, times, onList) => {
  if (times < TWIST_REPEATS) return '';
  const tws = twistsFor(foodsOf(r, onList), onList);
  return tws.length ? `<div class="twists"><h3>${esc(t('twists_title'))}</h3>
    <p class="muted">${esc(t('twists_hint', { n: times }))}</p>
    <ul>${tws.map(tw => `<li>${esc(twistText(tw))}</li>`).join('')}</ul></div>` : '';
};
/** Kitchen basics (spices, condiments, broth…) are tagged; salt, water and section headings are not. */
const nihChip = missing => l => !!l.p || (!!l.f && (missing || []).some(w => (INGREDIENT_FOODS[w] || []).some(id => l.f.includes(id))));
const cityText = key => city?.i18n?.[lang]?.[key] || city?.[key];
const resText = (r, key) => city?.i18n?.[lang]?.resources?.[r.id]?.[key] || r[key];

// ── Anonymous activity (Phase 4; see /privacy) ──────────────────
// A random token for this visit only: kept in memory, gone when the tab closes, never stored on the device.
const SESSION = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
// "Don't count this browser" (set from /admin): test visits are never sent.
const TESTING = (() => { try { return localStorage.getItem('mis:test') === '1'; } catch { return false; } })();
// Source tag from links and printed QR codes (?src=library); the server keeps only the city's allowed tags.
const SRC = new URLSearchParams(location.search).get('src');
const PACKET = location.pathname === '/packet'; // library/pantry staff printing packets
function track(event, data = {}) {
  if (TESTING || PACKET) return;
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
  list: 'full', // plans open on full variety; "Show a shorter list" repeats fewer different meals
});
let answers = fresh();
let box = { items: [], avoid: [], other: [] };
const STEPS = ['budget', 'days', 'people', 'zip', 'prefs'];

// Preference groups, fewest → most options (choice architecture, spec §6).
const PREFS = [
  { key: 'leftover', single: true, options: ['yes', 'sometimes', 'no'] },
  { key: 'store', single: true, options: ['full', 'dollar', 'corner'] },
  { key: 'cuisine', none: 'any', options: ['american', 'latin', 'asian', 'southern', 'mediterranean'] },
  // Foods to leave out and diets share answers.avoid; "None" clears only the foods, not the diets.
  { key: 'avoid', none: 'none', options: LEAVE_OUT },
  { key: 'avoid', legend: 'pref_diet', hint: 'diet_hint', options: DIETS },
  { key: 'have', none: 'none', options: ['rice', 'beans', 'oats', 'eggs', 'potatoes', 'bread', 'pasta', 'oil'] },
];

const engineInput = a => ({
  budget: a.budget, days: a.days || 7, people: a.people || 1,
  cuisine: a.cuisine, avoid: a.avoid, have: a.have,
  stores: a.store && a.store !== 'full' ? [a.store] : [], leftover: a.leftover,
  menu: a.list === 'short' ? 'short' : 'full',
});

/** Run the meal planner in the browser: meals first, then the list from those meals (engine/meals.js). */
async function computePlan(a) {
  const [recipes, priced] = await Promise.all([getRecipes(), getPrices(regionFor(a.zip))]);
  const input = engineInput(a);
  const r = planMeals(input, priced.prices, recipes);
  const other = planMeals({ ...input, menu: input.menu === 'short' ? 'full' : 'short' }, priced.prices, recipes);
  const [full, short] = input.menu === 'short' ? [other, r] : [r, other];
  const listInfo = short.state && short.cart.length < full.cart.length
    ? { mode: input.menu, short: short.cart.length, full: full.cart.length } : null;
  return { input, result: r, weeks: r.weeks, shopping: groupShoppingList(r.cart), priced, state: r.state, listInfo };
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
  document.title = baseTitle = city.place ? `${city.name} · ${city.place}` : city.name;
  if (qs) document.querySelector('link[href="/theme.css"]').href = '/theme.css' + qs;

  getRecipes(); getPrices(null); // warm up in the background
  track('page_view', SRC && (city.sources || []).includes(SRC) ? { src: SRC } : {});
  if (!openFromHash(location.hash, null, 'link')) (PACKET ? renderPacket() : renderIntro());
  // A different plan link opened in this same tab only changes the #part: no reload happens.
  // (Our own updates use replaceState, which doesn't fire this.)
  window.addEventListener('hashchange', () => {
    if (hubSkipHash) { hubSkipHash = false; return; } // our own card navigation, not a new link
    if (!openFromHash(location.hash, null, 'link')) renderIntro();
  });
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
// liveHash: the plan as it is now (ticks, swaps). Going back from a card restores it, so nothing is lost.
let liveHash = '';
let hubSkipHash = false;
const setHash = h => { liveHash = h; history.replaceState(history.state, '', location.pathname + qs + h); };
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

// Each screen names itself in the browser tab, so screen readers announce where you are (WCAG 2.4.2).
let baseTitle = document.title;
function screenTitle(heading) {
  const step = app.querySelector('.progress-label')?.textContent;
  document.title = [step, heading?.textContent.trim(), baseTitle].filter(Boolean).join(' · ');
}
function focusTop(sel) {
  const el = app.querySelector(sel);
  if (el) { el.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); screenTitle(el); }
}

// ── Start screen: two doors ─────────────────────────────────────
function renderIntro() {
  if (PACKET) return renderPacket();
  current = renderIntro;
  printFill = null;
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
    <section class="hero bleed" aria-labelledby="intro-title">
      <div class="hero-text">
        <p class="pill">${esc(t('hero_eyebrow'))}</p>
        <h1 tabindex="-1" id="intro-title">${accent(t('intro_title'))}</h1>
        <p class="hero-blurb">${esc(t('intro_body'))}</p>
        <div class="door-cards">
          <button class="door-card dc-budget" id="door-budget">
            <span class="dc-art" aria-hidden="true">${ART.coins}</span>
            <span class="dc-text"><b>${esc(t('door_budget'))}</b><span class="dc-sub">${esc(t('door_budget_sub'))}</span><span class="dc-go" aria-hidden="true">${esc(t('door_budget_go'))}</span></span>
          </button>
          <button class="door-card dc-box" id="door-box">
            <span class="dc-art" aria-hidden="true">${ART.box}</span>
            <span class="dc-text"><b>${esc(t('door_box'))}</b><span class="dc-sub">${esc(t('door_box_sub'))}</span><span class="dc-go" aria-hidden="true">${esc(t('band_box_btn'))}</span></span>
          </button>
        </div>
      </div>
      <div class="collage" aria-hidden="true">
        <div class="tile t1">${ART.bag}<span class="tag">${esc(t('tag_list'))}</span></div>
        <div class="tile t2">${ART.pot}<span class="tag">${esc(t('tag_meals'))}</span></div>
        <div class="tile t3">${ART.pin}<span class="tag">${esc(t('tag_near'))}</span></div>
        <span class="spark s1">${ART.sparkle}</span><span class="spark s2">${ART.sparkle}</span><span class="spark s3">${ART.sparkle}</span>
      </div>
    </section>
    <section class="how bleed" aria-labelledby="how-title">
      <h2 id="how-title">${accent(t('how_title'))}</h2>
      <ol class="how-grid">
        ${[['coins', 1], ['list', 2], ['pot', 3], ['pin', 4]].map(([art, n]) => `<li>
          <div class="how-art" aria-hidden="true">${ART[art]}</div>
          <h3>${esc(t('how_' + n + '_t'))}</h3>
          <p>${esc(t('how_' + n))}</p>
        </li>`).join('')}
      </ol>
    </section>
    <section class="band bleed-full" aria-labelledby="band-title">
      <div class="band-inner">
        <div>
          <p class="pill">${esc(t('band_eyebrow'))}</p>
          <h2 id="band-title">${accent(t('band_title'))}</h2>
          <p>${esc(t('band_body'))}</p>
          <ul class="promises"><li>${esc(t('band_p1'))}</li><li>${esc(t('band_p2'))}</li><li>${esc(t('band_p3'))}</li></ul>
        </div>
        <div class="band-deco" aria-hidden="true">${ART.pin}</div>
      </div>
    </section>`;
  app.querySelector('#door-budget').onclick = () => { answers = fresh(); go(0); };
  app.querySelector('#door-box').onclick = () => { box = { items: [], avoid: [], other: [] }; renderBox(); };
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

// ── Library / pantry packet (/packet) ───────────────────────────
// Staff pick a household and a weekly budget, then print a packet in the language chosen at the top.
let packet = { people: 2, budget: 60, days: 7 };
function renderPacket() {
  current = renderPacket;
  printFill = null;
  setHash('');
  const chips = (group, vals, label) => vals.map(v => `<button type="button" class="chip" data-p="${group}" data-v="${v}" aria-pressed="${packet[group] === v}">${esc(label(v))}</button>`).join('');
  app.innerHTML = `
    <form class="step packet" id="packet" novalidate>
      <p class="pill">${esc(t('packet_eyebrow'))}</p>
      <h1 id="q" class="q-head" tabindex="-1">${esc(t('packet_title'))}</h1>
      <p class="hint">${esc(t('packet_intro'))}</p>
      <fieldset class="pref-group"><legend>${esc(t('packet_people'))}</legend><div class="chips">${chips('people', [1, 2, 3, 4, 5, 6], n => n === 1 ? t('person') : t('people', { n }))}</div></fieldset>
      <fieldset class="pref-group"><legend>${esc(t('packet_days'))}</legend><div class="chips">${chips('days', [7, 14], n => n === 7 ? t('days_week') : t('days_two_short'))}</div></fieldset>
      <label class="fl" for="pk-budget">${esc(t('packet_budget'))}</label>
      <div class="money"><span aria-hidden="true">$</span><input id="pk-budget" class="field" inputmode="decimal" autocomplete="off" value="${packet.budget}"></div>
      <p class="fh">${esc(t('packet_budget_hint'))}</p>
      <p class="fh">${esc(t('packet_lang'))}</p>
      <p class="error" id="err" role="alert"></p>
      <div class="nav"><button type="submit" class="btn btn-primary">${esc(t('packet_go'))}</button></div>
    </form>`;
  const f = app.querySelector('#packet');
  f.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
    packet[b.dataset.p] = Number(b.dataset.v);
    f.querySelectorAll(`[data-p="${b.dataset.p}"]`).forEach(x => x.setAttribute('aria-pressed', x === b));
  }));
  f.onsubmit = e => {
    e.preventDefault();
    const v = parseFloat(f.querySelector('#pk-budget').value);
    if (!(v >= 1 && v <= 9999)) { f.querySelector('#err').textContent = t('err_budget'); return; }
    packet.budget = Math.round(v * 100) / 100;
    answers = { ...fresh(), budget: packet.budget * (packet.days / 7), days: packet.days, people: packet.people };
    showResults();
  };
  focusTop('#q');
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
  // Typing steps put the cursor in the box; tap steps focus the question.
  (form.querySelector('#budget, #zip') || form.querySelector('#q')).focus();
  screenTitle(form.querySelector('#q'));
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
    <h1 id="q" class="q-head" tabindex="-1">${esc(t('q_budget'))}</h1>
    <p class="hint" id="h">${esc(t('q_budget_hint'))}</p>
    <div class="money"><span aria-hidden="true">$</span>
      <input id="budget" type="number" inputmode="decimal" min="1" max="9999" step="any" placeholder="0"
        aria-labelledby="q" aria-describedby="h" value="${answers.budget ?? ''}"></div>`,

  days: () => `
    <h1 id="q" class="q-head" tabindex="-1">${esc(t('q_days'))}</h1>
    <div class="options" role="group" aria-labelledby="q">
      ${[['few', 4], ['week', 7], ['two', 14], ['month', 30]].map(([k, d]) =>
        optionBtn('days', d, t('days_' + k), t('days_' + k + '_sub'), answers.days === d)).join('')}
    </div>`,

  people: () => `
    <h1 id="q" class="q-head" tabindex="-1">${esc(t('q_people'))}</h1>
    <div class="options" role="group" aria-labelledby="q">
      ${[1, 2, 3, 5].map(n => optionBtn('people', n, t('people_' + n), '', answers.people === n)).join('')}
    </div>
    <p style="margin-top:18px"><label for="people-exact" class="muted">${esc(t('people_exact'))}</label><br>
      <input class="field field-sm" id="people-exact" type="number" inputmode="numeric" min="1" max="20"
        value="${answers.people && ![1, 2, 3, 5].includes(answers.people) ? answers.people : ''}"></p>`,

  zip: () => `
    <h1 id="q" class="q-head" tabindex="-1">${esc(t('q_zip'))}</h1>
    <p class="hint" id="h">${esc(t('q_zip_hint'))}</p>
    <input class="field" id="zip" type="text" inputmode="numeric" autocomplete="postal-code" maxlength="5"
      pattern="[0-9]{5}" placeholder="${esc(city.sample_zip || '12345')}" aria-labelledby="q" aria-describedby="h" value="${answers.zip ?? ''}">`,

  prefs: () => `
    <h1 id="q" class="q-head" tabindex="-1">${esc(t('q_prefs'))}</h1>
    <p class="hint">${esc(t('q_prefs_hint'))}</p>
    ${PREFS.map(g => {
      const opts = [...(g.none ? [g.none] : []), ...g.options];
      return `<fieldset class="pref-group"><legend>${esc(t(g.legend || 'pref_' + g.key))}</legend>${g.hint ? `<p class="fh">${esc(t(g.hint))}</p>` : ''}<div class="chips">
        ${opts.map(v => `<button type="button" class="chip" data-pref="${g.key}" data-value="${v}" aria-pressed="${prefOn(g, v)}">${esc(t(g.key + '_' + v))}</button>`).join('')}
      </div></fieldset>`;
    }).join('')}`,
};

const prefOn = (g, v) => g.single ? answers[g.key] === v
  : v === g.none ? !answers[g.key].some(x => g.options.includes(x)) : answers[g.key].includes(v);

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
    else if (v === g.none) answers[g.key] = answers[g.key].filter(x => !g.options.includes(x));
    else { const arr = answers[g.key]; const at = arr.indexOf(v); at >= 0 ? arr.splice(at, 1) : arr.push(v); }
    f.querySelectorAll(`[data-pref="${g.key}"]`).forEach(x => x.setAttribute('aria-pressed', prefOn(PREFS.find(p => p.key === g.key && (x.dataset.value === p.none || p.options.includes(x.dataset.value))), x.dataset.value)));
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
  catch (e) {
    console.error(e);
    app.innerHTML = `<p class="error" role="alert">${esc(t('error_plan'))}</p>
      <button class="btn btn-primary" id="retry">${esc(t('build_plan'))}</button>`;
    app.querySelector('#retry').onclick = () => showResults(restore);
  }
}

// Day names come from the planner in English ('Mon'…); show them in the reader's language.
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayOf = name => {
  const i = DAYS_EN.indexOf(name);
  try { return i < 0 ? name : new Intl.DateTimeFormat(lang, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i, 12))); } catch { return name; }
};
// Always-shown help for residents. Grassroots sites ('nearby') show only in "Food sites near you", by ZIP code.
const residents = () => (city.resources || []).filter(r => !['organizations', 'needs', 'nearby'].includes(r.audience));
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
    ${orgs().length ? `<h3 class="orgs-head no-print">${esc(t('sec_help_orgs'))}</h3><div class="help-list no-print">${orgs().map(card).join('')}</div>` : ''}
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
// ── Plan home: cards that open one part of the plan at a time (Nov 2026) ──
// Everything is visible at a glance as a card with a live summary; tapping a card opens that part
// with a "Back to my plan" bar. The phone's back button also returns home. Printing shows all parts.
let hubPop = null;
window.addEventListener('popstate', e => {
  if (!hubPop || !app.querySelector('#home')) return;
  hubSkipHash = true; setTimeout(() => { hubSkipHash = false; }, 100);
  history.replaceState(e.state, '', location.pathname + qs + liveHash);
  hubPop(e.state?.panel || null);
});
const hubCard = c => `<button type="button" class="hub-card" data-open-panel="${c.id}">
  <span class="hub-icon hub-${c.id}" aria-hidden="true">${c.icon}</span>
  <span class="hub-text"><b>${esc(c.title)}</b><span class="hub-sub" id="hub-sub-${c.id}">${c.sub}</span></span>
  <span class="hub-go" aria-hidden="true">›</span></button>`;
function hubHtml({ cards, homeTop, homeBottom, panels, planTitle }) {
  return `<div id="home">${homeTop}
      <nav class="hub" aria-label="${esc(t('plan_nav'))}">${cards.map(hubCard).join('')}</nav>
      ${homeBottom}</div>
    <div class="back-bar no-print" id="back-bar" hidden>
      <button type="button" class="back-btn" id="to-home">← ${esc(t('back_home'))}</button>
      <h1 class="sr-only">${esc(planTitle)}</h1></div>
    ${panels.map(p => `<div class="panel" data-panel="${p.id}" hidden>${p.html}</div>`).join('')}`;
}
/**
 * Wire the plan home's cards and the back bar. `open`: a panel to show right away (after switching to
 * the shorter or full list the person stays on the list instead of being sent back to the plan home).
 */
function wireHub(onOpen = {}, open = null) {
  const home = app.querySelector('#home'), bar = app.querySelector('#back-bar');
  const show = id => {
    app.querySelectorAll('.panel').forEach(p => { p.hidden = p.dataset.panel !== id; });
    home.hidden = !!id; bar.hidden = !id;
    window.scrollTo({ top: 0 });
    if (id) {
      const h = app.querySelector(`.panel[data-panel="${id}"] h2`);
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); screenTitle(h); }
      onOpen[id]?.();
    } else {
      const back = app.querySelector(`[data-open-panel="${lastPanel}"]`) || app.querySelector('#res-title');
      back?.focus({ preventScroll: true }); screenTitle(app.querySelector('#res-title'));
    }
  };
  let lastPanel = null;
  hubPop = id => { if (app.querySelector('#home')) show(id); };
  app.querySelectorAll('[data-open-panel]').forEach(b => b.addEventListener('click', () => {
    lastPanel = b.dataset.openPanel;
    history.pushState({ panel: lastPanel }, '', location.href);
    show(lastPanel);
  }));
  app.querySelector('#to-home').addEventListener('click', () => (history.state?.panel ? history.back() : show(null)));
  if (open) { lastPanel = open; history.replaceState({ panel: open }, '', location.href); show(open); return; }
  if (history.state?.panel) history.replaceState(null, '', location.href); // a fresh plan always opens on its home
}
const setHubSub = (id, html) => { const el = app.querySelector('#hub-sub-' + id); if (el) el.innerHTML = html; };

// ── Where to shop: nearest stores that take SNAP (USDA list), farmers markets, bus directions ──
const aboutMi = mi => t('about_mi', { mi: Number(mi).toFixed(1) });
function shopPanel() {
  return `<section class="section shop" aria-labelledby="h-shop">
    <div class="section-head"><h2 id="h-shop">${esc(t('hub_shop'))}</h2></div>
    <div id="shop-body"><p class="muted">${esc(t('loading_data'))}</p></div></section>`;
}
async function loadShop(zip, { quiet = false } = {}) {
  const body = app.querySelector('#shop-body');
  if (!body) return;
  if (!/^\d{5}$/.test(zip || '')) {
    setHubSub('shop', esc(t('hub_shop_zip')));
    body.innerHTML = `<form class="sites-zip-form" id="shop-zip" novalidate>
      <label for="shop-zip-input">${esc(t('shop_zip_prompt'))}</label>
      <div class="sites-zip-row"><input id="shop-zip-input" class="fi fi-sm" inputmode="numeric" autocomplete="postal-code" maxlength="5">
      <button type="submit" class="btn-xs-site">${esc(t('sites_zip_go'))}</button></div><p class="error" role="alert"></p></form>`;
    body.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const v = body.querySelector('input').value.trim();
      if (!/^\d{5}$/.test(v)) { body.querySelector('.error').textContent = t('sites_zip_err'); return; }
      siteZip = v; track('zip_added_later', { zip: v });
      await loadShop(v); loadSites(v);
      app.querySelector('#h-shop')?.focus();
    };
    return;
  }
  let d = null;
  try { d = await (await fetch('/api/stores' + (qs ? qs + '&' : '?') + 'zip=' + zip)).json(); } catch { /* shown below */ }
  if (!app.querySelector('#shop-body')) return;
  if (!d || (!d.grocery.length && !d.markets.length)) {
    setHubSub('shop', esc(t('hub_shop_zip')));
    body.innerHTML = `<p class="empty-note">${esc(t('shop_none'))}</p>`;
    return;
  }
  const doubler = d.markets.find(m => m.double);
  setHubSub('shop', [d.grocery[0] ? esc(t('hub_shop_near', { mi: Number(d.grocery[0].miles).toFixed(1) })) : '',
    doubler ? esc(t('hub_shop_double', { mi: Number(doubler.miles).toFixed(1) })) : ''].filter(Boolean).join(' · '));
  // Full address for map and transit links, in the city's own place and state.
  const where = st => [st.addr, [city.place, city.region].filter(Boolean).join(', '), st.zip].filter(Boolean).join(' ');
  const card = st => `<article class="store">
      <h3>${esc(st.name)}</h3>
      <p class="store-meta">${esc([st.addr, aboutMi(st.miles), st.hours ? t('hours_' + st.hours) : ''].filter(Boolean).join(' · '))}</p>
      <div class="chips-row">
        <span class="chip-tag">${esc(t('chip_snap'))}</span>
        ${st.wic ? `<span class="chip-tag">${esc(t('chip_wic'))}</span>` : ''}
        ${st.double ? `<span class="chip-tag chip-good">${esc(t('chip_double_' + st.double))}</span>` : ''}
        ${st.membership ? `<span class="chip-tag chip-plain">${esc(t('chip_member'))}</span>` : ''}
      </div>
      <div class="help-actions">
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(st.name + ', ' + where(st))}" target="_blank" rel="noopener" data-track="store" data-target="snap-${st.id}" data-action="directions">${esc(t('directions'))}<span class="sr-only"> (${esc(st.name)})</span></a>
        ${city.transit_trip_url ? `<a href="${esc(city.transit_trip_url.replace('{dest}', encodeURIComponent(where(st))))}" target="_blank" rel="noopener" data-track="store" data-target="snap-${st.id}" data-action="bus">${esc(t('shop_bus'))}<span class="sr-only"> (${esc(st.name)})</span></a>` : ''}
      </div></article>`;
  const asOf = new Date(d.as_of + 'T12:00:00Z').toLocaleDateString(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  body.innerHTML = `<p class="sites-sorted">${esc(t('shop_near', { zip }))}
      <button type="button" class="btn-link" id="shop-change">${esc(t('sites_zip_change'))}</button></p>
    ${d.grocery.length ? `<h3 class="shop-group">${esc(t('shop_grocery'))}</h3>${d.grocery.map(card).join('')}` : ''}
    ${d.markets.length ? `<h3 class="shop-group">${esc(t('shop_markets'))}</h3>${d.markets.map(card).join('')}` : ''}
    ${city.wic_finder_url ? `<p><a href="${esc(city.wic_finder_url)}" target="_blank" rel="noopener" data-track="store" data-target="wic-finder" data-action="wic_finder">${esc(t('shop_wic'))}</a></p>` : ''}
    <p class="source-note">${esc(t('shop_source', { date: asOf }))}</p>`;
  body.querySelector('#shop-change').onclick = () => { loadShop(null); body.querySelector('input')?.focus(); };
}

// ── "Need help with anything else?" (after the plan; value first, nothing asked in return) ──
// Tapping a need shows where to get that help now: verified City/County sources, nonprofits from the
// directory that offer it (nearest first), and 2-1-1. Taps are counted anonymously; nobody is contacted.
const FOOD_OFFERS = ['groceries', 'produce', 'meals'];
/** How many nearby food sites to show (the nearest first). */
const NEARBY_SHOWN = 3;
let siteCache = [];
const helpCard = r => `<article class="help-card">
  <h3>${esc(resText(r, 'name'))}</h3><p>${esc(resText(r, 'description'))}</p>
  <div class="help-actions">
    ${r.phone ? `<a href="tel:${esc(r.phone)}" data-track="resource" data-target="${esc(r.id)}" data-action="call">${esc(t('call', { phone: r.phone }))}</a>` : ''}
    ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener" data-track="resource" data-target="${esc(r.id)}" data-action="website">${esc(t('visit'))}<span class="sr-only"> (${esc(resText(r, 'name'))})</span></a>` : ''}
  </div></article>`;
function needsSection() {
  if (!(city.needs || []).length) return '';
  return `<section class="section needs no-print" id="needs" aria-labelledby="h-needs">
    <div class="section-head"><h2 id="h-needs">${esc(t('needs_title'))}</h2></div>
    <p class="hint">${esc(t('needs_hint'))}</p>
    <div class="chips">${city.needs.map(n => `<button type="button" class="chip" data-need="${n}" aria-pressed="false" aria-controls="need-panel">${esc(t('need_' + n))}</button>`).join('')}</div>
    <div id="need-panel" class="help-list" aria-live="polite" hidden></div>
  </section>`;
}
function wireNeeds() {
  const panel = app.querySelector('#need-panel');
  if (!panel) return;
  const counted = new Set();
  app.querySelectorAll('[data-need]').forEach(b => b.addEventListener('click', () => {
    const need = b.dataset.need, open = b.getAttribute('aria-pressed') !== 'true';
    app.querySelectorAll('[data-need]').forEach(x => x.setAttribute('aria-pressed', open && x === b));
    if (!open) { panel.hidden = true; return; }
    if (!counted.has(need)) { counted.add(need); track('need_tapped', { need }); }
    const sources = (city.resources || []).filter(r => (r.needs || []).includes(need));
    // Every city's 2-1-1 listing (phone 211) ends the list: it can help with any need.
    const two11 = (city.resources || []).find(r => r.phone === '211');
    const orgs = siteCache.filter(p => (p.offers || []).includes(need)).slice(0, 4);
    panel.innerHTML = [...sources.map(helpCard), ...orgs.map(p => `<article class="help-card site-card">
        <span class="site-kind">${esc(t('kind_' + p.kind))}</span><h3>${esc(p.name)}</h3>
        ${[p.address, p.city, p.zip].filter(Boolean).length ? `<p class="site-where">${esc([p.address, p.city, p.zip].filter(Boolean).join(', '))}</p>` : ''}
        ${p.description ? `<p class="muted">${esc(p.description)}</p>` : ''}
        <div class="help-actions">
          ${p.phone ? `<a href="tel:${esc(p.phone)}" data-track="site" data-target="${esc(p.id)}" data-action="call">${esc(t('call', { phone: p.phone }))}</a>` : ''}
          ${p.website ? `<a href="${esc(p.website)}" target="_blank" rel="noopener" data-track="site" data-target="${esc(p.id)}" data-action="website">${esc(t('visit'))}<span class="sr-only"> (${esc(p.name)})</span></a>` : ''}
        </div></article>`), two11 ? helpCard(two11) : ''].join('');
    panel.hidden = false;
  }));
}

async function loadSites(zip) {
  const box = app.querySelector('#sites');
  if (!box) return;
  let sites = [];
  try { sites = await (await fetch('/api/providers' + (qs ? qs + '&' : '?') + 'zip=' + (zip || ''))).json(); } catch { return; }
  if (!Array.isArray(sites)) return;
  siteCache = sites;
  // Food sites only here; listings that offer only other help appear under "Need help with anything else?".
  sites = sites.filter(p => p.kind !== 'other' || (p.offers || []).some(o => FOOD_OFFERS.includes(o)));
  if (!box.isConnected) return;
  const month = iso => new Date(iso).toLocaleDateString(document.documentElement.lang || 'en', { month: 'long', year: 'numeric' });
  // At most 3, the nearest (owner decision Nov 8: the Food Bank finder plus a few nearby sites, never a long list).
  // The server sends only sites within 10 miles of the ZIP, so no ZIP means none yet: the box asks for one.
  const shown = sites.slice(0, NEARBY_SHOWN);
  const descOf = p => (p.resource_id ? resText({ id: p.resource_id, description: p.description }, 'description') : p.description);
  box.querySelector('#sites-list').innerHTML = (!shown.length && /^\d{5}$/.test(zip || '') ? `<p class="muted">${esc(t('sites_none_near', { zip }))}</p>` : '') + shown.map(p => {
    const where = [p.address, p.city, p.zip].filter(Boolean).join(', ');
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
      ${p.description ? `<p class="muted">${esc(descOf(p))}</p>` : ''}
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
}

function renderResults(plan, restore = {}) {
  current = () => openFromHash(location.hash, openedSavedId);
  const { input, weeks, priced } = plan;
  let s = plan.result, shopping = plan.shopping;
  const peopleLabel = input.people === 1 ? t('person') : t('people', { n: input.people });
  // 'Enough' only at 100% of the 2,000-calorie reference; 'a little under' from 80%.
  // Under the 2,000-calorie floor, say how many calories the plan reaches (owner decision Nov 8: transparency,
  // in one short line). Rounded to the nearest 50 so it doesn't read as more precise than it is.
  const kcal = (Math.round(s.cppd / 50) * 50).toLocaleString(lang);
  const calNote = () => (s.calPct >= 100 ? t('cal_ok') : s.calPct >= 80 ? t('cal_low', { kcal }) : t('cal_tight', { kcal }));
  const sumFacts = () => `${esc(t('res_facts', { budget: Math.round(input.budget), people: peopleLabel, days: input.days }))} ${esc(calNote())}${s.remaining > 1 ? ' ' + esc(t('res_left', { remaining: money(s.remaining) })) : ''}`;
  const dietNotes = DIETS.filter(d => (input.avoid || []).includes(d)).map(d => DIET_NOTE_KEYS[d]);
  let nItems = s.cart.length;

  // Which option is chosen per meal slot: key "w-d-slot" → index (0 = main pick, 1 = alternate).
  const choice = {};
  for (const k of restore.swaps || []) {
    const [w, d, sl] = k.split('-');
    if (weeks[w]?.[d]?.[sl]?.[1]) choice[k] = 1;
  }
  const checked = new Set(restore.checked || []);
  const recipes = new Map();
  weeks.flat().forEach(d => { if (!d.leftover && !d.uncovered) ['breakfast', 'lunch', 'dinner'].forEach(sl => d[sl].forEach(r => recipes.set(String(r.id), r))); });

  const rowsHtml = (groups, wk) => groups.map(g => `
    <div class="cat-head"><h3 class="shop-cat">${esc(t('cat_' + g.cat))}</h3>
      <span class="cat-sub">$${money(g.items.reduce((a, i) => a + i.subtotal, 0))}</span></div>
    <ul class="rows">${g.items.map(i => {
      const name = fName(i.id), key = wk > 1 ? `${i.id}.${wk}` : i.id, dom = key.replace('.', '-');
      return `<li class="row">
        <input type="checkbox" id="ck-${dom}" data-item="${key}" ${checked.has(key) ? 'checked' : ''}>
        <label for="ck-${dom}">${esc(name)} <span class="qty">×${i.qty}</span></label>
        <button type="button" class="info" aria-expanded="false" aria-controls="more-${dom}"
          aria-label="${esc(t('more_about', { item: name }))}">ⓘ</button>
        <span class="price">$${money(i.subtotal)}</span>
        <div class="more" id="more-${dom}" hidden><span class="size">${esc(fFull(i.id, i.name))}</span> ${esc(fNote(i.id, i.note))}${i.tip ? `<div class="shop-tip">${esc(fTip(i.tip))}</div>` : ''}</div>
      </li>`;
    }).join('')}</ul>`).join('');
  const listHtml = () => (s.have?.length ? `<p class="have-note">${esc(t('have_note', { items: s.have.map(fName).join(t('list_sep')) }))}</p>` : '') +
    (s.byWeek?.length > 1
      ? s.byWeek.map(w => `<div class="week-list"><div class="week-list-head"><h3>${esc(t('list_week', { n: w.week }))}</h3><span>$${money(w.spent)}</span></div>
          ${rowsHtml(groupShoppingList(w.cart), w.week)}</div>`).join('')
      : rowsHtml(shopping, 1));

  const weekPanel = (week, wi) => `
    <div class="week-panel" data-week="${wi}" ${wi === 0 ? '' : 'hidden'}>
      <p class="print-only week-print-title">${esc(t('week_of', { n: wi + 1, total: weeks.length }))}</p>
      ${week.map((d, di) => d.uncovered
        ? `<div class="d"><div class="day-name">${esc(dayOf(d.dayName))}</div><p class="lo">${esc(t('day_uncovered'))}</p></div>`
        : d.leftover
        ? `<div class="d"><div class="day-name">${esc(dayOf(d.dayName))}</div><p class="lo">${esc(t('leftovers'))}</p></div>`
        : `<div class="d"><div class="day-name">${esc(dayOf(d.dayName))}</div>
            ${['breakfast', 'lunch', 'dinner'].map(sl => d[sl].length ? `
              <div class="m"><span>${esc(t(sl))}</span>
                <button type="button" class="meal-pick" data-key="${wi}-${di}-${sl}">${esc(rTitle(d[sl][choice[`${wi}-${di}-${sl}`] || 0]))}</button></div>` : '').join('')}
          </div>`).join('')}
    </div>`;

  app.innerHTML = `
    ${PACKET ? `<div class="packet-bar no-print" role="status"><p>${esc(t('packet_ready'))}</p>
      <button type="button" class="btn btn-primary btn-sm" id="packet-print">${esc(t('print'))}</button>
      <button type="button" class="btn btn-ghost btn-sm" id="packet-again">${esc(t('packet_another'))}</button></div>` : ''}
    <p class="print-block print-brand">${esc(city.name)}${city.place ? ' · ' + esc(city.place) : ''} · ${esc(location.host)}</p>
    ${hubHtml({
      planTitle: t('res_title', { days: input.days }),
      homeTop: `<section class="summary" aria-labelledby="res-title">
        <p class="eyebrow">${esc(t('res_eyebrow'))}</p>
        <h1 id="res-title" tabindex="-1">${esc(t('res_title', { days: input.days }))}</h1>
        <p class="sum-big"><b>$${money(s.pppd)}</b> ${esc(t('per_person_day'))} · <b>$${money(s.ppmeal)}</b> ${esc(t('a_meal'))}</p>
        <p class="sum-facts" id="sum-facts">${sumFacts()}</p>
        ${s.coveredDays < input.days ? `<p class="cover-note">${esc(t('cover_note', { n: s.coveredDays, days: input.days }))}</p>` : ''}
        ${s.repeats ? `<p class="cover-note">${esc(t('repeat_note'))}</p>` : ''}
        ${(s.coveredDays < input.days || s.repeats || s.calPct < 80) && residents().length ? `<p class="no-print"><button type="button" class="btn btn-primary btn-sm" data-open-panel="help">${esc(t('find_free_food'))}</button></p>` : ''}
        <p class="cover-note" id="over-note" role="status"${s.overBudget > 0 ? '' : ' hidden'}>${s.overBudget > 0 ? esc(t('over_note', { amount: money(s.overBudget) })) : ''}</p>
        ${dietNotes.length ? `<ul class="diet-notes">${dietNotes.map(k => `<li>${esc(t(k))}</li>`).join('')}</ul>` : ''}
      </section>`,
      cards: [
        { id: 'list', icon: '🛒', title: t('sec_list'), sub: `${esc(t('hub_list_sub', { n: nItems, total: money(s.spent) }))}<span class="hub-done" id="hub-done"></span>` },
        { id: 'meals', icon: '🍽️', title: t('sec_plan'), sub: esc(t('hub_meals_sub', { days: input.days })) },
        ...(city.has_stores ? [{ id: 'shop', icon: '📍', title: t('hub_shop'), sub: esc(t('loading_data')) }] : []),
        ...(residents().length ? [{ id: 'help', icon: '🤝', title: t('sec_help'), sub: esc(t('hub_help_sub')) }] : []),
        ...((city.needs || []).length ? [{ id: 'needs', icon: '💬', title: t('needs_title'), sub: esc(t('hub_needs_sub')) }] : []),
      ],
      homeBottom: `${keepBar()}
        <div class="nav no-print">
          <button type="button" class="btn btn-ghost" id="print">${esc(t('print'))}</button>
          <button type="button" class="btn btn-ghost" id="restart">${esc(t('start_over'))}</button>
        </div>`,
      panels: [
        { id: 'list', html: `${plan.listInfo ? `<div class="list-nudge no-print">
            <p>${esc(plan.listInfo.mode === 'short' ? t('list_short_note', { n: plan.listInfo.short, total: plan.listInfo.full }) : t('list_full_note', { n: plan.listInfo.full }))}</p>
            <button type="button" class="btn btn-ghost btn-sm" id="list-switch">${esc(t(plan.listInfo.mode === 'short' ? 'list_show_full' : 'list_show_short'))}</button>
          </div>` : ''}
          <section class="section" id="list" aria-labelledby="h-list">
            <div class="section-head"><h2 id="h-list">${esc(t('sec_list'))}</h2>
              <span class="head-hint no-print">${esc(t('tips_hint'))}</span></div>
            <p class="list-intro">${esc(t('list_from_meals'))}</p>
            <div id="list-rows">${listHtml()}</div>
            <div class="shop-total"><span>${esc(t('total'))}</span><span id="list-total">$${money(s.spent)}</span></div>
            <p class="price-note">${esc(t('price_note', { label: cityText('price_region_label') || priced.label }))}</p>
            <p class="health-note">${esc(t('health_note'))}</p>
          </section>` },
        { id: 'meals', html: `<section class="section" id="meals" aria-labelledby="h-plan">
            <div class="section-head"><h2 id="h-plan">${esc(t('sec_plan'))}</h2></div>
            ${weeks.length > 1 ? `<div class="wk no-print">
              <button type="button" id="wk-prev" aria-label="${esc(t('prev_week'))}">‹</button>
              <span id="wk-label" aria-live="polite">${esc(t('week_of', { n: 1, total: weeks.length }))}</span>
              <button type="button" id="wk-next" aria-label="${esc(t('next_week'))}">›</button></div>` : ''}
            ${weeks.map(weekPanel).join('')}
            <p class="muted meals-hint no-print">${esc(t('meals_hint'))}</p>
          </section>` },
        ...(city.has_stores ? [{ id: 'shop', html: shopPanel() }] : []),
        { id: 'help', html: helpSection() },
        { id: 'needs', html: needsSection() },
      ],
    })}
    <div class="print-block" id="print-extra"></div>
    <p class="sr-only" id="announce" aria-live="polite"></p>
    <dialog id="recipe" aria-labelledby="recipe-title"><div class="dialog-body"></div></dialog>`;

  focusTop('#res-title');
  wireHub({}, restore.switched ? 'list' : null);
  wireNeeds();
  loadSites(answers.zip || siteZip);
  if (city.has_stores) loadShop(answers.zip || siteZip);
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
      shopping: s.byWeek?.length > 1
        ? s.byWeek.map(w => ({ head: `${t('list_week', { n: w.week })} ($${money(w.spent)})`, items: w.cart.map(i => ({ label: fName(i.id), qty: i.qty, subtotal: i.subtotal })) }))
        : shopping.map(g => ({ items: g.items.map(i => ({ label: fName(i.id), qty: i.qty, subtotal: i.subtotal })) })),
      weeks, choice, total: s.spent, url: linkFor(currentHash()), full, titleOf: rTitle, dayOf,
      labels: { list: t('sec_list'), week1: t('week_of', { n: 1, total: weeks.length }), leftover: t('leftover_short'), uncovered: t('day_uncovered'), link: t('full_plan_link') },
    }),
  });
  const updateDone = () => {
    const n = app.querySelectorAll('.row input:checked').length;
    const el = app.querySelector('#hub-done');
    if (el) el.textContent = n ? t('hub_checked', { n, total: nItems }) : '';
  };
  updateDone();
  app.querySelectorAll('.row input').forEach(x => x.addEventListener('change', () => { sync(); updateDone(); }));

  // Shopping list: tips open on tap; ticks update the saved copy.
  const wireRows = () => {
    app.querySelectorAll('#list-rows .info').forEach(b => b.addEventListener('click', () => {
      const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', open);
      app.querySelector('#' + b.getAttribute('aria-controls')).hidden = !open;
    }));
  };
  wireRows();
  // A swapped meal changes what to buy: rebuild the list from the meals chosen (engine/meals.js).
  const refreshList = () => {
    if (!plan.state) return;
    const kept = new Set([...app.querySelectorAll('.row input:checked')].map(x => x.dataset.item));
    s = { ...s, ...rebuildList(plan.state, Object.keys(choice).filter(k => choice[k] === 1)) };
    shopping = groupShoppingList(s.cart);
    nItems = s.cart.length;
    const rows = app.querySelector('#list-rows');
    rows.innerHTML = listHtml();
    rows.querySelectorAll('.row input').forEach(x => { x.checked = kept.has(x.dataset.item); x.addEventListener('change', () => { sync(); updateDone(); }); });
    wireRows();
    app.querySelector('#list-total').textContent = '$' + money(s.spent);
    app.querySelector('.sum-big').innerHTML = `<b>$${money(s.pppd)}</b> ${esc(t('per_person_day'))} · <b>$${money(s.ppmeal)}</b> ${esc(t('a_meal'))}`;
    app.querySelector('#sum-facts').innerHTML = sumFacts();
    const over = app.querySelector('#over-note');
    over.hidden = !(s.overBudget > 0);
    over.textContent = s.overBudget > 0 ? t('over_note', { amount: money(s.overBudget) }) : '';
    const card = app.querySelector('[data-open-panel="list"] .hub-sub');
    if (card) card.innerHTML = `${esc(t('hub_list_sub', { n: nItems, total: money(s.spent) }))}<span class="hub-done" id="hub-done"></span>`;
    updateDone();
  };
  if (Object.values(choice).some(v => v === 1)) refreshList(); // a saved plan with swaps

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
    // A recipe qualifies by sharing one food with the list, so say plainly what isn't on it.
    const onList = [...s.cart.map(i => i.id), ...(s.have || [])];
    const missing = (opts[ci].ingredients || []).filter(word => !PANTRY_BASICS.has(word) &&
      !(INGREDIENT_FOODS[word] || []).some(id => onList.includes(id)) &&
      !onList.some(id => id.includes(word.replace(/ /g, '')) || word.includes(id)));
    const times = timesChosen(opts[ci].id);
    const twists = twistsHtml(opts[ci], times, onList);
    openRecipe(opts[ci], opts[1 - ci] ? {
      missing, twists,
      justSwapped,
      alt: opts[1 - ci],
      onSwap: () => {
        choice[b.dataset.key] = 1 - ci;
        track('meal_swapped', { recipe: opts[1 - ci].id });
        b.textContent = rTitle(opts[1 - ci]);
        refreshList();
        app.querySelector('#announce').textContent = t('swapped_list', { title: rTitle(opts[1 - ci]) });
        sync();
        showMeal(b, true);
      },
    } : { missing, twists });
  };
  /** How many times a recipe is on the menu across the plan, counting the meals swapped in. */
  const timesChosen = id => weeks.reduce((n, w, wi) => n + w.reduce((m, d, di) => m + (d.leftover || d.uncovered ? 0
    : ['breakfast', 'lunch', 'dinner'].filter(sl => d[sl][choice[`${wi}-${di}-${sl}`] || 0]?.id === id).length), 0), 0);
  app.querySelectorAll('.meal-pick').forEach(b => b.addEventListener('click', () => showMeal(b)));

  // Paper copy: every chosen meal's recipe, plus a QR code that reopens this plan on a phone.
  const fillPrint = () => {
    const chosen = new Map();
    weeks.forEach((w, wi) => w.forEach((d, di) => { if (!d.leftover && !d.uncovered) ['breakfast', 'lunch', 'dinner'].forEach(sl => {
      const r = d[sl][choice[`${wi}-${di}-${sl}`] || 0]; if (r) chosen.set(String(r.id), r);
    }); }));
    const qrHash = planHash(packPlan(answers, { swaps: Object.keys(choice).filter(k => choice[k] === 1), checked: [] }));
    app.querySelector('#print-extra').innerHTML = `
      <section class="print-recipes"><h2>${esc(t('print_recipes'))}</h2>
        ${[...chosen.values()].map(r => `<article class="print-recipe"><h3>${esc(rTitle(r))}</h3>
          ${r.srv ? `<p class="muted">${esc(t('serves', { n: r.srv }))}</p>` : ''}
          ${Array.isArray(r.lines) ? nihRecipeHtml(r, nihChip([])) : `<p><b>${esc(t('ingredients'))}${esc(t('label_colon'))}</b> ${esc((r.ingredients || []).map(ing).join(t('list_sep')))}</p>
          <p>${esc(rSteps(r))}</p>`}${twistsHtml(r, timesChosen(r.id), [...s.cart.map(i => i.id), ...(s.have || [])])}</article>`).join('')}
      </section>
      <section class="print-qr"><img src="/qr.svg?h=${encodeURIComponent(qrHash)}" alt="" width="120" height="120">
        <p>${esc(t('print_scan'))}</p></section>`;
    return app.querySelector('#print-extra img');
  };
  printFill = fillPrint;
  const doPrint = async () => {
    const img = fillPrint();
    try { await img.decode(); } catch { /* print anyway */ }
    window.print();
  };
  app.querySelector('#list-switch')?.addEventListener('click', () => {
    const to = plan.listInfo.mode === 'short' ? 'full' : 'short';
    track('list_switched', { to, short: plan.listInfo.short, full: plan.listInfo.full });
    answers.list = to;
    showResults({ switched: true }); // a different menu: swaps and ticks start fresh
  });
  if (restore.switched) {
    app.querySelector('#announce').textContent = t('list_meals_updated');
    app.querySelector('#list-switch')?.focus();
  }
  app.querySelector('#print').onclick = doPrint;
  app.querySelector('#packet-print')?.addEventListener('click', doPrint);
  app.querySelector('#packet-again')?.addEventListener('click', renderPacket);
  app.querySelector('#restart').onclick = PACKET ? renderPacket : renderIntro;
}
let printFill = null; // fills the print-only extras for whatever plan is on screen

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


function openRecipe(r, { alt, onSwap, missing, justSwapped, twists = '' } = {}) {
  const dlg = app.querySelector('#recipe');
  dlg.querySelector('.dialog-body').innerHTML = `
    <button type="button" class="btn btn-ghost dialog-close" id="close">${esc(t('close'))}</button>
    <p class="eyebrow">${esc(t('recipe'))}</p>
    <h2 id="recipe-title" tabindex="-1">${esc(rTitle(r))}</h2>
    ${justSwapped ? `<p class="swapped-note">${esc(t('in_your_plan'))}</p>` : ''}
    ${r.srv ? `<p class="muted">${esc(t('serves', { n: r.srv }))}</p>` : ''}
    ${Array.isArray(r.lines) ? nihRecipeHtml(r, nihChip(missing)) : `<h3>${esc(t('ingredients'))}</h3>
    <ul>${(r.ingredients || []).map(i => `<li>${esc(ing(i))}${missing?.includes(i) ? ` <span class="need-tag">${esc(t('box_need'))}</span>` : ''}</li>`).join('')}</ul>
    <h3>${esc(t('steps'))}</h3>
    <p>${esc(rSteps(r))}</p>`}
    ${twists}
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
      <h1 id="q" class="q-head" tabindex="-1">${esc(t('box_title'))}</h1>
      <p class="hint">${esc(t('box_hint'))}</p>
      ${BOX_GROUPS.map(g => `<fieldset class="pref-group"><legend>${esc(t('box_group_' + g.id))}</legend><div class="chips">
        ${g.items.map(id => `<button type="button" class="chip" data-item="${id}" aria-pressed="${box.items.includes(id)}">${esc(fName(id))}</button>`).join('')}
      </div></fieldset>`).join('')}
      <div class="pref-group other-food">
        <label class="fl" for="other">${esc(t('box_other_label'))}</label>
        <p class="fh" id="other-hint">${esc(t('box_other_hint'))}</p>
        <div class="other-row"><input id="other" class="fi" autocomplete="off" maxlength="30" aria-describedby="other-hint other-err">
          <button type="button" class="btn btn-ghost btn-sm" id="other-add">${esc(t('box_other_add'))}</button></div>
        <p class="error" id="other-err"></p>
        <div class="other-pick" id="other-pick" hidden></div>
        <ul class="other-list" id="other-list"></ul>
        <p class="sr-only" id="other-status" aria-live="polite"></p>
      </div>
      <fieldset class="pref-group"><legend>${esc(t('pref_avoid'))}</legend><div class="chips">
        ${['none', ...LEAVE_OUT].map(v => `<button type="button" class="chip" data-avoid="${v}"
          aria-pressed="${v === 'none' ? !box.avoid.some(x => LEAVE_OUT.includes(x)) : box.avoid.includes(v)}">${esc(t('avoid_' + v))}</button>`).join('')}
      </div></fieldset>
      <fieldset class="pref-group"><legend>${esc(t('pref_diet'))}</legend><p class="fh">${esc(t('diet_hint'))}</p><div class="chips">
        ${DIETS.map(v => `<button type="button" class="chip" data-avoid="${v}" aria-pressed="${box.avoid.includes(v)}">${esc(t('avoid_' + v))}</button>`).join('')}
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
    if (v === 'none') box.avoid = box.avoid.filter(x => !LEAVE_OUT.includes(x));
    else { const at = box.avoid.indexOf(v); at >= 0 ? box.avoid.splice(at, 1) : box.avoid.push(v); }
    f.querySelectorAll('[data-avoid]').forEach(x => x.setAttribute('aria-pressed',
      x.dataset.avoid === 'none' ? !box.avoid.some(y => LEAVE_OUT.includes(y)) : box.avoid.includes(x.dataset.avoid)));
  }));
  wireOtherFood(f);
  f.querySelector('#back').onclick = renderIntro;
  f.onsubmit = e => {
    e.preventDefault();
    if (!box.items.length && !box.other.length) { f.querySelector('#err').textContent = t('err_box'); return; }
    logNext = { built: true };
    renderBoxResults();
  };
  focusTop('#q');
}

// "Something else in your box?": a known food under another name (any language) ticks its chip;
// anything else stays in the box as typed, so nobody hits a dead end.
let boxWordsP = null;
function wireOtherFood(f) {
  const input = f.querySelector('#other'), pickBox = f.querySelector('#other-pick'), err = f.querySelector('#other-err');
  const status = msg => { f.querySelector('#other-status').textContent = msg; };
  const drawList = () => {
    f.querySelector('#other-list').innerHTML = box.other.map((w, i) => `<li><span>${esc(w)}</span>
      <button type="button" data-rm="${i}" aria-label="${esc(t('box_other_remove', { item: w }))}">✕</button></li>`).join('');
    f.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { box.other.splice(Number(b.dataset.rm), 1); drawList(); input.focus(); }));
    f.querySelector('#count').textContent = box.items.length + box.other.length ? t('box_selected', { n: box.items.length + box.other.length }) : '';
  };
  const tick = id => {
    if (!box.items.includes(id)) box.items.push(id);
    f.querySelector(`[data-item="${id}"]`)?.setAttribute('aria-pressed', 'true');
    drawList(); status(t('box_other_found', { item: fName(id) }));
  };
  const keepTyped = raw => {
    const w = cleanFoodWord(raw);
    if (!w) { err.textContent = t('box_other_bad'); return false; }
    if (box.other.length >= 5 && !box.other.includes(w)) { err.textContent = t('box_other_max'); return false; }
    if (!box.other.includes(w)) box.other.push(w);
    drawList(); status(t('box_other_added', { item: w })); return true;
  };
  const done = () => { input.value = ''; pickBox.hidden = true; pickBox.innerHTML = ''; input.focus(); };
  const add = async () => {
    err.textContent = '';
    const raw = input.value.trim();
    if (!raw) return;
    const words = await (boxWordsP ||= fetch('/api/box-words').then(r => r.json()).catch(() => ({})));
    const ids = findBoxFood(raw, words).slice(0, 4);
    if (ids.length === 1) { tick(ids[0]); done(); return; }
    if (!ids.length) { if (keepTyped(raw)) done(); return; }
    pickBox.innerHTML = `<p class="fh">${esc(t('box_other_pick'))}</p><div class="chips">${ids.map(id => `<button type="button" class="chip" data-pick="${id}">${esc(fName(id))}</button>`).join('')}
      <button type="button" class="chip" data-keep>${esc(t('box_other_none', { item: raw }))}</button></div>`;
    pickBox.hidden = false;
    pickBox.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => { tick(b.dataset.pick); done(); }));
    pickBox.querySelector('[data-keep]').addEventListener('click', () => { if (keepTyped(raw)) done(); });
    pickBox.querySelector('button').focus();
  };
  f.querySelector('#other-add').addEventListener('click', add);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  input.addEventListener('focus', () => { boxWordsP ||= fetch('/api/box-words').then(r => r.json()).catch(() => ({})); }, { once: true });
  drawList();
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
    ${hubHtml({
      planTitle: t('box_res_title'),
      homeTop: `<section class="summary" aria-labelledby="res-title">
        <p class="eyebrow">${esc(t('door_box'))}</p>
        <h1 id="res-title" tabindex="-1">${esc(t('box_res_title'))}</h1>
        <p class="sum-facts">${esc(t('box_res_sub', { n: box.items.length + (box.other?.length || 0) }))}</p>
        ${boxValue > 0 ? `<p class="sum-big box-value">${esc(t('box_value', { value: money(boxValue) }))}</p>` : ''}
      </section>`,
      cards: [
        { id: 'meals', icon: '🍽️', title: t('box_res_title'), sub: esc(t('hub_box_meals_sub', { n: matches.length })) },
        { id: 'cant', icon: '📝', title: t('cu_title'), sub: esc(t('hub_cu_sub')) },
        ...(city.has_stores ? [{ id: 'shop', icon: '📍', title: t('hub_shop'), sub: esc(t('loading_data')) }] : []),
        ...(residents().length ? [{ id: 'help', icon: '🤝', title: t('sec_help'), sub: esc(t('hub_help_sub')) }] : []),
        ...((city.needs || []).length ? [{ id: 'needs', icon: '💬', title: t('needs_title'), sub: esc(t('hub_needs_sub')) }] : []),
      ],
      homeBottom: `${keepBar()}
        <div class="nav no-print">
          <button type="button" class="btn btn-ghost" id="edit">${esc(t('box_edit'))}</button>
          <button type="button" class="btn btn-ghost" id="print">${esc(t('print'))}</button>
          <button type="button" class="btn-link" id="to-budget">${esc(t('box_to_budget'))}</button>
        </div>`,
      panels: [
        { id: 'meals', html: `<section class="section" aria-labelledby="h-box-meals">
          <div class="section-head"><h2 id="h-box-meals">${esc(t('box_res_title'))}</h2></div>
          <p class="health-note">${esc(t('health_note'))}</p>
          ${box.other?.length ? `<p class="box-other-note">${esc(t('box_other_note', { items: box.other.join(t('list_sep')) }))}</p>` : ''}
          ${matches.length ? `<ul class="box-list">${matches.map(m => `
            <li class="box-card">
              <span class="box-slot">${esc(t(m.recipe.slot))}</span>
              <button type="button" class="meal-pick box-title" data-id="${m.recipe.id}">${esc(rTitle(m.recipe))}</button>
              <p class="box-line"><b>${esc(t('box_uses'))}${esc(t('label_colon'))}</b> ${esc(m.uses.map(ing).join(t('list_sep')))}</p>
              <p class="box-line ${m.missing.length ? 'need' : 'have-all'}">${m.missing.length
                ? `<b>${esc(t('box_need'))}${esc(t('label_colon'))}</b> ${esc(m.missing.map(ing).join(t('list_sep')))}` : esc(t('box_have_all'))}</p>
            </li>`).join('')}</ul>` : `<p class="box-none">${esc(t('box_none'))}</p>`}
        </section>` },
        { id: 'cant', html: `<section class="section cant-use no-print" aria-labelledby="h-cant">
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
        </section>` },
        ...(city.has_stores ? [{ id: 'shop', html: shopPanel() }] : []),
        { id: 'help', html: helpSection() },
        { id: 'needs', html: needsSection() },
      ],
    })}
    <dialog id="recipe" aria-labelledby="recipe-title"><div class="dialog-body"></div></dialog>`;

  focusTop('#res-title');
  wireHub();
  wireNeeds();
  loadSites(siteZip);
  if (city.has_stores) loadShop(siteZip);
  if (logNext?.built) track('box_built', { items: box.items, other: box.other, avoid: box.avoid, meals: matches.length, zip: siteZip, value: boxValue });
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
window.addEventListener('beforeprint', () => printFill?.());
window.addEventListener('beforeprint', () => document.querySelectorAll('.week-panel').forEach(p => { p.dataset.wasHidden = p.hidden; p.hidden = false; }));
window.addEventListener('afterprint', () => document.querySelectorAll('.week-panel').forEach(p => { p.hidden = p.dataset.wasHidden === 'true'; }));

boot();
