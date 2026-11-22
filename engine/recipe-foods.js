// Built by scripts/build-recipe-foods.py: do not edit by hand. Foods the original 161 recipes need for their
// real ingredients (owner decision, Nov 19 2026). Same form as engine/extra-foods.js.
// Nutrition: USDA FoodData Central SR Legacy (fdc id), per package of g edible grams.
// Prices: national estimates from USDA ERS Purchase to Plate, each with its source.
export const RECIPE_FOODS = [{"id": "catfish", "name": "Catfish Fillets, Frozen (1 lb)", "cal": 540, "srv": 4, "cat": "protein", "tier": 2, "note": "Mild and quick. Coat in cornmeal and fry, or bake.", "avoid": ["fish", "meat"], "hasProp": null}, {"id": "kimchi", "name": "Kimchi (16 oz jar)", "cal": 68, "srv": 6, "cat": "vegetable", "tier": 2, "note": "Spicy fermented cabbage. Most brands contain fish sauce; vegan kimchi says so on the label.", "avoid": ["fish", "meat"], "hasProp": null}, {"id": "feta", "name": "Feta Cheese, Crumbled (6 oz)", "cal": 450, "srv": 6, "cat": "dairy", "tier": 2, "note": "Salty and tangy. A little goes a long way.", "avoid": ["dairy"], "hasProp": null}, {"id": "tofu", "name": "Firm Tofu (14 oz)", "cal": 572, "srv": 4, "cat": "protein", "tier": 2, "note": "Press out the water, then fry or stir-fry. A cheap plant protein.", "avoid": [], "hasProp": null}, {"id": "favabeans", "name": "Canned Fava Beans (15 oz)", "cal": 302, "srv": 3, "cat": "protein", "tier": 2, "note": "Also sold as “ful.” The base of ful medames.", "avoid": [], "hasProp": null}, {"id": "blackeyedpeas", "name": "Dry Black-Eyed Peas (1 lb)", "cal": 1525, "srv": 10, "cat": "protein", "tier": 2, "note": "No overnight soak needed. Cooks in about an hour.", "avoid": [], "hasProp": null}, {"id": "biscuits", "name": "Refrigerated Biscuits (16 oz can, 8 biscuits)", "cal": 1394, "srv": 8, "cat": "grain", "tier": 2, "note": "Bake straight from the can in about 15 minutes.", "avoid": ["gluten", "dairy"], "hasProp": null}, {"id": "pita", "name": "Pita Bread (6 pitas)", "cal": 990, "srv": 6, "cat": "grain", "tier": 2, "note": "Warm or toast it. Good for scooping beans and in salads.", "avoid": ["gluten"], "hasProp": null}, {"id": "lemons", "name": "Lemons (2)", "cal": 34, "srv": 4, "cat": "pantry", "tier": 2, "note": "A squeeze brightens fish, beans and salads.", "avoid": [], "hasProp": null}, {"id": "groundpork", "name": "Ground Pork (1 lb)", "cal": 1194, "srv": 4, "cat": "protein", "tier": 2, "note": "Brown it with garlic for noodles, or season it for breakfast sausage.", "avoid": ["meat"], "hasProp": null}, {"id": "frozenburritos", "name": "Frozen Beef and Bean Burritos (8 pack)", "cal": 2710, "srv": 4, "cat": "protein", "tier": 2, "note": "Ready in minutes. Two make a filling meal.", "avoid": ["meat", "gluten", "dairy"], "hasProp": null}, {"id": "jalapenos", "name": "Pickled Jalapeño Slices (12 oz jar)", "cal": 92, "srv": 12, "cat": "vegetable", "tier": 2, "note": "Adds heat to beans, eggs and casseroles.", "avoid": [], "hasProp": null}];
export const RECIPE_NUTRITION = {"catfish": {"fdc": 175165, "g": 454, "kcal": 540, "protein": 69.0, "fiber": 0.0}, "kimchi": {"fdc": 170392, "g": 454, "kcal": 68, "protein": 5.0, "fiber": 7.3}, "feta": {"fdc": 173420, "g": 170, "kcal": 450, "protein": 24.1, "fiber": 0.0}, "tofu": {"fdc": 172475, "g": 397, "kcal": 572, "protein": 68.7, "fiber": 9.1}, "favabeans": {"fdc": 173754, "g": 425, "kcal": 302, "protein": 23.2, "fiber": 15.7}, "blackeyedpeas": {"fdc": 173758, "g": 454, "kcal": 1525, "protein": 106.7, "fiber": 48.1}, "biscuits": {"fdc": 172668, "g": 454, "kcal": 1394, "protein": 30.2, "fiber": 3.2}, "pita": {"fdc": 174915, "g": 360, "kcal": 990, "protein": 32.8, "fiber": 7.9}, "lemons": {"fdc": 167746, "g": 116, "kcal": 34, "protein": 1.3, "fiber": 3.2}, "groundpork": {"fdc": 167902, "g": 454, "kcal": 1194, "protein": 76.7, "fiber": 0.0}, "frozenburritos": {"fdc": 173335, "g": 1134, "kcal": 2710, "protein": 82.3, "fiber": 47.6}, "jalapenos": {"fdc": 170080, "g": 340, "kcal": 92, "protein": 3.1, "fiber": 8.8}};
export const RECIPE_PRICES = {"catfish": 4.47, "kimchi": 7.99, "feta": 4.63, "tofu": 3.2, "favabeans": 2.94, "blackeyedpeas": 1.76, "biscuits": 2.41, "pita": 3.03, "lemons": 1.31, "groundpork": 5.41, "frozenburritos": 11.11, "jalapenos": 1.3};
export const RECIPE_PRICE_SOURCES = {
 "catfish": {
  "kind": "estimate",
  "source": "USDA ERS Purchase to Plate 2017–18 gives only a cooked price, “Catfish, baked or broiled, no added fat” (26107123): $0.8862 per 100 g cooked. Converted to the as-bought price with USDA calories (144 kcal cooked vs 119 raw per 100 g), brought to September 2026 with the BLS CPI-U food-at-home index. Approximate: fish loses water as it cooks, so this conversion is rougher than for packaged foods."
 },
 "kimchi": {
  "kind": "estimate",
  "source": "USDA ERS Purchase to Plate National Average Prices 2017–18, “Kimchi” (75502520): $1.3073 per 100 g, brought to September 2026 with the BLS CPI-U food-at-home index."
 },
 "feta": {
  "kind": "estimate",
  "source": "USDA ERS Purchase to Plate National Average Prices 2017–18, “Cheese, Feta” (14104400): $2.0222 per 100 g, brought to September 2026 with the BLS CPI-U food-at-home index."
 },
 "tofu": {
  "kind": "estimate",
  "source": "USDA ERS Purchase to Plate National Average Prices 2017–18, “Soybean curd (tofu)” (41420010): $0.5988 per 100 g, brought to September 2026 with the BLS CPI-U food-at-home index."
 },
 "favabeans": {
  "kind": "estimate",
  "source": "USDA ERS Purchase to Plate National Average Prices 2017–18, “Fava beans, cooked” (41102210): $0.5136 per 100 g, brought to September 2026 with the BLS CPI-U food-at-home index. Canned beans are already cooked, so USDA’s cooked price is used as is."
 },
 "blackeyedpeas": {
  "kind": "estimate",
  "source": "Priced from dry pinto beans ($1.79, engine/food-db.js national estimate) by USDA ERS Purchase to Plate 2017–18 price ratio: black-eyed peas (41300990) $0.2804 vs pinto beans (41103990) $0.2854 per 100 g cooked."
 },
 "biscuits": {
  "kind": "estimate",
  "source": "USDA ERS Purchase to Plate National Average Prices 2017–18, “Biscuit, from refrigerated dough” (52102040): $0.4161 per 100 g, brought to September 2026 with the BLS CPI-U food-at-home index. USDA prices the baked biscuit; 454 g of dough bakes to about 430 g (USDA calories: 307 kcal per 100 g dough, 324 baked)."
 },
 "pita": {
  "kind": "estimate",
  "source": "USDA ERS Purchase to Plate National Average Prices 2017–18, “Bread, pita” (51109100): $0.6259 per 100 g, brought to September 2026 with the BLS CPI-U food-at-home index."
 },
 "lemons": {
  "kind": "estimate",
  "source": "USDA ERS Purchase to Plate National Average Prices 2017–18, “Lemon, raw” (61113010): $0.8382 per 100 g, brought to September 2026 with the BLS CPI-U food-at-home index. 2 medium lemons, about 116 g of edible fruit (USDA portions)."
 },
 "groundpork": {
  "kind": "estimate",
  "source": "USDA ERS Purchase to Plate 2017–18 gives only a cooked price, “Pork, ground or patty, cooked” (22002000): $1.0003 per 100 g cooked. Converted to the as-bought price with USDA calories (297 kcal cooked vs 263 raw per 100 g), brought to September 2026 with the BLS CPI-U food-at-home index. Approximate: meat loses fat and water as it cooks, so this conversion is rougher than for packaged foods."
 },
 "frozenburritos": {
  "kind": "estimate",
  "source": "USDA ERS Purchase to Plate National Average Prices 2017–18, “Burrito with meat and beans; burrito, NFS” (58100120): $0.7283 per 100 g, brought to September 2026 with the BLS CPI-U food-at-home index. USDA has no price for frozen burritos; this is its price for a burrito with meat and beans, likely higher than a frozen multipack, so plans won’t come in under budget."
 },
 "jalapenos": {
  "kind": "estimate",
  "source": "USDA ERS Purchase to Plate National Average Prices 2017–18, “Pepper, hot, pickled” (75511040): $0.2850 per 100 g, brought to September 2026 with the BLS CPI-U food-at-home index."
 }
};
export const RECIPE_PRICES_AS_OF = '2026-11-19';
