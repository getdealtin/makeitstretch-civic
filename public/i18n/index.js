// Languages: the switch, the saved choice, and loading strings + data translations.
//   i18n/<code>.js          UI strings (same keys as en.js)
//   i18n/data/<code>.json   food names/notes, tips, ingredient words, recipe titles/steps
// English is the source; anything missing in a translation falls back to English.
// Adding a language = those two files + an entry in LANGS + the city's `languages`.

export const LANGS = [
  { code: 'en', label: 'English', html: 'en' },
  { code: 'es', label: 'Español', html: 'es' },
  { code: 'vi', label: 'Tiếng Việt', html: 'vi' },
  { code: 'zh-Hans', label: '中文', html: 'zh-Hans' },
];

const KEY = 'mis:lang';
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = v => { try { localStorage.setItem(KEY, v); } catch { /* ignore */ } };

/** The visitor's language: their earlier pick, else their browser's, else English. */
export function pickLang(available) {
  const ok = c => available.includes(c);
  const saved = read();
  if (saved && ok(saved)) return saved;
  for (const n of navigator.languages || [navigator.language || 'en']) {
    const l = n.toLowerCase();
    if (l.startsWith('zh') && ok('zh-Hans')) return 'zh-Hans';
    const two = l.slice(0, 2);
    if (ok(two)) return two;
  }
  return 'en';
}

export const rememberLang = code => write(code);

const cache = {};
/** → { ui, data } for a language (English: ui only, data empty). */
export function loadLang(code) {
  return (cache[code] ||= Promise.all([
    import(`./${code}.js`).then(m => m.default),
    code === 'en' ? Promise.resolve({}) : fetch(`/i18n/data/${code}.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({})),
  ]).then(([ui, data]) => ({ ui, data })));
}
