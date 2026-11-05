# Data

- `seed-recipes.json`: 161 recipes, ported from the live Make It Stretch tool.
- `zip-centroids.json`: zip → [latitude, longitude] at the center of each US Census ZIP Code
  Tabulation Area (33,791 zips). Extracted as plain data from the MIT-licensed
  [`us-zips`](https://www.npmjs.com/package/us-zips) package, version 2022.9.1 (© 2021 Blake Knight),
  which is built from Census ZCTA data. Used only to sort food sites by distance; a zip center is
  approximate, so "nearest" means "nearest zip area," not exact walking distance.
