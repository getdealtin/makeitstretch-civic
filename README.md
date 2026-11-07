# Make It Stretch: civic edition

One codebase, one settings file per city. **Austin is city #1** (FACE grant; internal program name *The Enough Project*).
The public brand is **Make It Stretch**.

Two ways in:
- **Plan my grocery budget:** budget, how long it has to last, household size. Returns a shopping list and a
  day-by-day meal plan built to stretch it. A blurred, real preview of the plan sharpens under each question.
- **I have a food box:** tap what's in the box. Returns meals you can make, ranked by how much of the box
  each uses, with "you'll also need: …" for anything missing.

Both end with local free-food help: approved local food sites (nearest the zip first) plus city-wide resources. There's no login and no ads, and nothing is stored on our side.

**Keep this plan** (no account): *Save on this phone* (browser storage, opt-in), *Text it to me* /
*Email it to me* (opens the person's own app, prefilled), and *Copy link*. The plan's inputs, swaps and
checkmarks are packed into the URL after `#`, which browsers never send to the server; the deterministic
engine rebuilds the identical plan from it (`public/keep.js`). Links are treated as untrusted input and
cleaned on the way in. Email sign-up and profiles are deliberately left for the connector opt-in step
(build spec §5), where identity and consent are designed once.

Build spec and decisions: *The Enough Project: Austin Build Spec & Requirements* (Claude Doc).

## Layout

```
engine/      The shared math. No DOM, no network, no city names.
  cart.js      4-phase Thrifty Food Plan cart optimizer (budget → cart)
  recipes.js   recipe matcher (cart → candidate recipes per meal)
  plan.js      meal planner with variety safeguards (recipes → weeks)
  shopping.js  shopping-list grouping + tips
  box.js       food-box mode: box items → meals you can make (explicit ingredient map)
  food-db.js   58-item food catalogue + regional fallback prices
  zip-map.js   zip3 → state/BLS region
cities/      One config card per city. Everything city-specific lives here.
  austin.js    Austin: tokens, price region, local resources, languages
  national.js  generic fallback for unknown domains
  index.js     registry + host → city resolver
server.js    Express: picks the city by Host. Serves /theme.css, /api/config, /api/plan, and
             /api/prices + /api/recipes + /engine/ so the engine also runs in the browser
public/      The UI (plain HTML/CSS/ES modules, no build step)
  keep.js      save / text / email / link a plan without an account
  i18n/en.js   all UI strings (add es.js in Phase 3)
data/        seed-recipes.json (161 recipes), nih-recipes.json (25 NHLBI main dishes, built by scripts/build-nih-recipes.py)
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
| `SUPABASE_URL` | The `makeitstretch-civic` Supabase project (one database for every city) |
| `SUPABASE_SECRET_KEY` | Supabase secret key, server only. Without it the directory runs in memory (test mode) |
| `ADMIN_KEY` | Password for `/admin` |
| `PORT` | Default 3000 |

## How the plan is built (meals first, Nov 2026)

`engine/meals.js` plans meals first and builds the shopping list from them:

1. **Meals.** For breakfast, lunch and dinner, a short menu of recipes (up to 3, 4 and 5) that fit the
   foods left out, the diets followed, the cuisines chosen and what's already at home. A recipe is only used
   if every ingredient can be priced or is in any kitchen (salt, water, cinnamon).
2. **List.** People × meals × a standard serving of each food (servings per package in `food-db.js`;
   onions, garlic, oil, butter and soy sauce count as part of a serving). The NHLBI main dishes use their
   printed amounts instead (grams per serving). Packages are rounded up once per
   food, so a shared food is bought once. Every meal can be cooked from the list.
3. **Budget.** Start from the most filling menu per dollar, add a fruit a day, top up with filling sides only
   until about 2,000 calories per person per day, then spend what's left on better meals (more protein,
   vegetables, fruit; no more than 2 menu meals on the same meat, fish or eggs) and on food groups (a vegetable
   side, a second fruit, a cup of milk). Money still left is shown as left over, not spent on more of one food.
4. **Tight budgets.** Fewer different meals first, then fewer days; the plan says how many days it covers.
5. **Variety cap (owner decision Nov 7).** No ingredient in more than about 1 in 4 cooked meals (rice, beans,
   onions, oil and garlic exempt). On the very tightest budgets, where the plan falls back to one breakfast,
   the cap can't always be met; the planner gets as close as it can.
6. **One list per week (owner decision Nov 7)** for plans longer than a week: each week buys what its meals
   need beyond what's left from earlier weeks (a bottle of oil once; fresh food when it's eaten).
7. **Shorter list (owner decision Nov 7).** Plans open on full variety; "Show a shorter list" repeats fewer
   different meals (2 breakfasts, 2 lunches, 3 dinners). Offered only when it means fewer items.
8. **Agency.** Each meal has one alternative that keeps the plan within budget. Swapping rebuilds the list
   (`rebuildList`); if many swaps together cost more, the extras give way first, then the plan says by how much.

Diets live in `engine/diets.js` and apply to both the plan and the food box: pork (also left out by halal and
kosher), kosher keeps meat and dairy apart, low sodium leaves out salty packaged foods and soy-sauce recipes,
less sugar leaves out dried mango and canned peaches. Each diet shows a note with the plan saying what was done
and what to check yourself. Tests: `test/meals.test.js`.

### NHLBI main dishes (owner decisions Nov 7)

25 main dishes from two public-domain NHLBI cookbooks: *Delicious Heart-Healthy Latino Recipes* (2024, with
NHLBI's own Spanish) and *Heart-Healthy Home Cooking African American Style* (2021). Built by
`scripts/build-nih-recipes.py` from the books' text (`pdftotext -raw`), which checks every ingredient line,
note and extra word for word, in order, and takes the steps from the book itself (the books' own typos kept).
Each recipe is credited, with no endorsement implied. Each ingredient line is a bought food with grams (USDA
FoodData Central portions), a kitchen basic shown as "You'll also need" (spices, condiments, broth, fresh
herbs, citrus), or salt and water. Spanish for the African American–style book, and all Vietnamese and Chinese,
are our drafts (`scripts/nih-translations/`).

The 25 foods they added (`engine/extra-foods.js`, `recipeOnly`) each record their price source: 5 live BLS
series (chicken breast, drumsticks, sirloin, round roast, tomatoes); USDA ERS estimates (Purchase to Plate
2017–18, Fruit and Vegetable Prices 2023) brought to Sept 2026 with the BLS CPI-U food-at-home index; four
labeled stand-ins (generic fish for tilapia, croutons for bread crumbs, canned tomatoes for tomato sauce, cooked
hominy for canned); quinoa and ground turkey converted from cooked prices with USDA calories (turkey marked
approximate); masa harina and brown rice at H-E-B Austin shelf prices checked by the owner (USDA's cooked
prices didn't hold up). `/admin → Annual updates` reminds you to refresh them. Tests: `test/nih.test.js`.

The old cart builder (`engine/cart.js`, a word-for-word port of the live tool, checked against
`test/legacy/reference.cjs` on a 360-case grid) is no longer used for plans; it stays for its tests and for
the shared price and store helpers.

## Adding a city

1. Copy `cities/austin.js` to `cities/<city>.js` and change the values: `hosts`, `place`, `disclaimer`,
   `branding.tokens`, `price_region`, `local_prices`, `languages`, `resources`.
2. Register it in `cities/index.js`.
3. Point the city's domain (e.g. `denver.makeitstretch.org`) at the same deploy.
4. `npm test` checks every card for required keys and color tokens.

No engine or UI code changes. If a city needs one, that's a sign the city's feature belongs on its config card.

## Food directory and admin

- **Providers sign up** at `/add-site`, or through a personal invite link `/join/<token>` made in `/admin`.
  Every submission, invite or not, waits in **Needs review** until approved. Contact details are private and
  never leave the admin API.
- **`/admin`** (password `ADMIN_KEY`, 30-day sign-in): needs review, overdue (not re-confirmed in 6 months),
  invite links with a ready-to-send email, the directory (add/edit/hide/restore), translation sign-off, and
  activity (fills in when Phase 4 tracking is on). A city picker covers every city in one database.
- **Annual updates** (`/admin`, `server/maintenance.js`): the facts that go out of date (USDA store list, Thrifty
  Food Plan, SNAP average benefit, BLS series codes, Food Access Research Atlas, help links, farmers market notes),
  each with its last-updated date, next due date and how to update it. Items due within a month show at the top
  of `/admin`. After updating one, change its date (named in the item) and the reminder resets.
- **Open data feed** (`/api/hsds`, `server/hsds.js`): the help listings and approved food sites in Open Referral's
  HSDS 3.3.1 with the HSDS API endpoints (`/services`, `/organizations`, `/service_at_locations`, `/taxonomies`,
  `/taxonomy_terms`), so 2-1-1, food banks and other HSDS systems can take them without retyping. Public fields
  only, never contact details. Categories use Open Eligibility (`server/taxonomy.js`, data built by
  `scripts/build-open-eligibility.py`), which also labels the needs in the City report and its CSV
  (`open_eligibility` column). Output was checked against HSDS's own schema files. Sign-ups give a city with any street address
  (required then), so locations carry a full HSDS address.
- **Council districts** (`data/zip-districts.json`, `scripts/build-zip-districts.py`): how each ZIP's 2020 residents
  split across City Council districts, from the City's district boundaries and 2020 Census block populations. The
  City report shows people, below-SNAP plans and needs by district as estimates (grant area: Districts 1–4).
- **Needs signal**: for each need, who asked and whether they opened a source shown for it (City/County program,
  directory site, or 2-1-1), gaps by ZIP and district, and how many sources are listed per need.
- Database schema: `db/schema.sql` (RLS on, public roles revoked; only the server's secret key can read or write).

## Languages

English, Español, Tiếng Việt and 中文 (Austin's top languages), with a switch at the top of every page.
- `public/i18n/<code>.js`: screen text (same keys as `en.js`).
- `public/i18n/data/<code>.json`: food names, notes, tips, ingredient words, all 161 recipes, the NHLBI recipes line by line (official Spanish where NHLBI publishes it).
- `cities/<city>.js` → `i18n`: the city's own text (disclaimer, help listings).
- Translations are **display-only**: the engine works in English, so a plan is identical in every language
  and links/saved plans work across languages.
- Non-English text is a **draft until a native speaker signs off** in `/admin → Translations`.
- `npm test` fails if any phrase, food, tip, ingredient word or recipe is missing in any language.
- To add a language: copy those three pieces, add it to `LANGS` in `public/i18n/index.js` and to the city's
  `languages`, and add a row to `translation_reviews`.

## Known engine limits (deliberate, for later)

- The 161 seed recipes list ingredients without amounts, so amounts use a standard serving per food (the NHLBI dishes use real amounts). Good for a shopping
  list; not a substitute for a recipe's own measurements.
- Calories use one reference (2,000 per person per day) for everyone; children and adults differ.
- Diets are rules we can apply honestly (see above), not certification or medical advice; the notes say so.

## Guardrails

- **Not the City.** Austin's colors are matched, but the site never uses the City's logo, wordmark or seal,
  and every page says it is not an official City of Austin website.
- **Anonymous activity only** (Phase 4). `server/events.js` holds a fixed schema per event; unknown events
  and fields are dropped, and no event type can carry a name, email, phone, address or IP. The IP is used in
  memory for spam limits only. A random per-visit code links one visit's events and is never stored on the
  device. Raw events are deleted after 24 months (`db/phase4-events.sql`); `/privacy` says exactly this.
- **Fonts are self-hosted** (Zilla Slab, Source Serif 4, Inter; SIL OFL), so no third-party requests.
- **WCAG 2.1 AA:** axe-core scans clean on every screen. Text green is `--green-text` (#236B46), because
  the brand green #2F8B5C is below 4.5:1 for text, so it's used only for accents.

## Build status

- [x] Phase 0: engine extracted, civic layer dropped, 360-case equivalence with the live tool
- [x] Phase 1: city config cards, host-based city selection, Austin theme, print packet (basic)
- [x] Phase 2: two doors (budget / food box), blurred live preview, one-page results with jump links,
      compact list, one week at a time with meal swap, store question reworded around food access
- [x] Phase 3: four languages with a visible switch; own food directory with invite links, review queue,
      6-month re-confirm; `/admin` page; new Supabase project
- [ ] Data Stewards: local shelf-price capture (moved to its own phase)
- [x] Phase 4: anonymous activity events (strict schema), /privacy in four languages, admin Activity,
      "can't use this" in food boxes, box value, return visits, halal/kosher/diabetic/low-sodium notes
- [x] Phase 5: City report in /admin (by Food Plan goal, people-based counts, cells under 15 hidden plus
      secondary suppression, limits section, print/PDF + CSV), directory CSV download, `?src=` source tags,
      "Don't count this browser", "Did you use this plan?" on return visits
      Report is multi-city: shared measures in `server/report.js` (METRICS); each city's card can set
      `report: { title, labels, sections: [{ goal, intro, metrics }] }` (Austin maps to its Food Plan
      goals), otherwise the neutral DEFAULT_FRAMEWORK is used. Resources carry `role: 'benefits' | 'food_help'`.
- [x] Home redesign (Nov 5): warm illustrated start screen (hero + two doors, how it works, green band) in all
      four languages; makeitstretch.org landing page (`public/landing.html`, served for the bare domain by host)
- [x] Plan home + Where to shop (Nov 6): results open on a "plan home" of cards (shopping list, meals, where to shop,
      free food & help, other help) with live summaries; each opens on its own with "Back to my plan" (phone back works,
      ticks kept; print shows everything). Where to shop lists the nearest SNAP-authorized grocery stores and farmers
      markets from USDA's list (data/snap-stores-travis.json, built by scripts/build-snap-stores.py; as of Dec 31, 2025),
      with chips (Takes SNAP; WIC / Double Up / hours only where verified), directions, CapMetro trip planner, and the
      Texas WIC store finder. City report adds food-retail findings (focus ZIPs vs rest of Travis County).
- [x] Needs beyond food (Nov 6): after the plan, "Need help with anything else?" (rent & utilities, health care,
      child care & school, jobs & getting around) shows verified City/County sources, approved directory listings
      that offer that help, and 2-1-1. Anonymous need_tapped counts feed the City report. No contact info, no follow-up.
- [x] Phase 6: accessibility audit (scripts/a11y-audit.cjs: every screen x 4 languages, WCAG 2.2 AA, keyboard,
      320px reflow, text spacing, titles, forced colors) and the print packet: "Print or save as PDF" on any plan
      gives shopping checklist + week of meals + every recipe + local help + QR back to the plan (~4 pages);
      /packet lets library and pantry staff print packets for a household and weekly budget in any language
      (staff visits aren't counted; scans from a packet count under the `packet` source tag)
