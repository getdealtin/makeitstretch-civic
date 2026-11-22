"""Build the foods the original 161 recipes need for their real ingredients (owner decision, Nov 19 2026).

The 161 recipes ported from the live tool (data/seed-recipes.json) had been simplified to the foods on its price
list (catfish became canned tuna, kimchi fried rice had no kimchi). The owner chose to keep every dish and give it
its real ingredients: a main ingredient goes on the shopping list with a government price, using a store-bought
shortcut where one is cheap and common (refrigerated biscuits); a small seasoning with no government price goes
under "You'll also need" (the recipe's `extras`), not in the total.

Writes engine/recipe-foods.js: each new food's package, USDA nutrition, national price and where the price comes
from, in the same form as engine/extra-foods.js (scripts/build-nih-recipes.py).

Sources:
  • Nutrition: USDA FoodData Central, SR Legacy (fdc id per food; per 100 g kcal, protein, fiber as published).
  • Prices: USDA ERS Purchase to Plate National Average Prices for NHANES (PP-NAP 2017–18, price per 100 edible
    grams), https://www.ers.usda.gov/data-products/purchase-to-plate (csv, March 2023 release), brought to
    Sept 2026 with BLS CPI-U food at home (CUUR0000SAF11: 2017–18 average 239.125, Sept 2026 321.758), the same
    method as engine/extra-foods.js.

Run: python3 -I scripts/build-recipe-foods.py [path/to/pp_national_average_prices_csv.csv]
     With the csv, every PP-NAP price below is checked against USDA's file first.
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CPI_NOW, CPI_1718 = 321.758, 239.125
F1718 = CPI_NOW / CPI_1718
CPI_LABEL = 'brought to September 2026 with the BLS CPI-U food-at-home index'
PRICES_AS_OF = '2026-11-19'  # frozen burritos and jalapeños added Nov 22 2026, same 2017–18 file and CPI
CHECKS = []  # (food_code, price per 100 g) to verify against USDA's file


def ppnap(per100, grams, code, what, extra=''):
    CHECKS.append((code, per100))
    return (round(per100 * grams / 100 * F1718, 2), 'estimate',
            f'USDA ERS Purchase to Plate National Average Prices 2017–18, “{what}” ({code}): ${per100:.4f} per 100 g, {CPI_LABEL}.{extra}')


def cooked(per100, kcal_cooked, kcal_raw, grams, code, what, extra=''):
    """USDA prices some foods only as eaten (cooked): convert to the as-bought price by calories (water lost)."""
    CHECKS.append((code, per100))
    raw = per100 * kcal_raw / kcal_cooked
    return (round(raw * grams / 100 * F1718, 2), 'estimate',
            f'USDA ERS Purchase to Plate 2017–18 gives only a cooked price, “{what}” ({code}): ${per100:.4f} per 100 g cooked. '
            f'Converted to the as-bought price with USDA calories ({kcal_cooked} kcal cooked vs {kcal_raw} raw per 100 g), {CPI_LABEL}.{extra}')


def relative(base_price, base_label, ratio_codes, what):
    """No usable direct price: priced from a food we already price, by USDA's own price ratio between the two."""
    (c1, p1), (c2, p2) = ratio_codes
    CHECKS.extend(ratio_codes)
    return (round(base_price * p1 / p2, 2), 'estimate',
            f'Priced from {base_label} (${base_price:.2f}, engine/food-db.js national estimate) by USDA ERS Purchase to Plate 2017–18 '
            f'price ratio: {what} ({c1}) ${p1:.4f} vs pinto beans ({c2}) ${p2:.4f} per 100 g cooked.')


# id: (name (package), edible grams per package, servings per package, category, leave-out tags, note,
#      FDC id, per-100 g kcal, protein, fiber (SR Legacy), (price, kind, source))
FOODS = {
  'catfish':     ('Catfish Fillets, Frozen (1 lb)', 454, 4, 'protein', ['fish', 'meat'],
                  'Mild and quick. Coat in cornmeal and fry, or bake.',
                  175165, 119, 15.2, 0,
                  cooked(0.886224, 144, 119, 454, '26107123', 'Catfish, baked or broiled, no added fat',
                         ' Approximate: fish loses water as it cooks, so this conversion is rougher than for packaged foods.')),
  'kimchi':      ('Kimchi (16 oz jar)', 454, 6, 'vegetable', ['fish', 'meat'],
                  'Spicy fermented cabbage. Most brands contain fish sauce; vegan kimchi says so on the label.',
                  170392, 15, 1.1, 1.6,
                  ppnap(1.307301, 454, '75502520', 'Kimchi')),
  'feta':        ('Feta Cheese, Crumbled (6 oz)', 170, 6, 'dairy', ['dairy'],
                  'Salty and tangy. A little goes a long way.',
                  173420, 265, 14.2, 0,
                  ppnap(2.02222, 170, '14104400', 'Cheese, Feta')),
  'tofu':        ('Firm Tofu (14 oz)', 397, 4, 'protein', [],
                  'Press out the water, then fry or stir-fry. A cheap plant protein.',
                  172475, 144, 17.3, 2.3,
                  ppnap(0.598821, 397, '41420010', 'Soybean curd (tofu)')),
  'favabeans':   ('Canned Fava Beans (15 oz)', 425, 3, 'protein', [],
                  'Also sold as “ful.” The base of ful medames.',
                  173754, 71, 5.47, 3.7,
                  ppnap(0.513629, 425, '41102210', 'Fava beans, cooked',
                        ' Canned beans are already cooked, so USDA’s cooked price is used as is.')),
  'blackeyedpeas': ('Dry Black-Eyed Peas (1 lb)', 454, 10, 'protein', [],
                  'No overnight soak needed. Cooks in about an hour.',
                  173758, 336, 23.5, 10.6,
                  relative(1.79, 'dry pinto beans', (('41300990', 0.280443), ('41103990', 0.285413)), 'black-eyed peas')),
  'biscuits':    ('Refrigerated Biscuits (16 oz can, 8 biscuits)', 454, 8, 'grain', ['gluten', 'dairy'],
                  'Bake straight from the can in about 15 minutes.',
                  172668, 307, 6.66, 0.7,
                  ppnap(0.416143, 430, '52102040', 'Biscuit, from refrigerated dough',
                        ' USDA prices the baked biscuit; 454 g of dough bakes to about 430 g (USDA calories: 307 kcal per 100 g dough, 324 baked).')),
  'pita':        ('Pita Bread (6 pitas)', 360, 6, 'grain', ['gluten'],
                  'Warm or toast it. Good for scooping beans and in salads.',
                  174915, 275, 9.1, 2.2,
                  ppnap(0.625877, 360, '51109100', 'Bread, pita')),
  'lemons':      ('Lemons (2)', 116, 4, 'pantry', [],
                  'A squeeze brightens fish, beans and salads.',
                  167746, 29, 1.1, 2.8,
                  ppnap(0.838227, 116, '61113010', 'Lemon, raw', ' 2 medium lemons, about 116 g of edible fruit (USDA portions).')),
  'groundpork':  ('Ground Pork (1 lb)', 454, 4, 'protein', ['meat'],
                  'Brown it with garlic for noodles, or season it for breakfast sausage.',
                  167902, 263, 16.9, 0,
                  cooked(1.000337, 297, 263, 454, '22002000', 'Pork, ground or patty, cooked',
                         ' Approximate: meat loses fat and water as it cooks, so this conversion is rougher than for packaged foods.')),
  # Store-bought foods neighbors cook with (owner decision, Nov 22 2026: the first community recipe, a burrito
  # casserole, used them; canned chili was already on the list). Tagged conservatively: brands vary.
  'frozenburritos': ('Frozen Beef and Bean Burritos (8 pack)', 1134, 4, 'protein', ['meat', 'gluten', 'dairy'],
                  'Ready in minutes. Two make a filling meal.',
                  173335, 239, 7.26, 4.2,
                  ppnap(0.72831, 1134, '58100120', 'Burrito with meat and beans; burrito, NFS',
                        ' USDA has no price for frozen burritos; this is its price for a burrito with meat and beans, likely higher than a frozen multipack, so plans won’t come in under budget.')),
  'jalapenos':   ('Pickled Jalapeño Slices (12 oz jar)', 340, 12, 'vegetable', [],
                  'Adds heat to beans, eggs and casseroles.',
                  170080, 27, 0.92, 2.6,
                  ppnap(0.285019, 340, '75511040', 'Pepper, hot, pickled')),
}


def check_against_usda(path):
    rows = {(r['food_code']): float(r['price_100gm']) for r in csv.DictReader(open(path, encoding='latin-1'))
            if r['year'] == '2017/2018' and r['price_100gm'] not in ('', 'NA')}
    for code, price in CHECKS:
        if code not in rows or abs(rows[code] - price) > 1e-6:
            raise SystemExit(f'PP-NAP {code}: file says {rows.get(code)}, script says {price}')
    print(f'{len(CHECKS)} PP-NAP prices match USDA’s file.')


def main():
    if len(sys.argv) > 1:
        check_against_usda(sys.argv[1])
    foods, nutrition, prices, sources = [], {}, {}, {}
    for fid, (name, g, srv, cat, avoid, note, fdc, kcal, prot, fib, (price, kind, src)) in FOODS.items():
        nutrition[fid] = {'fdc': fdc, 'g': g, 'kcal': round(kcal * g / 100), 'protein': round(prot * g / 100, 1), 'fiber': round(fib * g / 100, 1)}
        prices[fid] = price
        sources[fid] = {'kind': kind, 'source': src}
        foods.append({'id': fid, 'name': name, 'cal': nutrition[fid]['kcal'], 'srv': srv, 'cat': cat, 'tier': 2, 'note': note,
                      'avoid': avoid, 'hasProp': None})
    js = ['// Built by scripts/build-recipe-foods.py: do not edit by hand. Foods the original 161 recipes need for their',
          '// real ingredients (owner decision, Nov 19 2026). Same form as engine/extra-foods.js.',
          '// Nutrition: USDA FoodData Central SR Legacy (fdc id), per package of g edible grams.',
          '// Prices: national estimates from USDA ERS Purchase to Plate, each with its source.',
          f'export const RECIPE_FOODS = {json.dumps(foods, ensure_ascii=False)};',
          f'export const RECIPE_NUTRITION = {json.dumps(nutrition)};',
          f'export const RECIPE_PRICES = {json.dumps(prices)};',
          f'export const RECIPE_PRICE_SOURCES = {json.dumps(sources, ensure_ascii=False, indent=1)};',
          f"export const RECIPE_PRICES_AS_OF = '{PRICES_AS_OF}';", '']
    (ROOT / 'engine' / 'recipe-foods.js').write_text('\n'.join(js), encoding='utf-8')
    for fid in FOODS:
        print(f'{fid:14} ${prices[fid]:5.2f}  {FOODS[fid][0]}')


if __name__ == '__main__':
    main()
