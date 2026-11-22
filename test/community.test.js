// Community recipes (owner decisions, Nov 22 2026): share → check → approve → in plans.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';
import { memoryDb } from '../server/db.js';
import { cleanSubmission, tagsFor, toRecipe, COMMUNITY_ID_BASE, allRecipes, checksFor, extraTags } from '../server/community.js';

let server, base, db, cookie = '';
process.env.ADMIN_KEY = 'test-admin-key';
before(() => new Promise(r => { db = memoryDb(); app.locals.setDb(db); server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => server.close());
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
const DEE = {
  title: 'Rice and Gravy with Peppers and Onions', slot: 'dinner', serves: 4, consent: true, lang: 'en',
  ingredients: [{ word: 'rice', amount: '2 cups' }, { word: 'flour', amount: '3 tablespoons' }, { word: 'butter', amount: '3 tablespoons' },
    { word: 'milk', amount: '1½ cups' }, { word: 'bell peppers', amount: '2' }, { word: 'onions', amount: '1 large' }],
  extras: ['Black Pepper'], steps: 'Cook the rice. Melt butter, stir in flour 2 minutes, whisk in milk until thick. Soften peppers and onions in the gravy. Spoon over rice.',
  origin: 'My grandmother, Louisiana', shared_by: 'Ms. Dee',
};

test('the form is checked: consent required, foods only from the priced list, a name in letters only, bots refused', () => {
  const ok = cleanSubmission(DEE).row;
  assert.equal(ok.ingredients.length, 6);
  assert.deepEqual(ok.extras, ['black pepper']);
  assert.equal(cleanSubmission({ ...DEE, consent: false }).error, 'consent');
  assert.equal(cleanSubmission({ ...DEE, shared_by: 'Dee 512-555-0101' }).error, 'name');
  assert.equal(cleanSubmission({ ...DEE, shared_by: 'dee@example.com' }).error, 'name');
  assert.equal(cleanSubmission({ ...DEE, website: 'x' }).error, 'invalid');
  assert.equal(cleanSubmission({ ...DEE, ingredients: [{ word: 'unicorn meat' }] }).error, 'invalid', 'no priced food left');
  assert.equal(cleanSubmission({ ...DEE, title: '<script>alert(1)</script>' }).row.title.includes('<'), false);
});

test('what a dish contains comes from its foods; built-in recipe ids stay below the community range', () => {
  assert.deepEqual(tagsFor(['rice', 'milk', 'flour']).filter(k => ['dairy', 'gluten', 'meat'].includes(k)).sort(), ['dairy', 'gluten']);
  assert.ok(allRecipes().every(r => r.id < COMMUNITY_ID_BASE), 'built-in ids < 50000');
  const r = toRecipe({ ...cleanSubmission(DEE).row, num: 3 });
  assert.equal(r.id, COMMUNITY_ID_BASE + 3);
  assert.equal(r.community, true);
  assert.equal(r.amounts.rice, '2 cups');
});

test('share → admin check → approve → in plans → taken out', async () => {
  assert.equal((await post('/api/recipes/submit', DEE)).status, 200);
  assert.equal((await post('/api/recipes/submit', { ...DEE, consent: false })).status, 400);
  const pending = await db.listCommunityRecipes(['pending']);
  assert.equal(pending.length, 1);
  const inPlans = async () => (await (await fetch(`${base}/api/recipes`)).json()).filter(r => r.community);
  assert.equal((await inPlans()).length, 0, 'nothing reaches plans before approval');

  assert.equal((await fetch(`${base}/api/admin/community/${pending[0].id}/check`)).status, 401, 'admin only');
  cookie = (await post('/api/admin/login', { password: 'test-admin-key' })).headers.get('set-cookie').split(';')[0];
  const check = await (await fetch(`${base}/api/admin/community/${pending[0].id}/check`, { headers: { cookie } })).json();
  assert.ok(check.perServing.cost > 0 && check.perServing.calories > 0, JSON.stringify(check));
  assert.ok(check.contains.includes('dairy') && check.contains.includes('gluten'));
  assert.equal(check.tried, 20);
  const summary = await (await fetch(`${base}/api/admin/summary`, { headers: { cookie } })).json();
  assert.equal(summary.community.filter(r => r.status === 'pending').length, 1);

  // edit then approve: the name goes through the same check
  assert.equal((await post(`/api/admin/community/${pending[0].id}`, { action: 'approve', fields: { shared_by: 'Dee 5125550101' } })).status, 400);
  assert.equal((await post(`/api/admin/community/${pending[0].id}`, { action: 'approve', fields: { title: 'Rice and Gravy' } })).status, 200);
  const live = await inPlans();
  assert.equal(live.length, 1);
  assert.equal(live[0].title, 'Rice and Gravy');
  assert.equal(live[0].shared_by, 'Ms. Dee');

  // A plan made on the server can include it (option A gives it a turn).
  const plan = await (await post('/api/plan', { budget: 120, days: 7, people: 2, zip: '78702' })).json();
  assert.ok(plan.weeks, 'plan made');

  assert.equal((await post(`/api/admin/community/${pending[0].id}`, { action: 'remove' })).status, 200);
  assert.equal((await inPlans()).length, 0, 'taken out of plans');
});

// Lessons from the first community recipe (Nov 22 2026): its main foods were under "You'll also need".
test('main foods left unpriced block approval; known foods under "also need" must move to the foods', () => {
  const base = { id: 'x', num: 99, title: 'Burrito Casserole', slot: 'dinner', serves: 4, lang: 'en', steps: 'Bake at 350°F for 20 minutes.' };
  const asSent = checksFor({ ...base, ingredients: [{ word: 'cheese', amount: '3 cups' }], extras: ['frozen burritos', 'canned chili with meat', 'diced jalapeños'] });
  assert.equal(asSent.blocked, true);
  assert.equal(asSent.blocking.length, 2);
  const priced = checksFor({ ...base, ingredients: [{ word: 'frozen burritos' }, { word: 'canned chili' }, { word: 'cheese' }, { word: 'jalapeños' }], extras: [] });
  assert.equal(priced.blocked, false);
  assert.ok(priced.perServing.calories > 600 && priced.perServing.cost > 2);
});

test('"You\'ll also need" foods count for diets; unknown meat is treated as possibly pork', () => {
  assert.deepEqual(extraTags(['canned chili with meat']).sort(), ['meat', 'pork']);
  assert.deepEqual(extraTags(['vegetable broth']), []);
  assert.deepEqual(extraTags(['broth']), ['meat']); // plain broth may be meat-based: kept out of meat-free plans
  assert.deepEqual(extraTags(['diced jalapeños', 'cumin']), []);
  assert.ok(toRecipe({ num: 1, title: 't', slot: 'dinner', serves: 2, lang: 'en', steps: 's', ingredients: [{ word: 'cheese' }], extras: ['bacon bits'] }).avoid.includes('pork'));
});

test('a name typed as "Shared by …" keeps only the name', () => {
  const { row } = cleanSubmission({ consent: true, title: 'Burrito Casserole', slot: 'dinner', serves: 4, steps: 'Bake it until hot and the cheese melts.', ingredients: [{ word: 'cheese' }], shared_by: 'Shared by her oldest daughter' });
  assert.equal(row.shared_by, 'her oldest daughter');
});
