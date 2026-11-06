// "Fill it out once": a resident writes a short summary of what she needs and how to reach her, then
// shows, copies, shares, texts, emails or prints it to any service herself, so staff don't have to ask
// again and nobody has to call her first. She controls all of it:
//   • Everything is optional. She sees exactly what the summary says before sharing it.
//   • It never goes to our server. It stays on her device only if she ticks "keep it", and she can
//     delete it any time. Anonymous counts (made, and how it was shared) carry none of its contents.
// No DOM here: the browser builds the form, this module cleans and formats.

export const STORE_KEY = 'mis:summary';
export const LANG_CHOICES = ['en', 'es', 'vi', 'zh-Hans', 'other'];
export const LANG_NAMES = { en: 'English', es: 'Español', vi: 'Tiếng Việt', 'zh-Hans': '中文', other: '' };

/** The fields, in the order they appear in the summary. */
export const FIELDS = [
  { key: 'needs', list: true },
  { key: 'first_name', max: 60 },
  { key: 'phone', max: 30, pattern: /^[0-9+().\-\s]{7,30}$/ },
  { key: 'email', max: 200, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  { key: 'reach_by', choices: ['call', 'text', 'email'] },
  { key: 'language', choices: LANG_CHOICES },
  { key: 'zip', pattern: /^\d{5}$/ },
  { key: 'household', pattern: /^([1-9]|1\d|20)$/ },
  { key: 'note', max: 500 },
];

const clean = (v, max) => (v == null ? '' : String(v).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max || 200));

/** Form values → { summary } or { error: field }. needs: the city's list (city.needs). */
export function cleanSummary(v = {}, { needs = [] } = {}) {
  const out = {};
  for (const f of FIELDS) {
    if (f.list) {
      const xs = [...new Set((Array.isArray(v[f.key]) ? v[f.key] : []).filter(x => needs.includes(x)))];
      if (xs.length) out[f.key] = xs;
      continue;
    }
    const x = clean(v[f.key], f.max);
    if (!x) continue;
    if (f.choices && !f.choices.includes(x)) return { error: f.key };
    if (f.pattern && !f.pattern.test(x)) return { error: f.key };
    out[f.key] = x;
  }
  if (out.language === 'other') delete out.language;
  if (!Object.keys(out).length) return { error: 'empty' };
  return { summary: out };
}

/**
 * The summary as [label, value] rows in her language. When her language isn't English, labels and
 * fixed choices also carry the English, so staff who read only English can use it. Her own words
 * (name, note) stay as she wrote them.
 */
export function summaryRows(s, { t, en, lang }) {
  const both = k => (lang === 'en' || !en[k] || t(k) === en[k] ? t(k) : `${t(k)} / ${en[k]}`);
  const rows = [];
  for (const f of FIELDS) {
    const v = s[f.key];
    if (!v || (Array.isArray(v) && !v.length)) continue;
    const label = both('sum_f_' + f.key);
    if (f.key === 'needs') rows.push([label, v.map(n => both('need_' + n)).join('; ')]);
    else if (f.key === 'reach_by') rows.push([label, both('sum_reach_' + v)]);
    else if (f.key === 'language') rows.push([label, LANG_NAMES[v] || v]);
    else rows.push([label, v]);
  }
  return rows;
}

/** Plain text for copy, share, text message, email and print. */
export function summaryText(s, { t, en, lang, date }) {
  const both = k => (lang === 'en' || t(k) === en[k] ? t(k) : `${t(k)} / ${en[k]}`);
  return [both('sum_text_title'), '', ...summaryRows(s, { t, en, lang }).map(([l, v]) => `${l}: ${v}`), '', t('sum_text_footer', { date })].join('\n');
}
