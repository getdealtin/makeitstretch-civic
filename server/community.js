// Community recipes (owner decisions, Nov 22 2026): meals neighbors share at /share-a-meal. A recipe reaches
// plans only after the owner approves it in /admin, where the site has already checked it: cost, calories
// and protein from the same prices plans use, what it contains (diet tags), duplicates, cooking safety, the
// name shown, and how often it would show up in plans. Approved recipes join the planner as community
// recipes (engine/meals.js gives one a turn in each new plan when it fits: option A).
import { INGREDIENT_FOODS, cleanFoodWord } from '../engine/box.js';
import { FOOD_DB } from '../engine/food-db.js';
import { LEAVE_OUT, DIETS, foodAllowed } from '../engine/diets.js';
import { planMeals, resolvePrices } from '../engine/index.js';

export const COMMUNITY_ID_BASE = 50000; // recipe id = 50000 + num: stable, and apart from every built-in id
const SLOTS = ['breakfast', 'lunch', 'dinner'];
const LANGS = ['en', 'es', 'vi', 'zh-Hans'];
const FOOD_BY_ID = Object.fromEntries(FOOD_DB.map(f => [f.id, f]));
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const longText = (v, max) => String(v ?? '').replace(/[\u0000-\u0009\u000B-\u001F\u007F<>]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
// A name or nickname: letters, spaces and . ' - only (no numbers, emails or links), at most 40 characters.
const NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]{0,39}$/u;

/** Untrusted form body → { row } or { error: 'consent' | 'name' | 'invalid' }. */
export function cleanSubmission(b) {
  if (!b || typeof b !== 'object' || b.website) return { error: 'invalid' };
  if (b.consent !== true) return { error: 'consent' };
  const title = text(b.title, 80);
  const slot = SLOTS.includes(b.slot) ? b.slot : null;
  const seen = new Set();
  const ingredients = (Array.isArray(b.ingredients) ? b.ingredients : []).map(x => ({
    word: String(x?.word ?? '').toLowerCase().trim(), amount: text(x?.amount, 30) || null,
  })).filter(x => INGREDIENT_FOODS[x.word] && !seen.has(x.word) && seen.add(x.word)).slice(0, 15);
  const extras = [...new Set((Array.isArray(b.extras) ? b.extras : []).map(cleanFoodWord).filter(Boolean))].slice(0, 8);
  const steps = longText(b.steps, 1500);
  const serves = Number(b.serves);
  const origin = text(b.origin, 80) || null;
  // People sometimes type the whole phrase ("Shared by her oldest daughter"); the card already says "Shared by".
  const sharedBy = text(String(b.shared_by ?? '').replace(/^\s*shared\s+by\s+/i, ''), 40) || null;
  if (sharedBy && !NAME.test(sharedBy)) return { error: 'name' };
  if (title.length < 3 || !slot || !ingredients.length || steps.length < 20 || !(Number.isInteger(serves) && serves >= 1 && serves <= 20)) return { error: 'invalid' };
  return { row: { title, slot, ingredients, extras, steps, serves, origin, shared_by: sharedBy, lang: LANGS.includes(b.lang) ? b.lang : 'en' } };
}

/** What a dish contains, from its foods: the leave-outs and diets it can't be part of (shown and used in plans). */
export function tagsFor(words) {
  return [...LEAVE_OUT, ...DIETS].filter(k => words.some(w => {
    const ids = INGREDIENT_FOODS[w] || [];
    return ids.length && ids.every(id => !foodAllowed(FOOD_BY_ID[id] || { id }, [k]));
  }));
}

// Foods under "You'll also need" aren't priced, but they still count for diets (Nov 22 2026: the first community
// recipe's "canned chili with meat" wasn't tagged as meat). Unknown meat could be pork, so it's tagged both.
const EXTRA_TAGS = [
  ['pork', /\b(pork|ham|bacon|sausage|chorizo|pepperoni|hot ?dogs?|lard|meat|chili with|burritos?|tamales?)\b/i],
  ['meat', /\b(meat|beef|chicken|pork|ham|bacon|sausage|chorizo|turkey|pepperoni|hot ?dogs?|jerky|lard|steak|burritos?|tamales?|chili with|(?<!vegetable |veggie )(?:broth|bouillon)|gelatin)\b/i],
  ['fish', /\b(fish|anchov\w*|tuna|salmon|sardines?|shrimp|crab|clams?|oyster sauce|fish sauce)\b/i],
  ['dairy', /\b(cheese|milk|cream|butter|yogurt|queso|burritos?)\b/i],
  ['gluten', /\b(flour|bread|tortillas?|pasta|noodles?|crackers?|burritos?|biscuits?|buns?|croutons?)\b/i],
  ['eggs', /\beggs?\b/i],
  ['peanuts', /\bpeanuts?\b/i],
];
export const extraTags = extras => EXTRA_TAGS.filter(([, re]) => extras.some(x => re.test(x))).map(([tag]) => tag);

/** A stored row → a recipe the planner and the site use. */
export function toRecipe(row) {
  const words = row.ingredients.map(i => i.word);
  return {
    id: COMMUNITY_ID_BASE + row.num, title: row.title, slot: row.slot, cuisine: 'any',
    ingredients: words, ...(row.extras?.length ? { extras: row.extras } : {}),
    instructions: row.steps, srv: row.serves, avoid: [...new Set([...tagsFor(words), ...extraTags(row.extras || [])])], tags: 'community',
    community: true, shared_by: row.shared_by || null, origin: row.origin || null, lang: row.lang,
    amounts: Object.fromEntries(row.ingredients.filter(i => i.amount).map(i => [i.word, i.amount])),
  };
}

// ── The recipes the site uses: built-in ones plus approved community recipes ──────────────────────
let base = [], approved = [], json = null, slim = r => r;
export function initRecipes(baseRecipes, slimFn) { base = baseRecipes; slim = slimFn || slim; json = null; }
export const allRecipes = () => [...base, ...approved];
export const recipesJson = () => (json ||= JSON.stringify(allRecipes().map(slim)));
/** Reload approved community recipes (at start, every 10 minutes, and after each review). */
export async function refreshApproved(db) {
  try { approved = (await db.listCommunityRecipes(['approved'])).map(toRecipe); json = null; }
  catch (e) { console.error('community recipes:', e.message); }
}

// ── The checks shown on the approval card ────────────────────────────────────────────────────
const COOK_WORDS = /(cook|fry|fried|bake|boil|simmer|roast|grill|brown|saut|scramble|poach|stew|heat|steam)/i;
const RAW_RISK = ['chicken', 'chicken breast', 'chicken drumsticks', 'ground beef', 'beef', 'pork', 'ground pork', 'ground turkey', 'turkey kielbasa', 'fish', 'salmon', 'catfish', 'eggs'];
const CANNING = /(home[- ]?can|canning|pressure[- ]can|preserv|ferment)/i;
const TITLES = /^(ms|mr|mrs|miss|mx|dr|tía|tia|tío|tio|abuela|abuelo|grandma|grandpa|granny|big mama|mama|papa|chef|auntie|aunt|uncle|cô|chú|bà|ông)\b/i;

/** The approval card's checks for one submission (row), with the prices plans use for that city's region. */
export function checksFor(row, region = 'south') {
  const prices = resolvePrices(region);
  const recipe = toRecipe(row);
  const others = allRecipes().filter(r => r.id !== recipe.id);
  const recipes = [...others, recipe];
  const household = { leftover: 'sometimes', cuisine: [], avoid: [], have: [] }; // a plain household for the samples
  const probe = planMeals({ ...household, budget: 100, days: 7, people: 1 }, prices, recipes);
  const prepared = probe.state?.kitchen?.prepared || [];
  const me = prepared.find(r => r.id === recipe.id);
  const flags = [];
  if (!me) flags.push('Some foods have no price right now, so this recipe can’t be planned yet.');
  const same = me ? prepared.filter(r => r.id !== recipe.id && r.sig === me.sig).map(r => r.recipe.title) : [];
  if (same.length) flags.push(`Same foods as ${same.slice(0, 3).join(', ')}.`);
  if (CANNING.test(row.steps)) flags.push('The steps mention canning, preserving or fermenting. Check they are safe.');
  if (recipe.ingredients.some(w => RAW_RISK.includes(w)) && !COOK_WORDS.test(row.steps)) flags.push('It has meat, fish or eggs, but the steps don’t say to cook them.');
  // Blocking (Nov 22 2026): a dish whose main foods sit under "You'll also need" would look nearly free and
  // fall short on calories in every plan, so it can't be approved until those foods are priced.
  const blocking = [];
  const onList = (row.extras || []).filter(x => INGREDIENT_FOODS[String(x).toLowerCase()]);
  if (onList.length) blocking.push(`${onList.join(', ')} ${onList.length > 1 ? 'are' : 'is'} on the priced list. Move ${onList.length > 1 ? 'them' : 'it'} into the foods.`);
  const MIN_KCAL = { breakfast: 200, lunch: 300, dinner: 300 };
  if (me && (row.extras || []).length && me.kcal < MIN_KCAL[row.slot])
    blocking.push(`Most of this dish isn’t priced (${row.extras.join(', ')}), so a serving would count as $${me.cost.toFixed(2)} and ${Math.round(me.kcal)} calories. Price those foods before approving.`);
  const name = row.shared_by || '';
  if (name && !TITLES.test(name) && name.trim().split(/\s+/).length >= 2 && /^\p{Lu}/u.test(name.trim().split(/\s+/)[1] || '')) flags.push(`"${name}" could be a full name. You may want just a first name or nickname.`);
  // How often it would show up: 4 budgets × 5 random draws, with every approved community recipe in place.
  let shown = 0, tried = 0;
  for (const [budget, people] of [[35, 1], [60, 1], [140, 4], [350, 4]]) for (let seed = 1; seed <= 5; seed++) {
    tried++;
    const r = planMeals({ ...household, budget, days: 7, people, seed }, prices, recipes);
    if (r.weeks.flat().some(d => SLOTS.some(sl => d[sl]?.some?.(x => x.id === recipe.id)))) shown++;
  }
  return {
    recipeId: recipe.id,
    perServing: me ? { cost: +me.cost.toFixed(2), calories: Math.round(me.kcal), protein: Math.round(me.protein) } : null,
    contains: recipe.avoid, extras: recipe.extras || [], flags, blocking, blocked: blocking.length > 0, shown, tried, region,
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────────────────────
/** Public: the share form posts here. */
export function mountCommunity(app, { getDb }) {
  const hits = new Map();
  setInterval(() => hits.clear(), 60 * 60e3).unref();
  app.post('/api/recipes/submit', async (req, res) => {
    const n = (hits.get(req.ip) || 0) + 1; hits.set(req.ip, n);
    if (n > 5) return res.status(429).json({ ok: false });
    const origin = req.headers.origin;
    if (origin) { try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ ok: false }); } catch { return res.status(403).json({ ok: false }); } }
    const { row, error } = cleanSubmission(req.body);
    if (error) return res.status(400).json({ ok: false, error });
    try { await getDb().insertCommunityRecipe({ ...row, city_id: req.city.id }); res.json({ ok: true }); }
    catch (e) { console.error(e.message); res.status(500).json({ ok: false }); }
  });
  const load = () => refreshApproved(getDb());
  load(); setInterval(load, 10 * 60e3).unref();
}

/** Admin (inside the signed-in admin router): checks and review actions. */
export function mountCommunityAdmin(admin, { db, regionFor = () => 'south' }) {
  const isId = id => /^[0-9a-f-]{36}$/.test(id);
  admin.get('/community/:id/check', async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ ok: false });
    const row = await db().getCommunityRecipe(req.params.id).catch(() => null);
    if (!row) return res.status(404).json({ ok: false });
    res.json({ ok: true, ...checksFor(row, regionFor(row.city_id)) });
  });
  const EDITABLE = ['title', 'steps', 'shared_by', 'origin', 'slot', 'serves'];
  const STATUS = { approve: 'approved', reject: 'rejected', remove: 'removed' };
  admin.post('/community/:id', async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ ok: false });
    const row = await db().getCommunityRecipe(req.params.id).catch(() => null);
    if (!row) return res.status(404).json({ ok: false });
    const { action, fields } = req.body || {};
    let patch = {};
    if (fields && typeof fields === 'object') {
      // Edits go through the same checks as the form (consent was given when it was shared).
      const merged = { ...row, ...Object.fromEntries(EDITABLE.filter(k => k in fields).map(k => [k, fields[k]])) };
      const { row: clean, error } = cleanSubmission({ ...merged, consent: true, serves: Number(merged.serves) });
      if (error) return res.status(400).json({ ok: false, error });
      patch = Object.fromEntries(EDITABLE.map(k => [k, clean[k]]));
    }
    if (action && !STATUS[action]) return res.status(400).json({ ok: false });
    if (action === 'approve' && checksFor({ ...row, ...patch }, regionFor(row.city_id)).blocked) return res.status(409).json({ ok: false, error: 'unpriced' });
    if (action) Object.assign(patch, { status: STATUS[action], reviewed_at: new Date().toISOString() });
    try {
      const updated = await db().updateCommunityRecipe(row.id, patch);
      await refreshApproved(db());
      res.json({ ok: true, recipe: updated });
    } catch (e) { console.error(e.message); res.status(500).json({ ok: false }); }
  });
}
