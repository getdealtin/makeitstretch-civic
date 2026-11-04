# Make It Stretch: civic edition

One codebase, one settings file per city. **Austin is city #1** (FACE grant; internal program name *The Enough Project*).
The public brand is **Make It Stretch**.

Someone enters a grocery budget, how long it has to last, and how many people they're feeding. The tool
returns a shopping list and a day-by-day meal plan built to stretch it, plus local free-food help.
There's no login and no ads, and nothing is stored.

Build spec and decisions: *The Enough Project: Austin Build Spec & Requirements* (Claude Doc).

## Layout

```
engine/      The shared math. No DOM, no network, no city names.
  cart.js      4-phase Thrifty Food Plan cart optimizer (budget → cart)
  recipes.js   recipe matcher (cart → candidate recipes per meal)
  plan.js      meal planner with variety safeguards (recipes → weeks)
  shopping.js  shopping-list grouping + tips
  food-db.js   58-item food catalogue + regional fallback prices
  zip-map.js   zip3 → state/BLS region
cities/      One config card per city. Everything city-specific lives here.
  austin.js    Austin: tokens, price region, local resources, languages
  national.js  generic fallback for unknown domains
  index.js     registry + host → city resolver
server.js    Express: picks the city by Host, serves /theme.css, /api/config, /api/plan
public/      The UI (plain HTML/CSS/ES modules, no build step)
  i18n/en.js   all UI strings (add es.js in Phase 3)
data/        seed-recipes.json (161 recipes)
test/        engine + server tests (node:test, no dependencies)
  legacy/reference.cjs  frozen word-for-word copy of the live tool's math
```

## Run it

```bash
npm install
npm test
DEFAULT_CITY=austin npm run dev     # http://localhost:3000
```

Outside production, `?city=austin` or `?city=national` on any URL switches the city.

| Env var | Purpose |
|---|---|
| `DEFAULT_CITY` | City for hosts that match no card (`austin` on the Austin deploy) |
| `BLS_KEY` | Optional. Live BLS average prices (otherwise built-in May 2025 estimates) |
| `PORT` | Default 3000 |

## How the engine is protected

`test/legacy/reference.cjs` is a mechanical, word-for-word extraction of the math in the live tool
(`getdealtin/make-it-stretch` @ `5c47e04`). The tests run the new engine and that reference on a
360-case input grid and require identical carts, leftover money, calories and meal plans. Any accidental
change to the math fails the build. When we change the math on purpose (for example, the satiety
upgrade), we update the expected results in the same commit and say why.

## Adding a city

1. Copy `cities/austin.js` to `cities/<city>.js` and change the values: `hosts`, `place`, `disclaimer`,
   `branding.tokens`, `price_region`, `local_prices`, `languages`, `resources`.
2. Register it in `cities/index.js`.
3. Point the city's domain (e.g. `denver.makeitstretch.org`) at the same deploy.
4. `npm test` checks every card for required keys and color tokens.

No engine or UI code changes. If a city needs one, that's a sign the city's feature belongs on its config card.

## Guardrails

- **Not the City.** Austin's colors are matched, but the site never uses the City's logo, wordmark or seal,
  and every page says it is not an official City of Austin website.
- **No data collection yet.** Event logging comes back in Phase 4, after the privacy policy and schema
  are reset (spec §7). Until then nothing a visitor enters leaves the request.
- **Fonts are self-hosted** (Zilla Slab, Source Serif 4, Inter; SIL OFL), so no third-party requests.
- **WCAG 2.1 AA:** axe-core scans clean on every screen. Text green is `--green-text` (#236B46), because
  the brand green #2F8B5C is below 4.5:1 for text, so it's used only for accents.

## Build status

- [x] Phase 0: engine extracted, civic layer dropped, 360-case equivalence with the live tool
- [x] Phase 1: city config cards, host-based city selection, Austin theme, print packet (basic)
- [ ] Phase 2: question flow with blurred results preview
- [ ] Phase 3: Austin data (local prices, Data Steward capture, Spanish)
- [ ] Phase 4: privacy policy + events schema reset
- [ ] Phase 5: city reporting with k-anonymity
- [ ] Phase 6: full accessibility audit + offline packet
