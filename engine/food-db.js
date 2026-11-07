// Food catalogue + regional fallback prices. Ported from the live tool; calories now come from
// USDA FoodData Central (engine/nutrition.js) instead of the original hand-typed numbers, which
// were off by 2–3x for some foods (potatoes were listed at double, oil at a third).
// Prices are the 'May 2025' BLS-based estimates; a city can override any of
// them through its config card (price_overrides) or live BLS data.

import { NUTRITION } from './nutrition.js';
import { SATIETY } from './satiety.js';
import { EXTRA_FOODS, EXTRA_PRICES } from './extra-foods.js';

const RAW_FOODS = [
  // GRAINS & STARCHES
  {id:'rice',      name:'White Rice (2 lb)',       cal:3280,srv:16,cat:'grain',  tier:1,note:'The backbone. Pairs with everything.',          avoid:[],hasProp:'rice'},
  {id:'drybeans',  name:'Dry Pinto Beans (1 lb)',  cal:1560,srv:10,cat:'protein',tier:1,note:'One of the cheapest proteins per dollar.',          avoid:[],hasProp:'beans'},
  {id:'oats',      name:'Rolled Oats (42 oz)',      cal:4200,srv:28,cat:'grain',  tier:1,note:'Best breakfast value. Keeps you full for hours.',avoid:['gluten'],hasProp:'oats'},
  {id:'bread',     name:'Bread (loaf)',              cal:1200,srv:20,cat:'grain',  tier:1,note:'Quick meals, sandwiches, sides.',               avoid:['gluten'],hasProp:'bread'},
  {id:'pasta',     name:'Pasta (1 lb)',              cal:1600,srv:8, cat:'grain',  tier:1,note:'Fast meals. 15 minutes start to finish.',        avoid:['gluten'],hasProp:'pasta'},
  {id:'cornmeal',  name:'Cornmeal (2 lb)',           cal:3200,srv:20,cat:'grain',  tier:1,note:'Grits, polenta, cornbread. Southern staple.',   avoid:['gluten'],hasProp:null},
  {id:'flour',     name:'All-Purpose Flour (5 lb)', cal:7700,srv:50,cat:'grain',  tier:1,note:'Pancakes, dumplings, thicken soups.',            avoid:['gluten'],hasProp:null},
  {id:'tortillas', name:'Tortillas (pkg of 10)',     cal:1800,srv:10,cat:'grain',  tier:1,note:'Wraps, tacos, quesadillas — faster than bread.',avoid:['gluten'],hasProp:null},
  {id:'barley',    name:'Barley (1 lb)',              cal:1520,srv:8, cat:'grain',  tier:2,note:'Nutty flavor. Great in soups and stews.',        avoid:['gluten'],hasProp:null},
  {id:'lentils',   name:'Dry Lentils (1 lb)',        cal:1560,srv:10,cat:'protein',tier:1,note:'Cook in 20 min, no soaking. Protein powerhouse.',avoid:[],hasProp:null},
  {id:'splitpeas', name:'Split Peas (1 lb)',         cal:1480,srv:10,cat:'protein',tier:1,note:'Makes a filling, very cheap soup.',avoid:[],hasProp:null},
  {id:'chickpeas', name:'Canned Chickpeas (15 oz)',  cal:360, srv:3, cat:'protein',tier:1,note:'Ready to eat. Salads, stews, roasted as a snack.',avoid:[],hasProp:null},

  // PROTEINS
  {id:'eggs',      name:'Eggs, Grade A (dozen)',     cal:840, srv:12,cat:'protein',tier:1,note:'Most versatile protein — any meal, any time.',   avoid:['eggs'],hasProp:'eggs'},
  {id:'chicken',   name:'Chicken Leg Quarters (2 lb)',cal:1100,srv:4,cat:'protein',tier:2,note:'Best value meat. Bone-in cooks the longest.',     avoid:['meat'],hasProp:null},
  {id:'tuna',      name:'Canned Tuna (5 oz)',         cal:150, srv:2, cat:'protein',tier:1,note:'Quick protein over rice or in a sandwich.',       avoid:['fish','meat'],hasProp:null},
  {id:'sardines',  name:'Canned Sardines (3.75 oz)', cal:190, srv:2, cat:'protein',tier:1,note:'Rich in omega-3s. No cooking needed.', avoid:['fish','meat'],hasProp:null},
  {id:'peanutbutter',name:'Peanut Butter (16 oz)',   cal:2688,srv:16,cat:'protein',tier:1,note:'Dense calories. Lasts months. Emergency fuel.',   avoid:['peanuts'],hasProp:null},
  {id:'groundbeef',name:'Ground Beef (1 lb)',         cal:1200,srv:4, cat:'protein',tier:2,note:'Stretches across 2–3 meals with rice or pasta.',  avoid:['meat'],hasProp:null},
  {id:'porkchops', name:'Pork Chops (1 lb)',          cal:780, srv:3, cat:'protein',tier:2,note:'Value cut. Braise low and slow for best results.', avoid:['meat'],hasProp:null},

  // VEGETABLES
  {id:'potatoes',  name:'Potatoes (5 lb)',            cal:3500,srv:14,cat:'vegetable',tier:1,note:'Filling, nutritious, stores for weeks.',        avoid:[],hasProp:'potatoes'},
  {id:'onions',    name:'Onions (3 lb)',               cal:480, srv:12,cat:'vegetable',tier:1,note:'Flavor base for almost every savory meal.',     avoid:[],hasProp:null},
  {id:'cabbage',   name:'Cabbage (1 head)',            cal:440, srv:8, cat:'vegetable',tier:1,note:'Lasts 2–3 weeks in the fridge. Very versatile.',avoid:[],hasProp:null},
  {id:'carrots',   name:'Carrots (2 lb)',              cal:328, srv:8, cat:'vegetable',tier:1,note:'Cheap, nutritious, and stores for weeks.',avoid:[],hasProp:null},
  {id:'cannedtomatoes',name:'Canned Tomatoes (28 oz)',cal:140, srv:6, cat:'vegetable',tier:1,note:'Turns rice and beans into a real meal.',         avoid:[],hasProp:null},
  {id:'garlic',    name:'Garlic (1 head)',             cal:45,  srv:8, cat:'vegetable',tier:1,note:'Costs almost nothing. Makes every dish better.', avoid:[],hasProp:null},
  {id:'sweetpotatoes',name:'Sweet Potatoes (3 lb)',   cal:1080,srv:6, cat:'vegetable',tier:1,note:'Rich in vitamin A and fiber. Bake whole.',avoid:[],hasProp:null},
  {id:'frozenvegs',name:'Frozen Mixed Veg (1 lb)',    cal:280, srv:4, cat:'vegetable',tier:2,note:'About as nutritious as fresh. No waste, no prep.',    avoid:[],hasProp:null},
  {id:'frozencorn',name:'Frozen Corn (1 lb)',          cal:360, srv:4, cat:'vegetable',tier:2,note:'Works in soups, sides, quesadillas.',           avoid:[],hasProp:null},
  {id:'corn',      name:'Canned Corn (15 oz)',         cal:210, srv:3, cat:'vegetable',tier:1,note:'Quick side or add to soups and rice dishes.',   avoid:[],hasProp:null},
  {id:'greenbeans',name:'Canned Green Beans (14 oz)', cal:80,  srv:3, cat:'vegetable',tier:1,note:'Cheap, quick vegetable. No cooking needed.',    avoid:[],hasProp:null},
  {id:'cannedpeas',name:'Canned Peas (15 oz)',         cal:180, srv:3, cat:'vegetable',tier:1,note:'Add to rice, pasta, or eat as a side.',         avoid:[],hasProp:null},
  {id:'spinach',   name:'Frozen Spinach (10 oz)',      cal:120, srv:5, cat:'vegetable',tier:2,note:'Cheap iron and vitamins. Add to eggs or soup.',  avoid:[],hasProp:null},
  {id:'bellpepper',name:'Bell Peppers (3 count)',      cal:150, srv:6, cat:'vegetable',tier:2,note:'Color and crunch. Good raw or cooked.',          avoid:[],hasProp:null},
  {id:'celery',    name:'Celery (1 bunch)',            cal:80,  srv:8, cat:'vegetable',tier:2,note:'Flavor base for soups and stews.',              avoid:[],hasProp:null},
  {id:'cucumber',  name:'Cucumbers (2 count)',         cal:60,  srv:4, cat:'vegetable',tier:2,note:'No cooking needed. Refreshing cheap snack.',    avoid:[],hasProp:null},

  // FRUIT
  {id:'bananas',   name:'Bananas (~6 count)',          cal:420, srv:6, cat:'fruit',tier:1,note:'One of the cheapest fruits. Quick energy, no cooking.',       avoid:[],hasProp:null},
  {id:'applesauce',name:'Applesauce (46 oz)',          cal:700, srv:10,cat:'fruit',tier:2,note:'Sweet, filling, shelf-stable.',                   avoid:[],hasProp:null},
  {id:'apples',    name:'Apples (3 lb)',               cal:480, srv:8, cat:'fruit',tier:2,note:'Keep for weeks. Best fresh snack per dollar.',     avoid:[],hasProp:null},
  {id:'oranges',   name:'Oranges (4 count)',           cal:280, srv:4, cat:'fruit',tier:2,note:'Vitamin C. Peel and eat — no prep needed.',       avoid:[],hasProp:null},
  {id:'driedmango',name:'Dried Mango (3.5 oz)',        cal:320, srv:4, cat:'fruit',tier:2,note:'Long shelf life. Natural sweetener for oatmeal.', avoid:[],hasProp:null},
  {id:'cannedpeaches',name:'Canned Peaches (15 oz)',   cal:200, srv:3, cat:'fruit',tier:2,note:'No refrigeration. Add to oatmeal or eat plain.',  avoid:[],hasProp:null},

  // DAIRY & ALTERNATIVES
  {id:'milk',      name:'Whole Milk (1 gallon)',       cal:2400,srv:16,cat:'dairy',tier:1,note:'Adds protein and calories. Good in oatmeal.',     avoid:['dairy'],hasProp:null},
  {id:'butter',    name:'Butter (1 lb)',               cal:3248,srv:32,cat:'dairy',tier:2,note:'Flavor multiplier. A little goes a long way.',    avoid:['dairy'],hasProp:null},
  {id:'cheese',    name:'Shredded Cheese (8 oz)',      cal:800, srv:8, cat:'dairy',tier:2,note:'Turns plain rice or beans into a full meal.',     avoid:['dairy'],hasProp:null},
  {id:'yogurt',    name:'Yogurt (32 oz)',              cal:640, srv:8, cat:'dairy',tier:2,note:'Breakfast protein. Also works as a sauce base.',  avoid:['dairy'],hasProp:null},
  {id:'coconutmilk',name:'Coconut Milk (13.5 oz can)',cal:440, srv:4, cat:'dairy',tier:2,note:'Dairy-free. Rich base for curries and rice.',     avoid:[],hasProp:null},
  {id:'evaporatedmilk',name:'Evaporated Milk (12 oz)',cal:480, srv:6, cat:'dairy',tier:2,note:'Shelf-stable milk. Works in soups and desserts.', avoid:['dairy'],hasProp:null},

  // FATS & OILS
  {id:'oil',       name:'Vegetable Oil (48 oz)',       cal:3840,srv:48,cat:'fat',  tier:1,note:'Essential. Needed to cook almost everything else.',avoid:[],hasProp:'oil'},
  {id:'oliveoil',  name:'Olive Oil (16 oz)',           cal:1920,srv:24,cat:'fat',  tier:2,note:'Better flavor than veggie oil for finishing dishes.',avoid:[],hasProp:null},

  // PANTRY STAPLES
  {id:'soy',       name:'Soy Sauce (10 oz)',           cal:60,  srv:20,cat:'pantry',tier:2,note:'Transforms any rice or noodle dish instantly.', avoid:[],hasProp:null},
  {id:'hotsauce',  name:'Hot Sauce (5 oz)',            cal:20,  srv:20,cat:'pantry',tier:2,note:'Free flavor. Makes any plain dish interesting.', avoid:[],hasProp:null},
  {id:'cannedbroth',name:'Chicken Broth (32 oz)',      cal:60,  srv:8, cat:'pantry',tier:2,note:'Better than water for rice and soups.',          avoid:['meat'],hasProp:null},
  {id:'vegbroth',  name:'Vegetable Broth (32 oz)',     cal:40,  srv:8, cat:'pantry',tier:2,note:'Stock base for soups and rice. Vegetarian.',     avoid:[],hasProp:null},
  {id:'blackbeans',name:'Canned Black Beans (15 oz)',  cal:360, srv:3, cat:'protein',tier:1,note:'No cooking. Open and eat or add to rice.',      avoid:[],hasProp:null},
  {id:'kidneybean',name:'Canned Kidney Beans (15 oz)', cal:360, srv:3, cat:'protein',tier:1,note:'Chili, soups, rice dishes. Ready to use.',      avoid:[],hasProp:null},
  {id:'cannedchili',name:'Canned Chili (15 oz)',       cal:420, srv:3, cat:'protein',tier:2,note:'Complete meal straight from the can.',          avoid:['meat'],hasProp:null},
  {id:'cannedsoups',name:'Canned Soup (10.5 oz)',      cal:200, srv:2, cat:'pantry',tier:2,note:'Emergency meal. Add crackers or bread.',          avoid:[],hasProp:null},
  {id:'salsa',     name:'Salsa (16 oz)',               cal:80,  srv:8, cat:'pantry',tier:2,note:'Latin flavor base. Also works as a pasta sauce.', avoid:[],hasProp:null},
];

/** Every food with USDA calories, protein and fiber per package, and its satiety weight. */
// Plus the foods only the NHLBI recipes use (recipeOnly; engine/extra-foods.js). g = edible grams per package.
export const FOOD_DB = [...RAW_FOODS, ...EXTRA_FOODS].map(f => {
  const n = NUTRITION[f.id];
  return n ? { ...f, cal: n.kcal, protein: n.protein, fiber: n.fiber, fdc: n.fdc, g: n.g, sat: SATIETY[f.id] } : { ...f, sat: 0.5 };
});


const CORE_PRICES = {
  northeast:{rice:2.99,drybeans:1.99,oats:3.89,eggs:3.79,potatoes:4.49,bread:2.19,cabbage:1.59,onions:2.39,bananas:0.89,milk:4.39,cannedtomatoes:1.29,peanutbutter:3.19,chicken:5.89,pasta:1.49,lentils:2.29,oil:4.89,carrots:1.79,flour:3.49,frozenvegs:2.49,tuna:1.49,garlic:0.79,sweetpotatoes:3.29,applesauce:3.89,chickpeas:1.89,corn:1.09,greenbeans:1.19,sardines:1.99,cornmeal:2.49,barley:2.29,splitpeas:1.79,driedmango:3.49,tortillas:2.99,coconutmilk:1.99,groundbeef:5.99,porkchops:3.99,butter:4.99,cheese:3.49,yogurt:4.99,oliveoil:5.99,soy:1.99,hotsauce:1.99,cannedbroth:2.49,vegbroth:2.29,blackbeans:0.99,kidneybean:0.99,cannedchili:1.69,cannedsoups:1.29,salsa:2.99,cannedpeaches:1.49,oranges:2.99,apples:3.99,frozencorn:1.29,cannedpeas:0.89,spinach:1.99,bellpepper:2.99,celery:1.99,cucumber:1.49,barley:2.29,evaporatedmilk:1.49,cannedpeas:0.89},
  midwest:{rice:2.59,drybeans:1.59,oats:3.49,eggs:3.19,potatoes:3.89,bread:1.79,cabbage:1.29,onions:1.99,bananas:0.79,milk:3.79,cannedtomatoes:1.09,peanutbutter:2.99,chicken:4.99,pasta:1.19,lentils:1.89,oil:4.29,carrots:1.39,flour:2.79,frozenvegs:2.09,tuna:1.19,garlic:0.65,sweetpotatoes:2.79,applesauce:3.29,chickpeas:1.59,corn:0.89,greenbeans:0.99,sardines:1.79,cornmeal:2.09,barley:1.99,splitpeas:1.49,driedmango:2.99,tortillas:2.49,coconutmilk:1.79,groundbeef:4.99,porkchops:3.29,butter:3.99,cheese:2.99,yogurt:3.99,oliveoil:4.99,soy:1.79,hotsauce:1.79,cannedbroth:1.99,vegbroth:1.89,blackbeans:0.79,kidneybean:0.79,cannedchili:1.39,cannedsoups:0.99,salsa:2.49,cannedpeaches:1.19,oranges:2.49,apples:3.29,frozencorn:1.09,cannedpeas:0.75,spinach:1.69,bellpepper:2.49,celery:1.69,cucumber:1.19,evaporatedmilk:1.19},
  south:{rice:2.49,drybeans:1.59,oats:3.39,eggs:3.09,potatoes:3.99,bread:1.79,cabbage:1.29,onions:1.89,bananas:0.75,milk:3.89,cannedtomatoes:1.09,peanutbutter:2.99,chicken:4.89,pasta:1.19,lentils:1.89,oil:4.19,carrots:1.39,flour:2.79,frozenvegs:2.09,tuna:1.19,garlic:0.65,sweetpotatoes:2.79,applesauce:3.29,chickpeas:1.59,corn:0.89,greenbeans:0.99,sardines:1.79,cornmeal:1.99,barley:1.99,splitpeas:1.49,driedmango:2.99,tortillas:2.29,coconutmilk:1.79,groundbeef:4.89,porkchops:3.19,butter:3.89,cheese:2.89,yogurt:3.79,oliveoil:4.79,soy:1.69,hotsauce:1.69,cannedbroth:1.89,vegbroth:1.79,blackbeans:0.79,kidneybean:0.79,cannedchili:1.29,cannedsoups:0.89,salsa:2.29,cannedpeaches:1.09,oranges:2.29,apples:3.19,frozencorn:1.09,cannedpeas:0.69,spinach:1.59,bellpepper:2.29,celery:1.49,cucumber:1.09,evaporatedmilk:1.09},
  west:{rice:2.89,drybeans:2.09,oats:3.99,eggs:3.69,potatoes:4.59,bread:2.09,cabbage:1.49,onions:2.29,bananas:0.85,milk:4.19,cannedtomatoes:1.19,peanutbutter:3.09,chicken:5.99,pasta:1.49,lentils:2.39,oil:5.09,carrots:1.79,flour:3.49,frozenvegs:2.59,tuna:1.49,garlic:0.79,sweetpotatoes:3.29,applesauce:3.79,chickpeas:1.89,corn:1.09,greenbeans:1.19,sardines:1.99,cornmeal:2.49,barley:2.29,splitpeas:1.79,driedmango:3.29,tortillas:2.79,coconutmilk:1.99,groundbeef:5.89,porkchops:3.89,butter:4.79,cheese:3.29,yogurt:4.79,oliveoil:5.79,soy:1.99,hotsauce:1.99,cannedbroth:2.29,vegbroth:2.09,blackbeans:0.99,kidneybean:0.99,cannedchili:1.59,cannedsoups:1.19,salsa:2.79,cannedpeaches:1.39,oranges:2.79,apples:3.79,frozencorn:1.29,cannedpeas:0.89,spinach:1.89,bellpepper:2.79,celery:1.79,cucumber:1.29,evaporatedmilk:1.39},
  national:{rice:2.69,drybeans:1.79,oats:3.69,eggs:3.39,potatoes:4.09,bread:1.89,cabbage:1.39,onions:2.09,bananas:0.82,milk:3.99,cannedtomatoes:1.19,peanutbutter:3.09,chicken:5.39,pasta:1.29,lentils:2.09,oil:4.49,carrots:1.49,flour:2.99,frozenvegs:2.29,tuna:1.29,garlic:0.69,sweetpotatoes:2.99,applesauce:3.49,chickpeas:1.69,corn:0.99,greenbeans:1.09,sardines:1.89,cornmeal:2.19,barley:2.09,splitpeas:1.59,driedmango:3.19,tortillas:2.59,coconutmilk:1.89,groundbeef:5.19,porkchops:3.59,butter:4.39,cheese:3.09,yogurt:4.39,oliveoil:5.39,soy:1.89,hotsauce:1.79,cannedbroth:2.09,vegbroth:1.89,blackbeans:0.89,kidneybean:0.89,cannedchili:1.49,cannedsoups:1.09,salsa:2.59,cannedpeaches:1.29,oranges:2.59,apples:3.49,frozencorn:1.19,cannedpeas:0.79,spinach:1.79,bellpepper:2.59,celery:1.69,cucumber:1.19,evaporatedmilk:1.19}
};
/** Every region: its own estimates, plus the recipe foods' national prices (BLS updates five of them live). */
export const FALLBACK_PRICES = Object.fromEntries(Object.entries(CORE_PRICES).map(([region, p]) => [region, { ...EXTRA_PRICES, ...p }]));

export const ALL_TIPS = [
  {text:'🥚 Eat eggs and bananas first — they spoil fastest. Rice, beans, oats, and peanut butter can last weeks.',needs:['eggs','bananas']},
  {text:'🍚 Cook a large pot of rice and beans on day one. Reheat throughout the week — flavor improves each day.',needs:['rice','drybeans']},
  {text:'🧅 Onion and garlic are your best flavor investment. They cost pennies and transform any plain dish.',needs:['onions','garlic']},
  {text:'💧 Save the water you cook beans or potatoes in. It\'s nutritious and makes an excellent soup base.',needs:['drybeans','potatoes']},
  {text:'🥜 Two slices of bread with peanut butter is about 350 calories in two minutes. Keep it as emergency fuel.',needs:['peanutbutter','bread']},
  {text:'❄️ Cook double the beans and freeze half. Saves time and energy cost later in the week.',needs:['drybeans','lentils']},
  {text:'🥬 Cabbage lasts 2–3 weeks in the fridge. Use everything else first — it\'ll still be good at the end.',needs:['cabbage']},
  {text:'🌡️ Soak oats in water the night before. No cooking needed in the morning.',needs:['oats']},
  {text:'🥕 Carrots and cabbage give you a lot of nutrition per dollar, and both keep for weeks.',needs:['carrots','cabbage']},
  {text:'🍗 Cook chicken in water and use the broth for rice or soup. One piece goes a very long way.',needs:['chicken']},
  {text:'🫙 Don\'t run out of oil — it\'s how you cook almost everything. Use it sparingly and it lasts.',needs:['oil']},
  {text:'🍅 A can of tomatoes turns plain beans or lentils from a side into a full meal.',needs:['cannedtomatoes']},
  {text:'🐟 Canned tuna or sardines over rice is one of the fastest complete protein meals you can make.',needs:['tuna','sardines']},
  {text:'🌾 Lentils cook in 20 minutes with no soaking — faster and easier than beans.',needs:['lentils']},
  {text:'🍠 Sweet potatoes bake whole in 45 minutes with zero prep. Put them in when you start cooking other things.',needs:['sweetpotatoes']},
  {text:'🫘 Canned beans are pre-cooked — open and eat, no stove needed. Best for rushed days.',needs:['chickpeas','blackbeans','kidneybean']},
];
