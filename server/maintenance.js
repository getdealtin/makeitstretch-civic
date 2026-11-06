// Annual updates: the facts this site depends on that go out of date, when each was last
// updated or checked, and when it's next due. Shown in /admin ("Annual updates").
// When you update one, change its date here (or in the file named) so the reminder resets.
import { BENCHMARKS } from '../engine/index.js';
import { STORES_AS_OF, FOOD_ACCESS } from './stores.js';
import { BLS_CHECKED } from './prices.js';

const addMonths = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const firstDate = s => (String(s || '').match(/\d{4}-\d{2}-\d{2}/) || [])[0] || null;

/** Each item: what, last (data or check date), due (when to do it next), how (plain words). */
export function maintenanceFor(city, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const items = [
    { id: 'stores', title: 'Store list (Where to shop)', last: STORES_AS_OF, due: addMonths(STORES_AS_OF, 15),
      what: 'USDA’s list of stores that take SNAP. USDA posts a new file early each year.',
      how: 'Ask Claude: “update the store list” (rebuilds data/snap-stores-travis.json with scripts/build-snap-stores.py).' },
    { id: 'tfp', title: 'Thrifty Food Plan benchmark', last: BENCHMARKS.tfpDate, due: addMonths(BENCHMARKS.tfpDate, 12),
      what: `Used in the City report’s budget groups (now $${BENCHMARKS.tfpPerPersonDay} per person per day, ${BENCHMARKS.tfpAsOf}).`,
      how: 'Download USDA’s latest “Cost of Food: Thrifty Food Plan” report and ask Claude to update the benchmark (engine/index.js).' },
    { id: 'snap', title: 'SNAP average benefit', last: BENCHMARKS.snapDate, due: addMonths(BENCHMARKS.snapDate, 15),
      what: `Used in the City report (now about $${BENCHMARKS.snapPerPersonDay} per person per day, ${BENCHMARKS.snapAsOf}).`,
      how: 'Ask Claude to look up USDA’s average SNAP benefit for the latest fiscal year and update engine/index.js.' },
    { id: 'bls', title: 'BLS price series check', last: BLS_CHECKED, due: addMonths(BLS_CHECKED, 12),
      what: 'Live grocery prices come from 13 BLS series. BLS sometimes stops or renumbers a series.',
      how: 'Ask Claude: “check the BLS price series” (server/prices.js). A bad series is ignored automatically meanwhile.' },
  ];
  if (FOOD_ACCESS?.checked) items.push({ id: 'access', title: 'USDA food-access data (City report)', last: FOOD_ACCESS.checked, due: addMonths(FOOD_ACCESS.checked, 12),
    what: 'Low-income and low-access tracts from USDA’s Food Access Research Atlas. New editions come every few years.',
    how: 'Ask Claude: “check for a new Food Access Research Atlas” (scripts/build-food-access.py).' });
  const links = (city.resources || []).map(r => firstDate(r.verified)).filter(Boolean).sort();
  if (links.length) items.push({ id: 'links', title: 'Help listings and links', last: links[0], due: addMonths(links[0], 12),
    what: 'The help listings on the site (food banks, benefits, 2-1-1, other help): links work and descriptions are still true.',
    how: 'Ask Claude: “check every help link” (cities/austin.js, the verified date on each listing).' });
  if (city.store_notes_checked) items.push({ id: 'notes', title: 'Farmers market notes (WIC, Double Up, hours)', last: city.store_notes_checked, due: addMonths(city.store_notes_checked, 12),
    what: 'The “Takes WIC”, “Doubles SNAP & WIC” and hours shown for SFC markets.',
    how: 'Check Sustainable Food Center’s market and Double Up pages, or ask Claude to (cities/austin.js, store_notes).' });
  const soon = addMonths(today, 1);
  return items.map(i => ({ ...i, status: i.due <= today ? 'due' : i.due <= soon ? 'soon' : 'ok' }))
    .sort((a, b) => a.due.localeCompare(b.due));
}
