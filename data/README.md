# Data

- `seed-recipes.json`: 161 recipes, ported from the live Make It Stretch tool.
- `simple-meals.json`: 22 simple meals from everyday staples (rice, beans, eggs, oats, tortillas, bread, bananas, avocado), ids 2001+, written Nov 2026 so tight budgets get different meals from the same few foods.
- `zip-centroids.json`: zip → [latitude, longitude] at the center of each US Census ZIP Code
  Tabulation Area (33,791 zips). Extracted as plain data from the MIT-licensed
  [`us-zips`](https://www.npmjs.com/package/us-zips) package, version 2022.9.1 (© 2021 Blake Knight),
  which is built from Census ZCTA data. Used only to sort food sites by distance; a zip center is
  approximate, so "nearest" means "nearest zip area," not exact walking distance.
