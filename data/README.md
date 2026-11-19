# Data

- `seed-recipes.json`: 161 recipes, ported from the live Make It Stretch tool (no recorded source; the prototype called them an
  internal database). On Nov 19, 2026 (owner decision) every dish kept its name and got its real ingredients: 34 recipes were
  changed by `scripts/apply-seed-recipe-fixes.py` from `scripts/seed-recipe-fixes.json` (steps in all four languages). Main
  ingredients are priced foods; 10 new ones (catfish, kimchi, feta, tofu, fava beans, black-eyed peas, refrigerated biscuits,
  pita, lemons, ground pork) are priced from USDA ERS Purchase to Plate by `scripts/build-recipe-foods.py`
  (`engine/recipe-foods.js`). Small seasonings with no government price are a recipe's `extras`, shown as "You'll also need"
  and not counted in the total.
- `simple-meals.json`: 22 simple meals from everyday staples (rice, beans, eggs, oats, tortillas, bread, bananas, avocado), ids 2001+, written Nov 2026 so tight budgets get different meals from the same few foods.
- `zip-centroids.json`: zip → [latitude, longitude] at the center of each US Census ZIP Code
  Tabulation Area (33,791 zips). Extracted as plain data from the MIT-licensed
  [`us-zips`](https://www.npmjs.com/package/us-zips) package, version 2022.9.1 (© 2021 Blake Knight),
  which is built from Census ZCTA data. Used only to sort food sites by distance; a zip center is
  approximate, so "nearest" means "nearest zip area," not exact walking distance.
