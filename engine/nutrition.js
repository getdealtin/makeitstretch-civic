// Nutrition per package, from USDA FoodData Central, SR Legacy (April 2018 release).
// Public domain (U.S. government work). https://fdc.nal.usda.gov/
//
// Each food uses its as-bought form (dry beans, raw potatoes, canned with or without liquid as noted)
// and the edible weight of the package in FOOD_DB: g = grams eaten per package (peels, bones and
// cores removed). kcal, protein (g) and fiber (g) are per package. fdc = the FoodData Central id,
// so anyone can check a number at https://fdc.nal.usda.gov/fdc-app.html#/food-details/<fdc>/nutrients.
// Split peas: SR Legacy has no raw entry, so the cooked entry is used at its cooked weight
// (1 lb dry ≈ 1,316 g cooked).
import { EXTRA_NUTRITION } from './extra-foods.js';

const CORE_NUTRITION = {
  rice: { fdc: 168877, g: 907, kcal: 3311, protein: 64.7, fiber: 11.8 }, // Rice, white, long-grain, regular, raw, enriched
  drybeans: { fdc: 175199, g: 454, kcal: 1575, protein: 97.2, fiber: 70.4 }, // Beans, pinto, mature seeds, raw
  oats: { fdc: 173904, g: 1191, kcal: 4514, protein: 156.6, fiber: 120.3 }, // Cereals, oats, regular and quick, not fortified, dry
  bread: { fdc: 174924, g: 567, kcal: 1508, protein: 50.2, fiber: 15.3 }, // Bread, white, commercially prepared (includes soft bread crumbs)
  pasta: { fdc: 169736, g: 454, kcal: 1684, protein: 59.2, fiber: 14.5 }, // Pasta, dry, enriched
  cornmeal: { fdc: 168867, g: 907, kcal: 3356, protein: 64.5, fiber: 35.4 }, // Cornmeal, degermed, enriched, yellow
  flour: { fdc: 168894, g: 2268, kcal: 8256, protein: 234.3, fiber: 61.2 }, // Wheat flour, white, all-purpose, enriched, bleached
  tortillas: { fdc: 175037, g: 450, kcal: 1377, protein: 36.9, fiber: 15.8 }, // Tortillas, ready-to-bake or -fry, flour, refrigerated
  barley: { fdc: 170284, g: 454, kcal: 1598, protein: 45, fiber: 70.8 }, // Barley, pearled, raw
  lentils: { fdc: 172420, g: 454, kcal: 1598, protein: 111.8, fiber: 48.6 }, // Lentils, raw
  splitpeas: { fdc: 172429, g: 1316, kcal: 1553, protein: 109.8, fiber: 109.2 }, // Peas, split, mature seeds, cooked, boiled, without salt
  chickpeas: { fdc: 175206, g: 425, kcal: 374, protein: 20.9, fiber: 18.7 }, // Chickpeas (garbanzo beans, bengal gram), mature seeds, canned, solids and liquids
  eggs: { fdc: 171287, g: 600, kcal: 858, protein: 75.4, fiber: 0 }, // Egg, whole, raw, fresh
  chicken: { fdc: 172378, g: 680, kcal: 1456, protein: 111.4, fiber: 0 }, // Chicken, broilers or fryers, leg, meat and skin, raw
  tuna: { fdc: 173709, g: 113, kcal: 97, protein: 22, fiber: 0 }, // Fish, tuna, light, canned in water, drained solids
  sardines: { fdc: 175139, g: 92, kcal: 191, protein: 22.7, fiber: 0 }, // Fish, sardine, Atlantic, canned in oil, drained solids with bone
  peanutbutter: { fdc: 174266, g: 454, kcal: 2715, protein: 100.8, fiber: 22.7 }, // Peanut butter, smooth style, with salt
  groundbeef: { fdc: 174036, g: 454, kcal: 1153, protein: 78, fiber: 0 }, // Beef, ground, 80% lean meat / 20% fat, raw
  porkchops: { fdc: 168238, g: 363, kcal: 617, protein: 75.2, fiber: 0 }, // Pork, fresh, loin, center loin (chops), bone-in, separable lean and fat, raw
  potatoes: { fdc: 170026, g: 2268, kcal: 1746, protein: 46.5, fiber: 47.6 }, // Potatoes, flesh and skin, raw
  onions: { fdc: 170000, g: 1225, kcal: 490, protein: 13.5, fiber: 20.8 }, // Onions, raw
  cabbage: { fdc: 169975, g: 810, kcal: 202, protein: 10.4, fiber: 20.2 }, // Cabbage, raw
  carrots: { fdc: 170393, g: 816, kcal: 335, protein: 7.6, fiber: 22.9 }, // Carrots, raw
  cannedtomatoes: { fdc: 170051, g: 794, kcal: 127, protein: 6.3, fiber: 15.1 }, // Tomatoes, red, ripe, canned, packed in tomato juice
  garlic: { fdc: 169230, g: 44, kcal: 65, protein: 2.8, fiber: 0.9 }, // Garlic, raw
  sweetpotatoes: { fdc: 168482, g: 1225, kcal: 1053, protein: 19.2, fiber: 36.7 }, // Sweet potato, raw, unprepared
  frozenvegs: { fdc: 170471, g: 454, kcal: 327, protein: 15.1, fiber: 18.2 }, // Vegetables, mixed, frozen, unprepared
  frozencorn: { fdc: 168398, g: 454, kcal: 400, protein: 13.7, fiber: 9.5 }, // Corn, sweet, yellow, frozen, kernels cut off cob, unprepared
  corn: { fdc: 169214, g: 283, kcal: 190, protein: 6.5, fiber: 5.7 }, // Corn, sweet, yellow, canned, whole kernel, drained solids
  greenbeans: { fdc: 169143, g: 241, kcal: 51, protein: 2.5, fiber: 4.6 }, // Beans, snap, green, canned, regular pack, drained solids
  cannedpeas: { fdc: 170104, g: 283, kcal: 195, protein: 12.5, fiber: 11.6 }, // Peas, green, canned, no salt added, drained solids
  spinach: { fdc: 169287, g: 283, kcal: 82, protein: 10.3, fiber: 8.2 }, // Spinach, frozen, chopped or leaf, unprepared
  bellpepper: { fdc: 170427, g: 369, kcal: 74, protein: 3.2, fiber: 6.3 }, // Peppers, sweet, green, raw
  celery: { fdc: 169988, g: 400, kcal: 56, protein: 2.8, fiber: 6.4 }, // Celery, raw
  cucumber: { fdc: 168409, g: 582, kcal: 87, protein: 3.8, fiber: 2.9 }, // Cucumber, with peel, raw
  bananas: { fdc: 173944, g: 640, kcal: 570, protein: 7, fiber: 16.6 }, // Bananas, raw
  applesauce: { fdc: 171695, g: 1304, kcal: 548, protein: 2.2, fiber: 14.3 }, // Applesauce, canned, unsweetened, without added ascorbic acid
  apples: { fdc: 171688, g: 1225, kcal: 637, protein: 3.2, fiber: 29.4 }, // Apples, raw, with skin
  oranges: { fdc: 169097, g: 409, kcal: 192, protein: 3.8, fiber: 9.8 }, // Oranges, raw, all commercial varieties
  driedmango: { fdc: 169091, g: 99, kcal: 316, protein: 2.4, fiber: 2.4 }, // Mango, dried, sweetened
  cannedpeaches: { fdc: 169111, g: 425, kcal: 230, protein: 1.9, fiber: 5.5 }, // Peaches, canned, light syrup pack, solids and liquids
  milk: { fdc: 171265, g: 3900, kcal: 2379, protein: 122.8, fiber: 0 }, // Milk, whole, 3.25% milkfat, with added vitamin D
  butter: { fdc: 173410, g: 454, kcal: 3255, protein: 3.9, fiber: 0 }, // Butter, salted
  cheese: { fdc: 173414, g: 227, kcal: 915, protein: 51.9, fiber: 0 }, // Cheese, cheddar
  yogurt: { fdc: 171284, g: 907, kcal: 553, protein: 31.5, fiber: 0 }, // Yogurt, plain, whole milk
  coconutmilk: { fdc: 170173, g: 400, kcal: 788, protein: 8.1, fiber: 0 }, // Nuts, coconut milk, canned (liquid expressed from grated meat and water)
  evaporatedmilk: { fdc: 171276, g: 384, kcal: 515, protein: 26.2, fiber: 0 }, // Milk, canned, evaporated, with added vitamin D and without added vitamin A
  oil: { fdc: 171411, g: 1306, kcal: 11545, protein: 0, fiber: 0 }, // Oil, soybean, salad or cooking
  oliveoil: { fdc: 171413, g: 435, kcal: 3845, protein: 0, fiber: 0 }, // Oil, olive, salad or cooking
  soy: { fdc: 174277, g: 355, kcal: 188, protein: 28.9, fiber: 2.8 }, // Soy sauce made from soy and wheat (shoyu)
  hotsauce: { fdc: 174527, g: 148, kcal: 16, protein: 0.8, fiber: 0.4 }, // Sauce, ready-to-serve, pepper or hot
  cannedbroth: { fdc: 174536, g: 907, kcal: 54, protein: 5.8, fiber: 0 }, // Soup, chicken broth, ready-to-serve
  vegbroth: { fdc: 171583, g: 907, kcal: 45, protein: 2.2, fiber: 0 }, // Soup, vegetable broth, ready to serve
  blackbeans: { fdc: 175188, g: 425, kcal: 387, protein: 25.6, fiber: 29.3 }, // Beans, black turtle, mature seeds, canned
  kidneybean: { fdc: 175195, g: 425, kcal: 344, protein: 22.2, fiber: 18.3 }, // Beans, kidney, red, mature seeds, canned, solids and liquids
  cannedchili: { fdc: 172097, g: 425, kcal: 455, protein: 24.6, fiber: 14 }, // Chili con carne with beans, canned entree
  cannedsoups: { fdc: 171543, g: 298, kcal: 143, protein: 7.1, fiber: 2.7 }, // Soup, chicken noodle, canned, condensed
  salsa: { fdc: 174524, g: 454, kcal: 132, protein: 6.9, fiber: 8.6 }, // Sauce, salsa, ready-to-serve
};

/** Core foods plus the foods the NHLBI recipes need (engine/extra-foods.js, same sources). */
export const NUTRITION = { ...CORE_NUTRITION, ...EXTRA_NUTRITION };
