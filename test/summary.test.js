// "Fill it out once": her summary, her control. Cleaned, formatted for staff, never sent by us.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanSummary, summaryRows, summaryText } from '../public/summary.js';
import { cleanEvent } from '../server/events.js';
import { cityReport, rolesOf } from '../server/report.js';
import austin from '../cities/austin.js';
import en from '../public/i18n/en.js';
import es from '../public/i18n/es.js';

const needs = austin.needs;
const tEn = (k, v = {}) => (en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const tEs = (k, v = {}) => (es[k] ?? en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');

test('cleanSummary: everything optional, bad values named, unknown fields and needs dropped', () => {
  const { summary } = cleanSummary({ needs: ['childcare', 'cash'], first_name: '  Ana ', phone: '512-555-0101', reach_by: 'text', language: 'es', household: '4', note: 'Two kids\nunder 5', ssn: '123-45-6789' }, { needs });
  assert.deepEqual(summary, { needs: ['childcare'], first_name: 'Ana', phone: '512-555-0101', reach_by: 'text', language: 'es', household: '4', note: 'Two kids\nunder 5' });
  assert.equal(cleanSummary({}, { needs }).error, 'empty');
  assert.equal(cleanSummary({ language: 'other' }, { needs }).error, 'empty', 'a language of "other" alone says nothing');
  assert.equal(cleanSummary({ phone: 'call me' }, { needs }).error, 'phone');
  assert.equal(cleanSummary({ zip: '7870' }, { needs }).error, 'zip');
  assert.equal(cleanSummary({ household: '25' }, { needs }).error, 'household');
  assert.equal(cleanSummary({ email: 'nope' }, { needs }).error, 'email');
});

test('summary text: her language plus English labels for staff; her own words untouched', () => {
  const { summary } = cleanSummary({ needs: ['rent'], first_name: 'Ana', reach_by: 'call', note: 'Llamar después de las 5' }, { needs });
  const text = summaryText(summary, { t: tEs, en, lang: 'es', date: '6 de noviembre de 2026' });
  assert.match(text, /^Solicitud de ayuda \/ Request for help/);
  assert.match(text, /Pregunta sobre \/ Asking about: .*Rent & utilities/);
  assert.match(text, /Llamada \/ Call/);
  assert.match(text, /Llamar después de las 5/);
  const plain = summaryText(summary, { t: tEn, en, lang: 'en', date: 'November 6, 2026' });
  assert.ok(!plain.includes(' / '), 'English needs no second label');
  assert.deepEqual(summaryRows(summary, { t: tEn, en, lang: 'en' }).map(([l]) => l), ['Asking about', 'Name', 'Best way to reach me', 'Note']);
});

test('nothing she writes is sent: the page never posts a summary, and events carry counts only', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const block = app.slice(app.indexOf('// ── "Fill it out once"'), app.indexOf('async function loadSites'));
  assert.ok(!/fetch\(/.test(block), 'no network call in the summary code');
  assert.deepEqual(cleanEvent({ event: 'summary_made', session_id: 'abc123def456', data: { needs: 2, fields: 5, kept: 'no', note: 'secret', phone: '512' } }).data, { needs: 2, fields: 5, kept: 'no' });
  assert.deepEqual(cleanEvent({ event: 'summary_shared', session_id: 'abc123def456', data: { method: 'text', body: 'secret' } }).data, { method: 'text' });
});

test('City report counts people who made and shared summaries', () => {
  const ev = (i, event, data = {}) => ({ session_id: 's' + String(i).padStart(11, '0'), event, lang: 'en', data, created_at: '2026-11-06T12:00:00Z' });
  const events = [];
  for (let i = 0; i < 20; i++) events.push(ev(i, 'page_view'), ev(i, 'summary_made', { needs: 1, fields: 3, kept: 'no' }), ev(i, 'summary_shared', { method: 'text' }));
  const r = cityReport(events, { k: 15, from: 'a', to: 'b', city: 'Austin', roles: rolesOf(austin.resources), framework: austin.report });
  const t = r.sections.flatMap(s => s.tables).find(x => x.id === 'summaries');
  assert.deepEqual(t.rows, [['Made a summary', 20], ['Shared it: text message', 20]]);
});
