// "Ways to change it up": small twists for a meal that repeats a lot, using only foods already on the
// shopping list (plus salt, pepper, water and cinnamon), so variety never costs extra. Shown when a
// tight budget repeats the same meal (owner idea, Nov 8 2026: a baked potato with different toppings
// gives a person some dignity even on the leanest week).
//
// Each twist belongs to a base food the meal is built on and lists what else it needs. A need is a
// food id, or a group name (beans: any kind; milk: fresh or evaporated). `unless`: skip it when that
// food is on the list (a better version of the same twist is). Text is English here; the
// translations live in public/i18n/data/<lang>.json under "twists", keyed by the twist id.

const GROUPS = { beans: ['drybeans', 'blackbeans', 'kidneybean'], milk: ['milk', 'evaporatedmilk'] };

/** base food id (or group) → twists, best first. */
export const TWISTS = {
  potatoes: [
    { id: 'potato_beans', needs: ['beans'], text: 'Baked potato topped with warm beans.' },
    { id: 'potato_garlic_butter', needs: ['butter', 'garlic'], text: 'Baked potato with garlic butter, salt and pepper.' },
    { id: 'potato_cheese', needs: ['cheese'], text: 'Baked potato with melted cheese.' },
    { id: 'potato_smashed', needs: ['oil'], text: 'Smashed potatoes: boil, press flat and crisp in a little oil.' },
    { id: 'potato_soup', needs: ['onions'], text: 'Potato soup: simmer diced potato and onion in water, then mash some to thicken.' },
  ],
  rice: [
    { id: 'rice_fried_soy', needs: ['oil', 'garlic', 'soy'], text: 'Fried rice: fry day-old rice in a little oil with garlic and a splash of soy sauce.' },
    { id: 'rice_garlic', needs: ['oil', 'garlic'], unless: 'soy', text: 'Garlic rice: fry day-old rice in a little oil with garlic.' },
    { id: 'rice_egg', needs: ['eggs'], text: 'Stir a beaten egg into hot rice with salt and pepper.' },
    { id: 'rice_sweet', needs: ['milk'], text: 'Sweet rice: simmer leftover rice in milk with a pinch of cinnamon.' },
  ],
  beans: [
    { id: 'beans_toast', needs: ['bread'], text: 'Beans on toast: mash warm beans with a little salt and spread on toast.' },
    { id: 'beans_tacos', needs: ['tortillas'], text: 'Bean tacos: warm beans rolled in tortillas.' },
    { id: 'beans_refried', needs: ['oil'], text: 'Refried beans: mash beans and fry in a little oil until thick.' },
    { id: 'beans_soup', needs: ['garlic'], text: 'Bean soup: mash some beans into extra water with garlic and simmer.' },
  ],
  oats: [
    { id: 'oats_banana', needs: ['bananas'], text: 'Stir mashed banana into the oats.' },
    { id: 'oats_pb', needs: ['peanutbutter'], text: 'Stir in a spoon of peanut butter.' },
    { id: 'oats_savory', needs: ['eggs'], text: 'Savory oats: cook with salt and top with a fried egg.' },
    { id: 'oats_pancakes', needs: ['eggs', 'bananas', 'oil'], text: 'Oat pancakes: mix oats, egg and mashed banana, cook small pancakes in a little oil.' },
  ],
  cornmeal: [
    { id: 'grits_savory', needs: ['butter', 'garlic'], text: 'Savory grits: butter, garlic, salt and pepper.' },
    { id: 'grits_fried', needs: ['oil'], text: 'Fried grits: chill leftovers, slice and crisp in a little oil.' },
    { id: 'grits_banana', needs: ['bananas'], text: 'Sweet grits topped with sliced banana.' },
    { id: 'grits_egg', needs: ['eggs'], text: 'Grits with an egg on top.' },
  ],
  pasta: [
    { id: 'pasta_beans', needs: ['beans'], text: 'Pasta and beans: stir warm beans into the pasta with a little of the cooking water.' },
    { id: 'pasta_tomato', needs: ['cannedtomatoes', 'garlic'], text: 'Tomato pasta: simmer canned tomatoes with garlic and toss with the pasta.' },
    { id: 'pasta_soy', needs: ['soy', 'garlic'], text: 'Noodles with soy sauce and garlic.' },
    { id: 'pasta_crispy', needs: ['oil'], text: 'Crispy pasta: fry leftover pasta in a little oil until golden.' },
  ],
  tortillas: [
    { id: 'tortilla_quesadilla', needs: ['cheese'], text: 'Quesadilla: cheese in a tortilla, crisped in a dry pan.' },
    { id: 'tortilla_egg', needs: ['eggs'], text: 'Egg tacos: scrambled egg in warm tortillas.' },
    { id: 'tortilla_chips', needs: ['oil'], text: 'Tortilla chips: cut into wedges and crisp in a little oil.' },
  ],
  lentils: [
    { id: 'lentil_soup', needs: ['onions', 'garlic'], text: 'Lentil soup: more water, onion and garlic.' },
    { id: 'lentil_rice', needs: ['rice'], text: 'Lentils over rice.' },
    { id: 'lentil_tacos', needs: ['tortillas'], text: 'Lentil tacos in warm tortillas.' },
  ],
  sweetpotatoes: [
    { id: 'sweetpotato_beans', needs: ['beans'], text: 'Baked sweet potato topped with beans.' },
    { id: 'sweetpotato_butter', needs: ['butter'], text: 'Mashed sweet potato with butter and a pinch of cinnamon.' },
  ],
  eggs: [
    { id: 'egg_hash', needs: ['potatoes', 'oil'], text: 'Egg and potato hash fried in a little oil.' },
    { id: 'egg_rice', needs: ['rice'], text: 'Egg over rice with salt and pepper.' },
  ],
  bread: [
    { id: 'bread_french', needs: ['eggs', 'milk'], text: 'French toast: dip bread in egg beaten with milk and fry.' },
    { id: 'bread_pb_banana', needs: ['peanutbutter', 'bananas'], text: 'Toast with peanut butter and banana.' },
  ],
  cabbage: [
    { id: 'cabbage_fried', needs: ['onions', 'oil'], text: 'Fried cabbage with onion.' },
    { id: 'cabbage_soup', needs: ['onions'], text: 'Cabbage soup: simmer with onion, salt and pepper.' },
  ],
};

/** How many times a meal has to come up in a plan before twists are offered. */
export const TWIST_REPEATS = 3;

const has = (need, onList) => (GROUPS[need] || [need]).some(id => onList.has(id));
const baseOf = id => Object.keys(GROUPS).find(g => GROUPS[g].includes(id)) || id;

/**
 * Up to `max` twists for a meal, taking turns across the foods it's built on (rice and beans → one rice
 * idea, one bean idea, …). A twist is offered only if everything it needs is already on the list or at
 * home. foodIds: the meal's food ids; onListIds: food ids on the list or at home.
 */
export function twistsFor(foodIds, onListIds, max = 3) {
  const onList = new Set(onListIds);
  const usable = tw => tw.needs.every(n => has(n, onList)) && !(tw.unless && onList.has(tw.unless));
  const queues = [...new Set(foodIds.map(baseOf))].map(b => (TWISTS[b] || []).filter(usable)).filter(q => q.length);
  const out = [];
  for (let round = 0; out.length < max && queues.some(q => q[round]); round++)
    for (const q of queues) if (q[round] && out.length < max && !out.includes(q[round])) out.push(q[round]);
  return out;
}

/** Every twist id (for translation checks). */
export const TWIST_IDS = Object.values(TWISTS).flat().map(t => t.id);
