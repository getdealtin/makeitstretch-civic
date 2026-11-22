// Footer links on the site's own pages (owner decision, Nov 22 2026): About · Stay connected · Privacy
// policy, in the page's language, with the city kept in the links (?city=…).
import { loadLang } from './i18n/index.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Fills every `.footer-links` element on the page. */
export async function setFooterLinks(code, qs = location.search) {
  const { ui } = await loadLang(code);
  const en = code === 'en' ? ui : (await loadLang('en')).ui;
  const t = k => ui[k] || en[k];
  const html = `<a href="/about${esc(qs)}">${esc(t('about_link'))}</a> · <a href="/about${esc(qs)}#connect">${esc(t('connect_link'))}</a> · <a href="/privacy${esc(qs)}">${esc(t('privacy_link'))}</a>`;
  document.querySelectorAll('.footer-links').forEach(el => { el.innerHTML = html; });
}
