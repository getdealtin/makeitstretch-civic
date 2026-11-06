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
| `SUPABASE_URL` | The `makeitstretch-civic` Supabase project (one database for every city) |
| `SUPABASE_SECRET_KEY` | Supabase secret key, server only. Without it the directory runs in memory (test mode) |
| `ADMIN_KEY` | Password for `/admin` |
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

## Food directory and admin

- **Providers sign up** at `/add-site`, or through a personal invite link `/join/<token>` made in `/admin`.
  Every submission, invite or not, waits in **Needs review** until approved. Contact details are private and
  never leave the admin API.
- **`/admin`** (password `ADMIN_KEY`, 30-day sign-in): needs review, overdue (not re-confirmed in 6 months),
  invite links with a ready-to-send email, the directory (add/edit/hide/restore), translation sign-off, and
  activity (fills in when Phase 4 tracking is on). A city picker covers every city in one database.
- Database schema: `db/schema.sql` (RLS on, public roles revoked; only the server's secret key can read or write).

## Languages

English, Español, Tiếng Việt and 中文 (Austin's top languages), with a switch at the top of every page.
- `public/i18n/<code>.js`: screen text (same keys as `en.js`).
- `public/i18n/data/<code>.json`: food names, notes, tips, ingredient words, all 161 recipes.
- `cities/<city>.js` → `i18n`: the city's own text (disclaimer, help listings).
- Translations are **display-only**: the engine works in English, so a plan is identical in every language
  and links/saved plans work across languages.
- Non-English text is a **draft until a native speaker signs off** in `/admin → Translations`.
- `npm test` fails if any phrase, food, tip, ingredient word or recipe is missing in any language.
- To add a language: copy those three pieces, add it to `LANGS` in `public/i18n/index.js` and to the city's
  `languages`, and add a row to `translation_reviews`.

## Known engine limits (deliberate, for later)

- The budget flow's recipe matcher (kept word-for-word from the live tool) misses multi-word ingredients:
  "canned tomatoes", "sweet potatoes", "peanut butter", "coconut milk" and "ground beef" never match the
  cart. The food-box matcher (`engine/box.js`) already uses a correct explicit map. Fixing the budget flow is
  a deliberate math change: update the reference and goldens in the same commit.
- The cart buys one of almost every item in each category's budget (40+ line items). See the "fewer,
  larger items" decision in the build spec.

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
      secondary suppression, limits section, print/PDF + CSV), CTFB directory CSV, `?src=` source tags,
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
