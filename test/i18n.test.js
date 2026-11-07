// Translations: every language has every phrase, with the same {placeholders},
// and every food / ingredient word / recipe is covered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import en from '../public/i18n/en.js';
import { FOOD_DB, ALL_TIPS, INGREDIENT_FOODS, PANTRY_BASICS } from '../engine/index.js';
import austin from '../cities/austin.js';

const LANGS = ['es', 'vi', 'zh-Hans'];
const holes = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
const nih = JSON.parse(readFileSync(new URL('../data/nih-recipes.json', import.meta.url), 'utf8')).recipes;
const recipes = JSON.parse(readFileSync(new URL('../data/seed-recipes.json', import.meta.url), 'utf8')).map((r, i) => ({ ...r, id: i + 1 }));

for (const code of LANGS) {
  test(`${code}: every screen phrase is translated, placeholders intact`, async () => {
    const ui = (await import(`../public/i18n/${code}.js`)).default;
    for (const [k, v] of Object.entries(en)) {
      assert.ok(typeof ui[k] === 'string' && ui[k].trim(), `${code} missing "${k}"`);
      assert.deepEqual(holes(ui[k]), holes(v), `${code} "${k}" placeholders`);
      if (v.includes('$')) assert.ok(ui[k].includes('$'), `${code} "${k}" lost its $ sign`);
    }
    for (const k of Object.keys(ui)) assert.ok(k in en, `${code} has stray key "${k}"`);
  });

  test(`${code}: foods, tips, ingredient words and all recipes are translated`, () => {
    const p = new URL(`../public/i18n/data/${code}.json`, import.meta.url);
    assert.ok(existsSync(p), `public/i18n/data/${code}.json missing`);
    const d = JSON.parse(readFileSync(p, 'utf8'));
    for (const f of FOOD_DB) {
      for (const k of ['name', 'full', 'note']) assert.ok(d.foods?.[f.id]?.[k], `${code} food ${f.id}.${k}`);
    }
    for (const tip of ALL_TIPS) assert.ok(d.tips?.[tip.text], `${code} tip "${tip.text.slice(0, 40)}"`);
    for (const w of [...Object.keys(INGREDIENT_FOODS), ...PANTRY_BASICS]) assert.ok(d.ingredients?.[w], `${code} ingredient "${w}"`);
    for (const r of recipes) {
      assert.ok(d.recipes?.[r.id]?.title, `${code} recipe ${r.id} title (${r.title})`);
      assert.ok(d.recipes?.[r.id]?.instructions, `${code} recipe ${r.id} steps (${r.title})`);
    }
     // NHLBI main dishes: every line, step and extra, in the book's order (official Spanish for the Latino book).
    for (const r of nih) {
      const x = d.recipes?.[r.id];
      assert.ok(x?.title && x.note, `${code} NHLBI recipe ${r.id} (${r.title})`);
      assert.equal(x.lines.length, r.lines.length, `${code} ${r.title} lines`);
      assert.equal(x.steps.length, r.steps.length, `${code} ${r.title} steps`);
      assert.equal((x.extra || []).length, r.extra.length, `${code} ${r.title} extra`);
      if (code === 'es' && r.source.book === 'latino') assert.ok(x.official, `${r.title}: official Spanish`);
    }
  });

  test(`${code}: Austin's own text (disclaimer, resources) is translated`, () => {
    const c = austin.i18n?.[code];
    assert.ok(c?.disclaimer && c?.tagline && c?.price_region_label, `${code} city text`);
    assert.match(c.disclaimer, /Austin/, 'disclaimer still names Austin');
    for (const r of austin.resources) {
      assert.ok(c.resources?.[r.id]?.name && c.resources?.[r.id]?.description, `${code} resource ${r.id}`);
    }
  });
}
