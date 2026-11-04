// FROZEN REFERENCE — verbatim extraction of the live Make It Stretch math
// (getdealtin/make-it-stretch @ 5c47e04). DO NOT EDIT. The new engine is
// tested against this file so any drift from the live algorithm fails loudly.
// Source ranges: index.html L2378-2459 (FOOD_DB, prices), L2694-2839 (cart),
// L2978-2991 + L3003-3125 (meal plan); server.js L559-573 + L575-669 (matcher).
/* eslint-disable */
'use strict';
const FOOD_DB = [
  // GRAINS & STARCHES
  {id:'rice',      name:'White Rice (2 lb)',       cal:3280,srv:16,cat:'grain',  tier:1,note:'The backbone. Pairs with everything.',          avoid:[],hasProp:'rice'},
  {id:'drybeans',  name:'Dry Pinto Beans (1 lb)',  cal:1560,srv:10,cat:'protein',tier:1,note:'Cheapest protein per dollar anywhere.',          avoid:[],hasProp:'beans'},
  {id:'oats',      name:'Rolled Oats (42 oz)',      cal:4200,srv:28,cat:'grain',  tier:1,note:'Best breakfast value. Keeps you full for hours.',avoid:['gluten'],hasProp:'oats'},
  {id:'bread',     name:'Bread (loaf)',              cal:1200,srv:20,cat:'grain',  tier:1,note:'Quick meals, sandwiches, sides.',               avoid:['gluten'],hasProp:'bread'},
  {id:'pasta',     name:'Pasta (1 lb)',              cal:1600,srv:8, cat:'grain',  tier:1,note:'Fast meals. 15 minutes start to finish.',        avoid:['gluten'],hasProp:'pasta'},
  {id:'cornmeal',  name:'Cornmeal (2 lb)',           cal:3200,srv:20,cat:'grain',  tier:1,note:'Grits, polenta, cornbread. Southern staple.',   avoid:['gluten'],hasProp:null},
  {id:'flour',     name:'All-Purpose Flour (5 lb)', cal:7700,srv:50,cat:'grain',  tier:1,note:'Pancakes, dumplings, thicken soups.',            avoid:['gluten'],hasProp:null},
  {id:'tortillas', name:'Tortillas (pkg of 10)',     cal:1800,srv:10,cat:'grain',  tier:1,note:'Wraps, tacos, quesadillas — faster than bread.',avoid:['gluten'],hasProp:null},
  {id:'barley',    name:'Barley (1 lb)',              cal:1520,srv:8, cat:'grain',  tier:2,note:'Nutty flavor. Great in soups and stews.',        avoid:['gluten'],hasProp:null},
  {id:'lentils',   name:'Dry Lentils (1 lb)',        cal:1560,srv:10,cat:'protein',tier:1,note:'Cook in 20 min, no soaking. Protein powerhouse.',avoid:[],hasProp:null},
  {id:'splitpeas', name:'Split Peas (1 lb)',         cal:1480,srv:10,cat:'protein',tier:1,note:'Makes the most filling, cheapest soup you can build.',avoid:[],hasProp:null},
  {id:'chickpeas', name:'Canned Chickpeas (15 oz)',  cal:360, srv:3, cat:'protein',tier:1,note:'Ready to eat. Salads, stews, roasted as a snack.',avoid:[],hasProp:null},

  // PROTEINS
  {id:'eggs',      name:'Eggs, Grade A (dozen)',     cal:840, srv:12,cat:'protein',tier:1,note:'Most versatile protein — any meal, any time.',   avoid:['eggs'],hasProp:'eggs'},
  {id:'chicken',   name:'Chicken Leg Quarters (2 lb)',cal:1100,srv:4,cat:'protein',tier:2,note:'Best value meat. Bone-in cooks the longest.',     avoid:['meat'],hasProp:null},
  {id:'tuna',      name:'Canned Tuna (5 oz)',         cal:150, srv:2, cat:'protein',tier:1,note:'Quick protein over rice or in a sandwich.',       avoid:['fish','meat'],hasProp:null},
  {id:'sardines',  name:'Canned Sardines (3.75 oz)', cal:190, srv:2, cat:'protein',tier:1,note:'Most omega-3 per dollar of any food. No cooking.', avoid:['fish','meat'],hasProp:null},
  {id:'peanutbutter',name:'Peanut Butter (16 oz)',   cal:2688,srv:16,cat:'protein',tier:1,note:'Dense calories. Lasts months. Emergency fuel.',   avoid:['peanuts'],hasProp:null},
  {id:'groundbeef',name:'Ground Beef (1 lb)',         cal:1200,srv:4, cat:'protein',tier:2,note:'Stretches across 2–3 meals with rice or pasta.',  avoid:['meat'],hasProp:null},
  {id:'porkchops', name:'Pork Chops (1 lb)',          cal:780, srv:3, cat:'protein',tier:2,note:'Value cut. Braise low and slow for best results.', avoid:['meat'],hasProp:null},

  // VEGETABLES
  {id:'potatoes',  name:'Potatoes (5 lb)',            cal:3500,srv:14,cat:'vegetable',tier:1,note:'Filling, nutritious, stores for weeks.',        avoid:[],hasProp:'potatoes'},
  {id:'onions',    name:'Onions (3 lb)',               cal:480, srv:12,cat:'vegetable',tier:1,note:'Flavor base for almost every savory meal.',     avoid:[],hasProp:null},
  {id:'cabbage',   name:'Cabbage (1 head)',            cal:440, srv:8, cat:'vegetable',tier:1,note:'Lasts 2–3 weeks in the fridge. Very versatile.',avoid:[],hasProp:null},
  {id:'carrots',   name:'Carrots (2 lb)',              cal:328, srv:8, cat:'vegetable',tier:1,note:'Cheapest nutritious vegetable. Stores for weeks.',avoid:[],hasProp:null},
  {id:'cannedtomatoes',name:'Canned Tomatoes (28 oz)',cal:140, srv:6, cat:'vegetable',tier:1,note:'Turns rice and beans into a real meal.',         avoid:[],hasProp:null},
  {id:'garlic',    name:'Garlic (1 head)',             cal:45,  srv:8, cat:'vegetable',tier:1,note:'Costs almost nothing. Makes every dish better.', avoid:[],hasProp:null},
  {id:'sweetpotatoes',name:'Sweet Potatoes (3 lb)',   cal:1080,srv:6, cat:'vegetable',tier:1,note:'More nutrition than white potatoes. Bake whole.',avoid:[],hasProp:null},
  {id:'frozenvegs',name:'Frozen Mixed Veg (1 lb)',    cal:280, srv:4, cat:'vegetable',tier:2,note:'Same nutrition as fresh. No waste, no prep.',    avoid:[],hasProp:null},
  {id:'frozencorn',name:'Frozen Corn (1 lb)',          cal:360, srv:4, cat:'vegetable',tier:2,note:'Works in soups, sides, quesadillas.',           avoid:[],hasProp:null},
  {id:'corn',      name:'Canned Corn (15 oz)',         cal:210, srv:3, cat:'vegetable',tier:1,note:'Quick side or add to soups and rice dishes.',   avoid:[],hasProp:null},
  {id:'greenbeans',name:'Canned Green Beans (14 oz)', cal:80,  srv:3, cat:'vegetable',tier:1,note:'Cheap, quick vegetable. No cooking needed.',    avoid:[],hasProp:null},
  {id:'cannedpeas',name:'Canned Peas (15 oz)',         cal:180, srv:3, cat:'vegetable',tier:1,note:'Add to rice, pasta, or eat as a side.',         avoid:[],hasProp:null},
  {id:'spinach',   name:'Frozen Spinach (10 oz)',      cal:120, srv:5, cat:'vegetable',tier:2,note:'Cheap iron and vitamins. Add to eggs or soup.',  avoid:[],hasProp:null},
  {id:'bellpepper',name:'Bell Peppers (3 count)',      cal:150, srv:6, cat:'vegetable',tier:2,note:'Color and crunch. Good raw or cooked.',          avoid:[],hasProp:null},
  {id:'celery',    name:'Celery (1 bunch)',            cal:80,  srv:8, cat:'vegetable',tier:2,note:'Flavor base for soups and stews.',              avoid:[],hasProp:null},
  {id:'cucumber',  name:'Cucumbers (2 count)',         cal:60,  srv:4, cat:'vegetable',tier:2,note:'No cooking needed. Refreshing cheap snack.',    avoid:[],hasProp:null},

  // FRUIT
  {id:'bananas',   name:'Bananas (~6 count)',          cal:420, srv:6, cat:'fruit',tier:1,note:'Cheapest fruit. Quick energy, no cooking.',       avoid:[],hasProp:null},
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

const FALLBACK_PRICES = {
  northeast:{rice:2.99,drybeans:1.99,oats:3.89,eggs:3.79,potatoes:4.49,bread:2.19,cabbage:1.59,onions:2.39,bananas:0.89,milk:4.39,cannedtomatoes:1.29,peanutbutter:3.19,chicken:5.89,pasta:1.49,lentils:2.29,oil:4.89,carrots:1.79,flour:3.49,frozenvegs:2.49,tuna:1.49,garlic:0.79,sweetpotatoes:3.29,applesauce:3.89,chickpeas:1.89,corn:1.09,greenbeans:1.19,sardines:1.99,cornmeal:2.49,barley:2.29,splitpeas:1.79,driedmango:3.49,tortillas:2.99,coconutmilk:1.99,groundbeef:5.99,porkchops:3.99,butter:4.99,cheese:3.49,yogurt:4.99,oliveoil:5.99,soy:1.99,hotsauce:1.99,cannedbroth:2.49,vegbroth:2.29,blackbeans:0.99,kidneybean:0.99,cannedchili:1.69,cannedsoups:1.29,salsa:2.99,cannedpeaches:1.49,oranges:2.99,apples:3.99,frozencorn:1.29,cannedpeas:0.89,spinach:1.99,bellpepper:2.99,celery:1.99,cucumber:1.49,barley:2.29,evaporatedmilk:1.49,cannedpeas:0.89},
  midwest:{rice:2.59,drybeans:1.59,oats:3.49,eggs:3.19,potatoes:3.89,bread:1.79,cabbage:1.29,onions:1.99,bananas:0.79,milk:3.79,cannedtomatoes:1.09,peanutbutter:2.99,chicken:4.99,pasta:1.19,lentils:1.89,oil:4.29,carrots:1.39,flour:2.79,frozenvegs:2.09,tuna:1.19,garlic:0.65,sweetpotatoes:2.79,applesauce:3.29,chickpeas:1.59,corn:0.89,greenbeans:0.99,sardines:1.79,cornmeal:2.09,barley:1.99,splitpeas:1.49,driedmango:2.99,tortillas:2.49,coconutmilk:1.79,groundbeef:4.99,porkchops:3.29,butter:3.99,cheese:2.99,yogurt:3.99,oliveoil:4.99,soy:1.79,hotsauce:1.79,cannedbroth:1.99,vegbroth:1.89,blackbeans:0.79,kidneybean:0.79,cannedchili:1.39,cannedsoups:0.99,salsa:2.49,cannedpeaches:1.19,oranges:2.49,apples:3.29,frozencorn:1.09,cannedpeas:0.75,spinach:1.69,bellpepper:2.49,celery:1.69,cucumber:1.19,evaporatedmilk:1.19},
  south:{rice:2.49,drybeans:1.59,oats:3.39,eggs:3.09,potatoes:3.99,bread:1.79,cabbage:1.29,onions:1.89,bananas:0.75,milk:3.89,cannedtomatoes:1.09,peanutbutter:2.99,chicken:4.89,pasta:1.19,lentils:1.89,oil:4.19,carrots:1.39,flour:2.79,frozenvegs:2.09,tuna:1.19,garlic:0.65,sweetpotatoes:2.79,applesauce:3.29,chickpeas:1.59,corn:0.89,greenbeans:0.99,sardines:1.79,cornmeal:1.99,barley:1.99,splitpeas:1.49,driedmango:2.99,tortillas:2.29,coconutmilk:1.79,groundbeef:4.89,porkchops:3.19,butter:3.89,cheese:2.89,yogurt:3.79,oliveoil:4.79,soy:1.69,hotsauce:1.69,cannedbroth:1.89,vegbroth:1.79,blackbeans:0.79,kidneybean:0.79,cannedchili:1.29,cannedsoups:0.89,salsa:2.29,cannedpeaches:1.09,oranges:2.29,apples:3.19,frozencorn:1.09,cannedpeas:0.69,spinach:1.59,bellpepper:2.29,celery:1.49,cucumber:1.09,evaporatedmilk:1.09},
  west:{rice:2.89,drybeans:2.09,oats:3.99,eggs:3.69,potatoes:4.59,bread:2.09,cabbage:1.49,onions:2.29,bananas:0.85,milk:4.19,cannedtomatoes:1.19,peanutbutter:3.09,chicken:5.99,pasta:1.49,lentils:2.39,oil:5.09,carrots:1.79,flour:3.49,frozenvegs:2.59,tuna:1.49,garlic:0.79,sweetpotatoes:3.29,applesauce:3.79,chickpeas:1.89,corn:1.09,greenbeans:1.19,sardines:1.99,cornmeal:2.49,barley:2.29,splitpeas:1.79,driedmango:3.29,tortillas:2.79,coconutmilk:1.99,groundbeef:5.89,porkchops:3.89,butter:4.79,cheese:3.29,yogurt:4.79,oliveoil:5.79,soy:1.99,hotsauce:1.99,cannedbroth:2.29,vegbroth:2.09,blackbeans:0.99,kidneybean:0.99,cannedchili:1.59,cannedsoups:1.19,salsa:2.79,cannedpeaches:1.39,oranges:2.79,apples:3.79,frozencorn:1.29,cannedpeas:0.89,spinach:1.89,bellpepper:2.79,celery:1.79,cucumber:1.29,evaporatedmilk:1.39},
  national:{rice:2.69,drybeans:1.79,oats:3.69,eggs:3.39,potatoes:4.09,bread:1.89,cabbage:1.39,onions:2.09,bananas:0.82,milk:3.99,cannedtomatoes:1.19,peanutbutter:3.09,chicken:5.39,pasta:1.29,lentils:2.09,oil:4.49,carrots:1.49,flour:2.99,frozenvegs:2.29,tuna:1.29,garlic:0.69,sweetpotatoes:2.99,applesauce:3.49,chickpeas:1.69,corn:0.99,greenbeans:1.09,sardines:1.89,cornmeal:2.19,barley:2.09,splitpeas:1.59,driedmango:3.19,tortillas:2.59,coconutmilk:1.89,groundbeef:5.19,porkchops:3.59,butter:4.39,cheese:3.09,yogurt:4.39,oliveoil:5.39,soy:1.89,hotsauce:1.79,cannedbroth:2.09,vegbroth:1.89,blackbeans:0.89,kidneybean:0.89,cannedchili:1.49,cannedsoups:1.09,salsa:2.59,cannedpeaches:1.29,oranges:2.59,apples:3.49,frozencorn:1.19,cannedpeas:0.79,spinach:1.79,bellpepper:2.59,celery:1.69,cucumber:1.19,evaporatedmilk:1.19}
};

function legacyCart(answers, inputPrices){
  let prices={...inputPrices}; let cart=[]; let activePrices;
  // Store price adjustments
  const CORNER_ADJ={bread:1.2,eggs:1.3,milk:1.25,bananas:1.15};
  const DOLLAR_ADJ={rice:.9,bread:.85,pasta:.8,cannedtomatoes:.9};
  const hasCorner=answers.stores.includes('corner');
  const hasDollar=answers.stores.includes('dollar');
  if(hasCorner)Object.keys(CORNER_ADJ).forEach(k=>{if(prices[k])prices[k]=+(prices[k]*CORNER_ADJ[k]).toFixed(2);});
  if(hasDollar)Object.keys(DOLLAR_ADJ).forEach(k=>{if(prices[k])prices[k]=+(prices[k]*DOLLAR_ADJ[k]).toFixed(2);});

  // Make prices available to swapMealIngredients for re-adding foods
  activePrices=prices;

  const avoidItems=answers.avoid;
  const haveItems=answers.have;

  // Filter and price foods
  const foods=FOOD_DB.filter(f=>{
    if(!prices[f.id])return false;
    if(f.avoid.some(a=>avoidItems.includes(a)))return false;
    if(f.hasProp&&haveItems.includes(f.hasProp))return false;
    return true;
  }).map(f=>({...f,price:prices[f.id]||0,cpd:prices[f.id]?Math.round(f.cal/prices[f.id]):0}));

  // ── USDA Thrifty Food Plan category weights ──
  // Mirrors real market-basket proportions for a balanced, credible cart
  const USDA_WEIGHTS={
    grain:    0.20,
    protein:  0.23,
    vegetable:0.14,
    fruit:    0.10,
    dairy:    0.16,
    fat:      0.07,
    pantry:   0.10,
  };

  // ── Cuisine boost packages ──
  // Ensures a culturally coherent flavor base before general staple scaling
  const CUISINE_BOOSTS={
    american:      ['eggs','bread','potatoes','butter','milk'],
    latin:         ['tortillas','onions','garlic','cannedtomatoes','salsa'],
    asian:         ['soy','garlic','onions','cabbage','rice'],
    southern:      ['cornmeal','sweetpotatoes','onions','garlic','cannedtomatoes'],
    mediterranean: ['oliveoil','lentils','onions','garlic','cannedtomatoes'],
    any:           ['onions','garlic','cannedtomatoes'],
  };

  // ── Survival floor items — always secured first ──
  // These four guarantee a calorie-safe baseline regardless of cuisine or budget
  const FLOOR_IDS=['rice','drybeans','oil','oats'];

  const cuisine=answers.cuisine||[];
  let totalCals=0;
  let remaining=answers.budget;
  cart=[];

  const addToCart=(food)=>{
    if(!food||food.price<=0) return false;
    if(remaining<food.price) return false;
    const existing=cart.find(c=>c.id===food.id);
    if(existing){
      existing.qty++;
      existing.subtotal=+(existing.price*existing.qty).toFixed(2);
    } else {
      cart.push({...food,qty:1,subtotal:+food.price.toFixed(2)});
    }
    remaining=+(remaining-food.price).toFixed(2);
    totalCals+=food.cal;
    return true;
  };

  const getFood=(id)=>foods.find(f=>f.id===id);

  // ── PHASE 1: Nutritional floor (40% of budget max, core survival staples) ──
  // getFood() returns undefined for foods excluded by avoidItems — dietary restrictions
  // are automatically respected without any additional filtering needed here
  const floorBudget=answers.budget*0.40;
  let floorSpent=0;
  for(const id of FLOOR_IDS){
    const f=getFood(id);
    if(f&&floorSpent+f.price<=floorBudget){
      if(addToCart(f)) floorSpent+=f.price;
    }
  }

  // ── PHASE 2: Cuisine boost package (10% of budget max) ──
  // Skip entirely if Phase 1 consumed the budget (tiny budget survival mode)
  if(remaining>0.50){
    const boostBudget=answers.budget*0.10;
    let boostSpent=0;
    // Merge boost IDs from all selected cuisines (deduplicated)
    const boostSet=new Set();
    const selectedCuisines=cuisine.length>0?cuisine:['any'];
    selectedCuisines.forEach(c=>{
      (CUISINE_BOOSTS[c]||CUISINE_BOOSTS.any).forEach(id=>boostSet.add(id));
    });
    for(const id of boostSet){
      const f=getFood(id);
      if(f&&!cart.find(c=>c.id===id)&&boostSpent+f.price<=boostBudget){
        if(addToCart(f)) boostSpent+=f.price;
      }
    }
  }

  // ── PHASE 3: USDA-weighted category fill (remaining budget) ──
  // Skip if tiny budget already consumed by Phases 1+2
  if(remaining>0.50){
    const remainingForFill=remaining;
    const categoryBudgets={};
    Object.entries(USDA_WEIGHTS).forEach(([cat,weight])=>{
      categoryBudgets[cat]=+(remainingForFill*weight).toFixed(2);
    });
    // foods array already filtered by avoidItems — restrictions fully respected here
    const catSpent={};
    const sortedFoods=[...foods].sort((a,b)=>a.tier-b.tier||b.cpd-a.cpd);
    for(const f of sortedFoods){
      if(cart.find(c=>c.id===f.id)) continue; // already in cart from Phase 1 or 2
      const catLimit=categoryBudgets[f.cat]||0;
      const spent=catSpent[f.cat]||0;
      if(spent+f.price<=catLimit&&remaining>=f.price){
        if(addToCart(f)) catSpent[f.cat]=(catSpent[f.cat]||0)+f.price;
      }
    }
  }

  // ── PHASE 4: Scale up staples with any remaining budget ──
  // Spend every remaining dollar on tier-1 staples scaled to timeline
  const daysMultiplier=Math.max(1,Math.floor(answers.days/7));
  let iter=0;
  while(remaining>=0.50&&iter<200){
    iter++;
    const scalables=cart.filter(c=>c.tier===1).sort((a,b)=>b.cpd-a.cpd);
    const tier2=cart.filter(c=>c.tier===2).sort((a,b)=>b.cpd-a.cpd);
    let bought=false;
    for(const item of [...scalables,...tier2]){
      const maxQty=item.tier===1?Math.max(8,daysMultiplier*4):Math.max(4,daysMultiplier*2);
      if(item.qty<maxQty&&remaining>=item.price){
        item.qty++;
        item.subtotal=+(item.price*item.qty).toFixed(2);
        remaining=+(remaining-item.price).toFixed(2);
        totalCals+=item.cal;
        bought=true;
        break;
      }
    }
    if(!bought)break;
  }

  return {cart, remaining, totalCals};
}

function legacyPlan(bySlot, answers){
  const cuisine = Array.isArray(answers.cuisine) ? answers.cuisine : [];
  const mealOptions={}, mealChoices={}; const wrap={innerHTML:""}; const data={bySlot};
      bySlot = data.bySlot;
      // Client-side cuisine guard: strip recipes that don't match selected cuisines
      if(cuisine.length > 0 && !cuisine.includes('any')) {
        const filterByCuisine = (arr) => (arr||[]).filter(r => {
          const rc = (r.cuisine||'').toLowerCase();
          return cuisine.includes(rc) || rc === 'any';
        });
        bySlot = {
          breakfast: filterByCuisine(bySlot.breakfast),
          lunch:     filterByCuisine(bySlot.lunch),
          dinner:    filterByCuisine(bySlot.dinner),
          any:       filterByCuisine(bySlot.any),
        };
      }
  // Merge 'any' slot recipes into slots — but split by appropriateness
  // Breakfast-appropriate 'any' dishes: oatmeal, eggs, porridge
  // Dinner-appropriate 'any' dishes: stews, fries
  const allAny = bySlot.any || [];
  const BREAKFAST_ANY_KEYWORDS = ['oatmeal','oats','porridge','scramble','egg','banana','potato breakfast'];
  const anyForBreakfast = allAny.filter(r => 
    BREAKFAST_ANY_KEYWORDS.some(kw => (r.title||'').toLowerCase().includes(kw))
  );
  const anyForDinnerLunch = allAny.filter(r => 
    !BREAKFAST_ANY_KEYWORDS.some(kw => (r.title||'').toLowerCase().includes(kw))
  );
  const pools = {
    breakfast: [...(bySlot.breakfast||[]), ...anyForBreakfast],
    lunch:     [...(bySlot.lunch||[]),     ...anyForDinnerLunch],
    dinner:    [...(bySlot.dinner||[]),    ...anyForDinnerLunch],
  };

  // Safety: if any pool is too thin, fill from other slots — but NEVER cross cuisines
  // allRecipes only contains recipes that already passed the cuisine filter
  const allRecipes = [...(bySlot.breakfast||[]),...(bySlot.lunch||[]),...(bySlot.dinner||[]),...allAny];
  ['breakfast','lunch','dinner'].forEach(s => {
    if(pools[s].length < 4) {
      // Pull from same-cuisine recipes in other slots, not from the full universe
      const extras = allRecipes.filter(r => !pools[s].find(p => p.id === r.id));
      pools[s] = [...pools[s], ...extras];
    }
  });

  if(!allRecipes.length){
    wrap.innerHTML = '<div style="padding:20px;color:var(--ink3)">No recipes found for your cart. Try a different cuisine or budget.</div>';
    return;
  }

  const numWeeks = Math.ceil(answers.days / 7);
  const totalDays = answers.days;
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  // 'yes' = insert leftover day every other day (d%2===1)
  // 'sometimes' = insert leftover day every 3rd day (d%3===2) 
  // 'no' = no leftover days
  const leftoverMode = answers.leftover || 'sometimes';
  const mealUse = {};

  // Track what's been used this week to prevent same-week repeats
  const weeklyUsed = {};

  const pickTwo = (slot, globalDay, weekIdx) => {
    const pool = pools[slot] || allRecipes;
    if(!pool.length) return { opts:[], discover:null };

    const weekKey = weekIdx || 0;
    if(!weeklyUsed[weekKey]) weeklyUsed[weekKey] = new Set();
    const usedThisWeek = weeklyUsed[weekKey];

    const PRIME = 13;
    const scored = pool.map((r, idx) => {
      const globalUse = (mealUse[r.id]||0);
      const weekUse = usedThisWeek.has(r.id) ? 1 : 0;
      // Also penalize dishes whose base ingredient is already used this week
      // e.g. "Congee" and "Congee with Toppings" share the word "Congee"
      const titleWords = (r.title||'').toLowerCase().split(' ').slice(0,2).join(' ');
      const similarUsed = [...usedThisWeek].some(usedId => {
        const usedR = pool.find(p => p.id === usedId);
        if(!usedR) return false;
        const usedWords = (usedR.title||'').toLowerCase().split(' ').slice(0,2).join(' ');
        return titleWords === usedWords && usedR.id !== r.id;
      });
      const similarPenalty = similarUsed ? 8000 : 0;
      // Within same week: 10000 penalty. Across weeks: 5000 per use.
      return {
        r,
        score: weekUse * 10000 + similarPenalty + globalUse * 5000 + ((idx + globalDay * PRIME) % Math.max(pool.length, 1))
      };
    });
    scored.sort((a,b) => a.score - b.score);

    const picked = [];
    for(const {r} of scored){
      if(picked.length >= 2) break;
      if(!picked.find(x => x.id === r.id)) picked.push(r);
    }
    picked.forEach(r => {
      mealUse[r.id] = (mealUse[r.id]||0) + 1;
      usedThisWeek.add(r.id);
    });
    return { opts: picked };
  };

  // Store meal options globally for swap and recipe drawer
  Object.keys(mealOptions).forEach(k => delete mealOptions[k]);
  Object.keys(mealChoices).forEach(k => delete mealChoices[k]);

  const weeks = [];
  let dayCount = 0;

  for(let w = 0; w < numWeeks; w++){
    const weekDays = [];
    for(let d = 0; d < 7 && dayCount < totalDays; d++, dayCount++){
      const dayName = dayNames[d];
      const isLeftover = dayCount > 0 && (
        (leftoverMode === 'yes' && d % 2 === 1) ||
        (leftoverMode === 'sometimes' && d % 3 === 2)
      );
      if(isLeftover){
        weekDays.push({ dayName, leftover:true });
        continue;
      }
      const globalDay = dayCount;
      const bfOpts = pickTwo('breakfast', globalDay, w);
      const luOpts = pickTwo('lunch', globalDay + 100, w);
      const diOpts = pickTwo('dinner', globalDay + 200, w);
      weekDays.push({ dayName, leftover:false,
        breakfast: bfOpts.opts, lunch: luOpts.opts, dinner: diOpts.opts });

      // Store in mealOptions for swap system
      ['breakfast','lunch','dinner'].forEach((slot, si) => {
        const opts = [bfOpts, luOpts, diOpts][si].opts;
        const key = `${w}-${d}-${slot}`;
        mealOptions[key] = opts;
        if(opts.length) mealChoices[key] = opts[0].id;
      });
    }
    weeks.push(weekDays);
  }
  return weeks;
}

// Dishes that should never appear as standalone meals in a slot
const SIDE_DISH_BLOCKLIST = new Set([
  'potato salad', 'potato salad bowl', 'succotash', 'collard-style cabbage',
  'collard style cabbage', 'coleslaw', 'corn on the cob', 'cornbread',
  'skillet cornbread', 'biscuits', 'dinner rolls', 'rice paper rolls',
]);

// Dishes that are NOT breakfast foods
const NOT_BREAKFAST = new Set([
  'rice and beans', 'gallo pinto', 'bean stew', 'vegetable soup',
  'lentil dal', 'hoppin john', "hoppin' john", 'succotash',
  'potato salad', 'potato salad bowl', 'collard-style cabbage',
  'pork and bean stew', 'bean and cornmeal stew',
]);

function legacyMatch(recipes, query){
  let out; const res={status(){return res;},json(o){out=o;return res;}};
  const req={query};
  try {
    const { ingredients, cuisine, avoid } = req.query;
    const cartIngredients = (ingredients || '').split(',').filter(Boolean).map(s => s.toLowerCase());
    const selectedCuisines = (cuisine || '').split(',').filter(Boolean);
    const avoidList = (avoid || '').split(',').filter(Boolean);

    if (!cartIngredients.length) {
      return res.status(400).json({ error: 'ingredients required' });
    }

    const scored = recipes.map(r => {
      const recipeIngs = Array.isArray(r.ingredients) ? r.ingredients : [];
      const recipeAvoids = Array.isArray(r.avoid) ? r.avoid : [];

      // Filter by cuisine — lowercase both sides to prevent case mismatch
      const rc = (r.cuisine || '').toLowerCase();
      if (selectedCuisines.length && !selectedCuisines.includes('any')) {
        const cuisineLower = selectedCuisines.map(c => c.toLowerCase());
        if (!cuisineLower.includes(rc) && rc !== 'any') {
          return null;
        }
      }

      // Filter avoided ingredients
      if (avoidList.some(a => recipeAvoids.includes(a))) return null;

      // Filter side dishes that shouldn't be standalone meals
      const nameLower = (r.title || '').toLowerCase();
      if (SIDE_DISH_BLOCKLIST.has(nameLower)) return null;

      // Filter breakfast slot: block known non-breakfast dishes
      if (r.slot === 'breakfast' && NOT_BREAKFAST.has(nameLower)) return null;

      // Score by ingredient match — 1 match minimum (2 was too strict, caused wrong-cuisine bleed)
      const matchScore = cartIngredients.filter(cartIng =>
        recipeIngs.some(recipeIng =>
          typeof recipeIng === 'string' && (
            recipeIng.toLowerCase().includes(cartIng) ||
            cartIng.includes(recipeIng.toLowerCase())
          )
        )
      ).length;

      if (matchScore < 1) return null;

      return { ...r, matchScore };
    }).filter(Boolean);

    scored.sort((a, b) => b.matchScore - a.matchScore);

    // Cap at 30 per slot for 30-day plans (3 meals/day needs good variety)
    // STRICT: a breakfast recipe only goes in breakfast, dinner only in dinner, etc.
    const bySlot = { breakfast: [], lunch: [], dinner: [], any: [] };
    for (const r of scored) {
      const rSlot = r.slot || 'any';
      // Only put in 'any' if truly slot=any; otherwise respect the recipe's slot exactly
      const targetSlot = (bySlot[rSlot] !== undefined) ? rSlot : 'any';
      if (bySlot[targetSlot].length < 30) bySlot[targetSlot].push(r);
    }

    // If any slot is critically empty (<4 recipes), do a relaxed pass with cuisine only (no match score floor)
    const allCuisineMatch = recipes.filter(r => {
      const rc = (r.cuisine || '').toLowerCase();
      const nameLower = (r.title || '').toLowerCase();
      if (SIDE_DISH_BLOCKLIST.has(nameLower)) return false;
      if (selectedCuisines.length && !selectedCuisines.includes('any')) {
        const cl = selectedCuisines.map(c => c.toLowerCase());
        if (!cl.includes(rc) && rc !== 'any') return false;
      }
      if (avoidList.some(a => (Array.isArray(r.avoid) ? r.avoid : []).includes(a))) return false;
      return true;
    });
    for (const slot of ['breakfast','lunch','dinner']) {
      if (bySlot[slot].length < 4) {
        const existingIds = new Set(bySlot[slot].map(r => r.id));
        const extras = allCuisineMatch.filter(r => {
          const rSlot = r.slot || 'any';
          // STRICT slot enforcement: breakfast dishes ONLY go to breakfast,
          // dinner dishes ONLY go to dinner. Only slot='any' can fill any slot.
          if (rSlot === 'breakfast' && slot !== 'breakfast') return false;
          if (rSlot === 'dinner' && slot !== 'dinner') return false;
          if (rSlot === 'lunch' && slot !== 'lunch') return false;
          if (NOT_BREAKFAST.has((r.title||'').toLowerCase()) && slot === 'breakfast') return false;
          return !existingIds.has(r.id);
        });
        bySlot[slot].push(...extras.slice(0, 30 - bySlot[slot].length));
      }
    }

    res.json({ found: true, bySlot, total: scored.length });

  } catch(err) {
    console.error('Recipe route error:', err.message);
    res.status(500).json({ found: false, error: err.message });
  }
  return out;
}

module.exports={FOOD_DB,FALLBACK_PRICES,legacyCart,legacyPlan,legacyMatch};
