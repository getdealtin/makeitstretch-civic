"""Build the NIH main dishes and the foods they need (owner decisions, Nov 7 2026).

Writes:
  engine/extra-foods.js   25 new foods: package, USDA nutrition, national price and where each price comes from
  data/nih-recipes.json   25 main dishes, word for word from two NHLBI cookbooks, with the official Spanish
                          for the Latino book; each ingredient line mapped to a food and grams, or marked as a
                          kitchen basic ("You'll also need")
  public/i18n/data/*.json recipe and food translations (official Spanish from the Latino book; our drafts for the
                          rest, from scripts/nih-translations/<lang>.json)

Sources (public domain, U.S. government works; credited on every recipe, no endorsement implied):
  • NHLBI, "Delicious Heart-Healthy Latino Recipes / Platillos latinos ¡sabrosos y saludables!",
    NIH Publication No. 24-HL-4049S, April 2024.
    https://www.nhlbi.nih.gov/resources/delicious-heart-healthy-latino-recipes-book-platillos-latinos-sabrosos-y-saludables
    PDF: https://www.nhlbi.nih.gov/sites/default/files/publications/Your_Heart_Your_Life_Recipe_Book.pdf
  • NHLBI, "Heart-Healthy Home Cooking African American Style", NIH Publication No. 21-HL-3792, February 2021.
    https://www.nhlbi.nih.gov/health-topics/all-publications-and-resources/heart-healthy-home-cooking-african-american-style
    PDF: https://www.nhlbi.nih.gov/sites/default/files/publications/WEHL-RecipeBook_508.pdf
  • Nutrition: USDA FoodData Central, SR Legacy (fdc id per food; grams per cup or piece from its portions).
  • Prices (each food says which): BLS Average Price series (live, server/prices.js); USDA ERS Fruit and Vegetable
    Prices (2023) and Purchase to Plate National Average Prices (PP-NAP, 2017–18), brought to Sept 2026 with BLS
    CPI-U food at home (CUUR0000SAF11: 2017–18 average 239.125, 2023 302.900, Sept 2026 321.758); two prices
    checked by the site owner at H-E-B in Austin on Nov 7 2026.

Word for word: every ingredient line, note and extra is checked against the book text, in order, and the steps
are taken from the book text itself. Only line breaks are undone (a word broken across lines is rejoined). The
books' own typos are kept ("tand", "vegettable"), as printed.

Run: pdftotext -raw <book>.pdf <book>_raw.txt   (poppler), for both books, then
     python3 -I scripts/build-nih-recipes.py <latino_raw.txt> <aa_raw.txt>
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LB = 453.6
CPI_NOW, CPI_1718, CPI_2023 = 321.758, 239.125, 302.900
F1718, F2023 = CPI_NOW / CPI_1718, CPI_NOW / CPI_2023
CPI_LABEL = 'brought to September 2026 with the BLS CPI-U food-at-home index'

# ── New foods ──────────────────────────────────────────────────────────────────────────────────────
# id: name (package), edible grams per package, servings per package, category, leave-out tags, note,
#     FDC id and per-100 g kcal / protein / fiber (SR Legacy), price and its source.
def bls(per_lb, units, sid, what):
    return round(per_lb * units, 2), 'live', f'BLS Average Price {sid} ({what}), Sept 2026: ${per_lb:.3f} per lb. Updates live with the other BLS foods.'
def ers(per_lb, lbs, what):
    return round(per_lb * lbs * F2023, 2), 'estimate', f'USDA ERS Fruit and Vegetable Prices, {what}, 2023: ${per_lb:.2f} per lb, {CPI_LABEL}.'
def ppnap(per100, grams, code, what, extra=''):
    return round(per100 * grams / 100 * F1718, 2), 'estimate', f'USDA ERS Purchase to Plate National Average Prices 2017–18, “{what}” ({code}): ${per100:.4f} per 100 g, {CPI_LABEL}.{extra}'
def cooked(per100, kcal_cooked, kcal_dry, grams, code, what, extra=''):
    dry = per100 * kcal_dry / kcal_cooked
    return round(dry * grams / 100 * F1718, 2), 'estimate', (f'USDA ERS Purchase to Plate 2017–18 gives only a cooked price, “{what}” ({code}): ${per100:.4f} per 100 g cooked. '
        f'Converted to the as-bought price with USDA calories ({kcal_cooked} kcal cooked vs {kcal_dry} raw per 100 g), {CPI_LABEL}.{extra}')
def store(price, what):
    return price, 'store', f'Shelf price checked by the site owner at H-E-B, Austin, Nov 7 2026: {what}.'

FOODS = {
  'chickenbreast': ('Chicken Breast, Boneless (1 lb)', 454, 4, 'protein', ['meat'], 'Lean and quick to cook. Cut into strips to stretch it.',
                    171077, 120, 22.5, 0, bls(4.203, 1, 'APU0000FF1101', 'chicken breast, boneless')),
  'drumsticks':    ('Chicken Drumsticks (2 lb)', 680, 6, 'protein', ['meat'], 'Bone-in and cheap. About 8 drumsticks.',
                    172373, 161, 18.1, 0, bls(1.739, 2, 'APU0000706212', 'chicken legs, bone-in; includes drumsticks')),
  'sirloin':       ('Sirloin Steak (1 lb)', 454, 4, 'protein', ['meat'], 'Slice thin and stir-fry with lots of vegetables.',
                    168728, 214, 19.9, 0, bls(14.106, 1, 'APU0000703613', 'steak, sirloin, USDA choice, boneless')),
  'roundroast':    ('Beef Round Roast (2 lb)', 907, 8, 'protein', ['meat'], 'Lean beef. Cube it for stews and cook it low and slow.',
                    171746, 127, 23.3, 0, bls(8.795, 2, 'APU0000703311', 'beef roasts, round, USDA choice, boneless')),
  'tomatoes':      ('Fresh Tomatoes (1 lb, about 3)', 413, 3, 'vegetable', [], 'Use ripe ones first. Keep on the counter, not the fridge.',
                    170457, 18, 0.88, 1.2, bls(1.992, 1, 'APU0000712311', 'tomatoes, field grown')),
  'avocado':       ('Avocado (1)', 134, 2, 'vegetable', [], 'Ripe when it gives a little when pressed.',
                    171705, 160, 2.0, 6.7, ers(2.262, 0.4, 'avocados, fresh (one avocado taken as 0.4 lb as bought; 74% edible)')),
  'zucchini':      ('Zucchini or Summer Squash (1 lb)', 431, 4, 'vegetable', [], 'Cooks in minutes. Good in stews and stir-fries.',
                    169291, 17, 1.21, 1.0, ers(1.639, 1, 'zucchini, fresh')),
  'cornears':      ('Fresh Corn on the Cob (2 ears)', 204, 2, 'vegetable', [], 'Cut the kernels off the cob for stews.',
                    169998, 86, 3.27, 2.0, ers(2.103, 1, 'corn, fresh (2 ears taken as 1 lb as bought)')),
  'frozenpeas':    ('Frozen Peas (1 lb)', 454, 4, 'vegetable', [], 'No prep. Add near the end of cooking.',
                    170016, 77, 5.22, 4.5, ers(2.191, 1, 'green peas, frozen')),
  'tomatosauce':   ('Tomato Sauce (15 oz can)', 425, 4, 'vegetable', [], 'A ready base for stews and casseroles.',
                    170054, 24, 1.2, 1.5, ers(1.208, 15 / 16, 'tomatoes, canned (USDA prices canned tomato products together; used for tomato sauce)')),
  'plantains':     ('Ripe Plantains (about 2)', 454, 3, 'vegetable', [], 'Yellow with black spots is sweet and ready to cook.',
                    169130, 122, 1.3, 1.7, ppnap(0.2117, 454, '71905000', 'Ripe plantain, raw', ' USDA prices the peeled fruit, so this is about 1 lb of peeled plantain.')),
  'mozzarella':    ('Mozzarella, Part Skim (8 oz)', 227, 8, 'dairy', ['dairy'], 'Lower in fat than most cheeses. Melts well.',
                    170847, 254, 24.3, 0, ppnap(1.0647, 227, '14107030', 'Cheese, Mozzarella, part skim')),
  'raisins':       ('Raisins (12 oz)', 340, 12, 'fruit', [], 'Keeps for months. A little adds sweetness to savory dishes.',
                    168165, 299, 3.3, 4.5, ppnap(0.8171, 340, '62125100', 'Raisins')),
  'sourcream':     ('Fat-Free Sour Cream (16 oz)', 454, 8, 'dairy', ['dairy'], 'Creamy topping for wraps, beans and potatoes.',
                    173444, 74, 3.1, 0, ppnap(0.3705, 454, '12310370', 'Sour cream, fat free')),
  'salmon':        ('Salmon (1 lb)', 454, 4, 'protein', ['fish', 'meat'], 'Rich in omega-3s. Cooks in about 10 minutes.',
                    175167, 208, 20.4, 0, ppnap(1.9680, 454, '26137100', 'Salmon, raw')),
  'fish':          ('Fish Fillets, Tilapia or Similar (1 lb)', 454, 4, 'protein', ['fish', 'meat'], 'Mild white fish. Bakes in 15 to 20 minutes.',
                    175176, 96, 20.1, 0, ppnap(1.2932, 454, '26100100', 'Fish, NS as to type, raw',
                    ' Stand-in: USDA has no raw tilapia price, so this is its price for raw fish of any kind.')),
  'cornflakes':    ('Corn Flakes Cereal (12 oz)', 340, 12, 'grain', ['gluten'], 'Crushed, it makes a crispy coating for baked chicken or fish.',
                    174648, 384, 5.9, 2.7, ppnap(0.6230, 340, '57134000', 'Cereal, corn flakes', ' Corn flakes usually contain malt (barley), so they are marked as having gluten.')),
  'breadcrumbs':   ('Bread Crumbs (15 oz)', 425, 14, 'grain', ['gluten'], 'For meatloaf and crispy coatings.',
                    174928, 395, 13.4, 4.5, ppnap(0.6987, 425, '51185000', 'Croutons (includes seasoned bread crumbs)',
                    ' Stand-in: USDA prices bread crumbs together with croutons.')),
  'kielbasa':      ('Turkey Kielbasa (14 oz)', 397, 6, 'protein', ['meat'], 'Already cooked. A little adds a lot of flavor.',
                    174606, 158, 15.0, 0.3, ppnap(0.8440, 397, '25221860', 'Turkey or chicken sausage, reduced fat')),
  'buttermilk':    ('Low-Fat Buttermilk (1 quart)', 980, 4, 'dairy', ['dairy'], 'For dipping chicken or fish before coating.',
                    170874, 40, 3.31, 0, ppnap(0.1740, 980, '11115100', 'Buttermilk, low fat (1%)')),
  'hominy':        ('Canned Hominy (29 oz)', 822, 5, 'grain', [], 'Already cooked. The heart of pozole.',
                    169701, 72, 1.48, 2.5, ppnap(0.1197, 822, '75217520', 'Hominy, cooked',
                    ' Stand-in: canned hominy is already cooked, so USDA’s cooked hominy price is used.')),
  'masaharina':    ('Masa Harina (2 lb)', 907, 16, 'grain', [], 'Corn flour for pupusas, tortillas and tamales.',
                    169694, 363, 8.46, 6.4, store(2.29, 'masa harina, 2 lb (USDA’s only price is for cooked masa and did not hold up when converted)')),
  'quinoa':        ('Quinoa (12 oz)', 340, 8, 'grain', [], 'A whole grain with extra protein. Cooks in 15 minutes.',
                    168874, 368, 14.1, 7.0, cooked(0.3934, 120, 368, 340, '56204005', 'Quinoa, no added fat')),
  'brownrice':     ('Brown Rice (2 lb)', 907, 20, 'grain', [], 'Whole grain rice. Takes longer to cook than white rice.',
                    169703, 367, 7.54, 3.6, store(1.81, 'brown rice, 2 lb (USDA’s only price is for cooked rice and did not hold up when converted). Also used for instant brown rice')),
  'groundturkey':  ('Lean Ground Turkey (1 lb)', 454, 4, 'protein', ['meat'], 'Lean. Works anywhere you would use ground beef.',
                    171505, 148, 19.7, 0, cooked(1.4248, 203, 148, 454, '24207000', 'Turkey, ground',
                    ' Approximate: meat loses fat and water as it cooks, so this conversion is rougher than for grains.')),
}

# ── The 25 main dishes ─────────────────────────────────────────────────────────────────────────────
# Each ingredient line: (text, food, grams[, food, grams]) bought food · (text, '~word') kitchen basic shown as
# "You'll also need" · (text, '') salt or water · (text, '#') a section heading in the book.
# Grams: FoodData Central portions (cup, medium item) unless noted. Egg whites are bought as whole eggs.
CHICKEN_8 = ('chickenbreast', 688, 'drumsticks', 520)  # 4 breasts (6 oz each, boneless) + 4 drumsticks (130 g)
R = []
def recipe(**k): R.append(k)

recipe(key='pupusas', book='latino', page=4, serves=12, slot='dinner', cuisine='latin', title='Salvadoran-style Stuffed Masa Cakes',
  lines=[('1 pound ground chicken breast', 'chickenbreast', 454), ('1 tablespoon vegetable oil', 'oil', 13.6),
         ('½ small onion, finely diced', 'onions', 35), ('1 clove garlic, minced', 'garlic', 3),
         ('1 medium green pepper, seeded and minced', 'bellpepper', 119), ('1 small tomato, finely chopped', 'tomatoes', 91),
         ('½ teaspoon salt', ''), ('5 cups instant corn flour (masa harina)', 'masaharina', 570), ('6 cups water', ''),
         ('½ pound low-fat mozzarella cheese, grated', 'mozzarella', 227)],
  note='Low-fat ground chicken and cheese help reduce the saturated fat and calories in this tasty Salvadoran dish.',
  es=dict(title='Pupusas revueltas',
    lines=['1 libra de pechuga de pollo molida', '1 cucharada de aceite vegetal', '½ cebolla pequeña, picada finamente',
           '1 diente de ajo, picado muy finamente', '1 pimiento verde mediano, sin semillas y picado muy finamente',
           '1 tomate pequeño, picado finamente', '½ cucharadita de sal', '5 tazas de harina de maíz instantánea (masa harina)',
           '6 tazas de agua', '½ libra de queso mozzarella bajo en grasa, rallado'],
    note='El pollo molido bajo en grasa y el queso bajo en grasa ayudan a disminuir la grasa saturada y las calorías en este sabroso plato típico de El Salvador.'))

recipe(key='pozole', book='latino', page=8, serves=8, slot='dinner', cuisine='latin', title='Mexican Beef and Hominy Stew',
  lines=[('2 pounds lean beef (eye round roast), cubed', 'roundroast', 907), ('1 tablespoon olive oil', 'oliveoil', 13.5),
         ('1 large onion, chopped', 'onions', 150), ('1 clove garlic, finely chopped', 'garlic', 3), ('¼ teaspoon salt', ''),
         ('⅛ teaspoon pepper', '~pepper'), ('¼ cup cilantro', '~cilantro'), ('1 can (15 ounces) stewed tomatoes', 'cannedtomatoes', 425),
         ('1⁄3 can (2 ounces) tomato paste', '~tomato paste'), ('1 can (1 pound, 13 ounces) hominy', 'hominy', 822)],
  note='Only a small amount of oil is needed to saute meat.',
  extra=[('Variation:', 'Skinless, boneless chicken breasts may be used instead of beef cubes.')],
  es=dict(title='Pozole a la mexicana',
    lines=['2 libras de carne de res, baja en grasa, cortada en cubos', '1 cucharada de aceite de oliva', '1 cebolla grande, picada',
           '1 diente de ajo, picado finamente', '¼ cucharadita de sal', '⅛ cucharadita de pimienta negra', '¼ taza de cilantro (culantro)',
           '1 lata (15 onzas) de tomates cocidos', '2 onzas de pasta de tomate', '1 lata (1 libra y 13 onzas) de maíz blanco (mote)'],
    note='Para sofreír la carne sólo se necesita una pequeña cantidad de aceite.',
    extra=[('Alternativa:', 'Se pueden utilizar pechugas de pollo deshuesadas y sin pellejo en lugar de la carne de res.')]))

recipe(key='lentilsoup', book='latino', page=10, serves=11, slot='lunch', cuisine='latin', title='Lentil Soup',
  lines=[('2 tablespoons olive oil', 'oliveoil', 27), ('2 medium carrots, diced', 'carrots', 122), ('2 medium stalks celery, chopped', 'celery', 80),
         ('1 small yellow onion, chopped', 'onions', 70), ('2 cloves garlic, minced', 'garlic', 6), ('1 teaspoon dried oregano', '~oregano'),
         ('1 teaspoon dried basil', '~basil'), ('½ teaspoon ground black pepper', '~black pepper'), ('2 cups dry lentils', 'lentils', 384),
         ('1 can (14½ ounces) crushed tomatoes', 'cannedtomatoes', 411), ('2 cups vegetable broth', '~vegetable broth'), ('6½ cups water', '')],
  note='Lentil soup makes a hearty, delicious starter or a complete meal. This soup is naturally low in fat and lower in sodium than most canned soups. Enjoy!',
  es=dict(title='Sopa de lentejas',
    lines=['2 cucharadas de aceite de oliva', '2 zanahorias medianas, cortadas en cubitos', '2 tallos medianos de apio, cortados finamente',
           '1 cebolla pequeña amarilla, picada finamente', '2 dientes de ajo, picados finamente (molidos)', '1 cucharadita de orégano',
           '1 cucharadita de albahaca', '½ cucharadita de pimienta negra', '2 tazas de lentejas', '1 lata (14½ onzas) de tomates machacados',
           '2 tazas de caldo de verduras', '6½ tazas de agua'],
    note='La sopa de lentejas es un plato sencillo y delicioso como entrada o plato principal. Esta sopa es más baja en grasa y en sodio que las sopas enlatadas. ¡Disfrútela!'))

recipe(key='chickenstew', book='latino', page=12, serves=8, slot='dinner', cuisine='latin', title='Chicken Stew',
  lines=[('8 pieces chicken, breasts or legs', 'drumsticks', 1040), ('1 cup water', ''), ('2 small garlic cloves, minced', 'garlic', 6),
         ('1 small onion, chopped', 'onions', 70), ('1½ teaspoons salt', ''), ('½ teaspoon ground black pepper', '~black pepper'),
         ('3 medium tomatoes, chopped', 'tomatoes', 369), ('1 teaspoon parsley, chopped', '~parsley'), ('¼ cup celery, finely chopped', 'celery', 25),
         ('2 medium potatoes, peeled and chopped', 'potatoes', 426), ('2 small carrots, chopped', 'carrots', 100), ('2 bay leaves', '~bay leaves')],
  note='This makeover recipe has great flavor and plenty of vegetables! It uses chicken breast or legs instead of fatty meats.',
  es=dict(title='Guisado de pollo',
    lines=['8 piezas de pollo, pechugas o pierna de pollo', '1 taza de agua', '2 dientes de ajo pequeños, molidos', '1 cebolla pequeña, picada',
           '1½ cucharaditas de sal', '½ cucharadita de pimienta negra molida', '3 tomates medianos, picados', '1 cucharadita de perejil, picado',
           '¼ de taza de apio, finamente picado', '2 papas medianas, peladas y picadas', '2 zanahorias pequeñas, picadas', '2 hojas de laurel'],
    note='¡Esta receta de cambio de imagen tiene un gran sabor y muchas verduras! Utilice pechuga o muslos de pollo en lugar de carnes grasas.'))

recipe(key='beefcasserole', book='latino', page=16, serves=8, slot='dinner', cuisine='latin', title='Quick Beef Casserole',
  lines=[('½ pound lean ground beef', 'groundbeef', 227), ('1 cup onion, chopped', 'onions', 160), ('1 cup celery, chopped', 'celery', 101),
         ('1 cup green pepper without seeds, cubed', 'bellpepper', 149), ('3½ cups tomatoes, diced', 'tomatoes', 630), ('¼ teaspoon salt', ''),
         ('½ teaspoon black pepper', '~black pepper'), ('¼ teaspoon paprika', '~paprika'), ('1 cup frozen peas', 'frozenpeas', 134),
         ('2 small carrots, diced', 'carrots', 100), ('1 cup uncooked rice', 'rice', 185), ('1½ cups water', '')],
  note='Drain fat from cooked beef to lower the amount of fat and calories.',
  es=dict(title='Cázuela de carne rápida',
    lines=['½ libra de carne molida de res, baja en grasa', '1 taza de cebolla, picada', '1 taza de apio, picado',
           '1 taza de pimiento verde, sin semillas y cortado en cuadraditos', '3½ tazas de tomates, cortados en cubitos', '¼ cucharadita de sal',
           '½ cucharadita de pimienta negra', '¼ cucharadita de pimentón (páprika)', '1 taza de arvejas (chícharos) congelados',
           '2 zanahorias pequeñas, cortadas en cubitos', '1 taza de arroz crudo', '1½ tazas de agua'],
    note='Escurra la grasa que suelta la carne al cocinar para disminuir la cantidad de grasa y calorías.'))

recipe(key='stirfriedbeef', book='latino', page=18, serves=6, slot='dinner', cuisine='latin', title='Stir-fried Beef',
  lines=[('1½ pounds sirloin steak', 'sirloin', 680), ('2 teaspoons vegetable oil', 'oil', 9), ('1 clove garlic, minced', 'garlic', 3),
         ('1 teaspoon vinegar', '~vinegar'), ('⅛ teaspoon salt', ''), ('⅛ teaspoon pepper', '~pepper'), ('2 large onions, sliced', 'onions', 300),
         ('1 large tomato, sliced', 'tomatoes', 182), ('3 cups boiled potatoes, diced', 'potatoes', 470)],  # 3 cups boiled ≈ 470 g raw
  note='Vinegar and garlic give this easy-to-make dish its tasty zip.',
  es=dict(title='Lomo saltado',
    lines=['1½ libras de lomo de res', '2 cucharaditas de aceite vegetal', '1 diente de ajo, picado', '1 cucharadita de vinagre',
           '⅛ cucharadita de sal', '⅛ cucharadita de pimienta', '2 cebollas grandes, rebanadas', '1 tomate grande, rebanado',
           '3 tazas de papas hervidas, cortadas en cubitos'],
    note='El vinagre y el ajo le dan un rico sabor a este plato de fácil preparación.'))

recipe(key='pastelon', book='latino', page=20, serves=12, slot='dinner', cuisine='latin', title='Puerto Rican Yellow Plantain and Meat Casserole',
  lines=[('Meat Filling Layer', '#'), ('1½ pounds lean ground beef', 'groundbeef', 680), ('2 medium green peppers without seeds, chopped', 'bellpepper', 238),
         ('1 medium yellow onion, chopped', 'onions', 110), ('3 bay leaves', '~bay leaves'), ('Dough', '#'),
         ('8 large yellow plantains, ripe and peeled', 'plantains', 2160), ('10 cups water', ''), ('2 tablespoons olive oil', 'oliveoil', 27),
         ('¼ cup cilantro, chopped', '~cilantro'), ('1 cup low-sodium beef broth', '~beef broth'), ('5 ajicitos (tiny chili peppers)', '~ajicitos'),
         ('½ tablespoon annatto paste (achiote)', '~annatto paste'), ('2 garlic cloves, finely chopped', 'garlic', 6),
         ('1 cup tomato sauce', 'tomatosauce', 245), ('Other Layers', '#'), ('5 egg whites, beaten', 'eggs', 250),
         ('1½ cups cooked green beans', 'greenbeans', 203), ('½ cup low-fat mozzarella, shredded', 'mozzarella', 56)],
  note='The natural sweetness of the plantains enhances the flavor of this Puerto Rican dish.',
  es=dict(title='Pastelón puertorriqueño de plántanos con carne molida',
    lines=['Relleno de carne', '1½ libras de carne de res molida, baja en grasa', '2 pimientos verdes, sin semillas y picados finamente',
           '1 cebolla mediana, picada finamente', '3 hojas de laurel', 'Masa', '8 plátanos maduros (amarillos) grandes, pelados', '10 tazas de agua',
           '2 cucharadas de aceite de oliva', '¼ taza de cilantro (culantro), picado finamente', '1 taza de caldo de res bajo en sal',
           '5 ajicitos dulces (tiny chili peppers)', '½ cucharadita de pasta de achiote', '2 dientes de ajo, picados finamente',
           '1 taza de salsa de tomate', 'Otras capas', '5 claras de huevo', '1½ tazas de habichuelas (vainitas) tiernas cocidas',
           '½ taza de queso mozzarella bajo en grasa, rallado'],
    note='La dulzura natural de los plátanos maduros resalta el sabor de este plato típico puertorriqueño.'))

recipe(key='turkeymeatloaf', book='latino', page=22, serves=5, slot='dinner', cuisine='latin', title='Turkey Meatloaf',
  lines=[('1 pound lean (7% fat) ground turkey', 'groundturkey', 454), ('½ cup regular oats, dry', 'oats', 40), ('1 large egg', 'eggs', 50),
         ('1 tablespoon onion, dehydrated, or 1 small onion, minced', 'onions', 70), ('¼ cup ketchup', '~ketchup'),
         ('2 celery stalks, chopped', 'celery', 80), ('2 garlic cloves, minced', 'garlic', 6), ('½ green pepper, seeded and diced', 'bellpepper', 60)],
  note='Enjoy a healthier version of an old dinner favorite.',
  es=dict(title='Rollo de pavo',
    lines=['1 libra de carne molida de pavo con poca grasa (7% de grasa)', '½ taza de avena regular, seca', '1 huevo grande',
           '1 cucharada de cebolla en polvo o 1 cebolla pequeña cortada en trocitos', '¼ taza de salsa de tomate (ketchup)',
           '2 tallos de apio, cortados finamente', '2 dientes de ajo, picados finamente', '½ pimiento verde, sin semilla y cortado en cuadritos'],
    note='Esta es una versión más saludable de un plato favorito bien conocido.'))

recipe(key='chickadillo', book='latino', page=24, serves=6, slot='dinner', cuisine='latin', title='Chickadillo (Chicken Picadillo)',
  lines=[('1 pound chicken breast, boneless, skinless, cut into thin strips', 'chickenbreast', 454), ('2 teaspoons olive oil', 'oliveoil', 9),
         ('1 large yellow onion, finely chopped', 'onions', 150), ('1 medium green pepper, finely chopped', 'bellpepper', 119),
         ('1 medium red pepper, finely chopped', 'bellpepper', 119), ('3 cloves garlic, mashed', 'garlic', 9),
         ('⅓ cup no-salt-added tomato sauce', 'tomatosauce', 82), ('⅓ cup low-sodium chicken broth', '~chicken broth'),
         ('⅓ cup fresh lemon juice', '~lemon juice'), ('⅓ cup water', ''), ('¼ teaspoon ground cumin', '~cumin'), ('2 bay leaves', '~bay leaves'),
         ('¼ cup golden raisins', 'raisins', 36), ('Garnishes', '#'), ('fresh cilantro leaves', '~cilantro'),
         ('1 tablespoon capers, drained', '~capers'), ('2 tablespoons green olives, chopped', '~olives')],
  note='This is a great dish to make when you are short on time.',
  es=dict(title='Picadillo de pollo',
    lines=['1 libra de pechuga de pollo, sin el pellejo, cortada en tiritas', '2 cucharadas de aceite de oliva', '1 cebolla amarilla grande, picada finamente',
           '1 pimiento verde mediano, sin semilla y picado finamente', '1 pimiento rojo mediano, sin semilla y picado finamente',
           '3 dientes de ajo, picados muy finamente', '⅓ taza de salsa de tomate baja en sodio', '⅓ taza de caldo de pollo bajo en sodio',
           '⅓ taza de jugo de limón fresco', '⅓ taza de agua', '¼ cucharadita de comino molido', '2 hojas de laurel', '¼ taza de pasas blancas',
           'Para adornar', 'hojas de cilantro fresco', '1 cucharadita de alcaparras, escurridas', '2 cucharadas de aceitunas verdes, picadas'],
    note='Este platillo es ideal para cuando no hay mucho tiempo para cocinar.'))

recipe(key='pastelchileno', book='latino', page=26, serves=4, slot='dinner', cuisine='latin', title='Chilean Corn and Meat Pie',
  lines=[('Meat Mixture', '#'), ('Nonstick vegetable oil spray', '~cooking spray'), ('4 ounces boneless, skinless chicken breast', 'chickenbreast', 113),
         ('8 ounces extra lean (5% fat) ground beef', 'groundbeef', 227), ('1 green pepper, seeded and chopped', 'bellpepper', 119),
         ('¼ teaspoon ground black pepper', '~black pepper'), ('½ cup raisins', 'raisins', 73), ('2 teaspoons olives, chopped', '~olives'),
         ('Corn Topping', '#'), ('½ tablespoon canola oil', 'oil', 7), ('⅛ teaspoon paprika', '~paprika'),
         ('1 medium onion, finely chopped', 'onions', 110), ('16 ounces corn kernels, thawed', 'frozencorn', 454),
         ('½ cup fat-free milk', 'milk', 122), ('1⁄4 teaspoon salt', ''), ('¾ teaspoon ground cumin', '~cumin'),
         ('¼ teaspoon black pepper', '~black pepper'), ('1 teaspoon dried basil', '~basil')],
  note='Serve with lettuce and tomato salad for a complete meal.',
  extra=[('', '*If you prefer, divide the mixture into four servings and bake in four small oven-proof bowls.')],
  es=dict(title='Pastel chileno de maíz (choclo) con carne y pollo',
    lines=['Relleno de carne', 'Aceite vegetal en aerosol', '1 pechuga de pollo de 4 onzas, sin pellejo', '8 onzas de carne de res molida, baja en grasa (5% de grasa)',
           '1 pimiento verde, sin semillas y picado en cuadraditos', '¼ cucharadita de pimienta negra', '½ taza de pasas', '2 cucharaditas de aceitunas, picadas',
           'Puré de maíz', '½ cucharadita de aceite de canola', '⅛ cucharadita de pimentón (páprika)', '1 cebolla mediana, picada finamente',
           '16 onzas de granos de maíz, descongelados', '½ taza de leche descremada', '¼ cucharadita de sal', '¾ cucharadita de comino molido',
           '¼ cucharadita de pimienta negra', '1 cucharadita de albahaca seca'],
    note='Sirva el pastel con ensalada de lechuga y tomate y tendrá una comida completa.',
    extra=[('', '*Si prefiere, divida la mezcla en cuatro porciones y hornéelas en fuentes individuales que se puedan meter en el horno.')]))

recipe(key='tilapia', book='latino', page=28, serves=4, slot='dinner', cuisine='latin', title='Baked Tilapia With Tomatoes',
  lines=[('Nonstick vegetable oil spray', '~cooking spray'), ('4 tilapia fillets', 'fish', 454), ('4 medium tomatoes, peeled and chopped', 'tomatoes', 492),
         ('2 tablespoons olive oil', 'oliveoil', 27), ('1½ teaspoons thyme', '~thyme'), ('¼ cup pitted black olives, diced', '~olives'),
         ('¼ teaspoon red pepper flakes', '~red pepper flakes'), ('2 cloves garlic, minced', 'garlic', 6), ('½ cup red onion, diced', 'onions', 80),
         ('1 tablespoon lime juice', '~lime juice'), ('parsley and lemon wedges for garnish', '~parsley')],
  note='This dish is easy to prepare, low in calories, and economical.',
  es=dict(title='Tilapia al horno con tomate',
    lines=['Aceite vegetal en aerosol', '4 filetes de tilapia (tipo de pescado)', '4 tomates medianos, pelados y picados', '2 cucharadas de aceite de oliva',
           '1½ cucharaditas de tomillo', '¼ taza de aceitunas negras sin semilla, en pedacitos', '¼ cucharadita de pimienta roja',
           '2 dientes de ajo, picados finamente', '½ taza de cebolla roja, cortada en cuadritos', '1 cucharada de jugo de limón verde',
           'perejil y rodajas de limón para adornar'],
    note='Esta receta deliciosa es fácil de preparar, baja en calorías y al alcance del bolsillo.'))

recipe(key='veggiewrap', book='latino', page=32, serves=4, slot='lunch', cuisine='latin', title='Maria’s Veggie Wrap',
  lines=[('1 medium red bell pepper, seeded and sliced', 'bellpepper', 119), ('1 medium yellow pepper, seeded and sliced', 'bellpepper', 119),
         ('1 onion, sliced', 'onions', 110), ('1 teaspoon canola oil', 'oil', 4.5),
         ('1 can (15 ounces) low-sodium black beans, drained and rinsed', 'blackbeans', 425), ('½ avocado, peeled and diced', 'avocado', 67),
         ('juice from 1 lime', '~lime'), ('½ cup chopped fresh cilantro', '~cilantro'), ('1 teaspoon chili powder (optional)', '~chili powder'),
         ('1 cup fat-free sour cream', 'sourcream', 230), ('4 8-inch whole-wheat tortillas', 'tortillas', 180)],
  note='This tasty wrap is chock-full of yummy beans and vegetables and provides a great source of fiber.',
  es=dict(title='El burrito vegetariano de María',
    lines=['1 pimiento rojo, sin semillas y picado', '1 pimiento amarillo, sin semillas y picado', '1 cebolla, pelada y cortada en tajadas',
           '1 cucharadita de aceite de canola', '1 lata (15 onzas) de frijoles negros bajos en sodio, escurridos del líquido y enjuagados en agua',
           '½ aguacate (palta), pelado y cortado en cubitos', 'Jugo de un limón verde', '½ taza de cilantro (culantro) fresco, picado',
           '1 cucharadita de chile en polvo (opcional)', '1 taza de crema agria sin grasa', '4 tortillas (de 8 pulgadas) de trigo entero'],
    note='Este exquisito burrito es repleto de ricos frijoles y verduras y es una gran fuente de fibra.'))

recipe(key='quinoasalad', book='latino', page=34, serves=6, slot='lunch', cuisine='latin', title='Quinoa and Black Bean Salad',
  lines=[('½ cup dry quinoa', 'quinoa', 85), ('1½ cups water', ''), ('1½ tablespoons olive oil', 'oliveoil', 20), ('3 tablespoons lime juice', '~lime juice'),
         ('¼ teaspoon cumin', '~cumin'), ('¼ teaspoon ground coriander (dried cilantro seeds)', '~coriander'), ('2 tablespoons cilantro, chopped', '~cilantro'),
         ('2 medium scallions, minced', '~scallions'), ('1 can (15 ounces) black beans, rinsed and drained', 'blackbeans', 425),
         ('2 cups tomato, chopped', 'tomatoes', 360), ('1 medium red bell pepper, chopped', 'bellpepper', 119),
         ('1 medium green bell pepper, chopped', 'bellpepper', 119), ('2 fresh green chilis (or to taste), minced', '~green chilis'),
         ('black pepper (to taste)', '~black pepper')],
  note='This delightful chilled salad could be a great main entreé or side dish.',
  es=dict(title='Ensalada de quínoa con frijoles negros',
    lines=['½ taza de quinua seca', '1½ tazas de agua', '1½ cucharadas de aceite de oliva', '3 cucharadas de jugo de limón verde', '¼ cucharadita de comino',
           '¼ cucharadita de semillas secas de cilantro (coriander)', '2 cucharaditas de cilantro, picado', '2 cebollines pequeños, finamente picados',
           '1 lata (15 onzas) de frijoles negros, enjuagados y sin el líquido', '2 tazas de tomate, picado', '1 pimiento rojo mediano, sin semillas y picado',
           '1 pimiento verde mediano, sin semillas y picado', '2 ajís (chiles) verdes (al gusto), sin semillas y picados finamente', 'pimienta negra, al gusto'],
    note='Esta nutritiva ensalada puede servirse como plato principal o como guarnición.'))

# Heart-Healthy Home Cooking African American Style (English only in the book).
recipe(key='vegetablestew', book='aa', page=9, serves=8, slot='dinner', cuisine='southern', title='Vegetable Stew',
  note='Here’s a great new way to use summer vegetables. You can add your other favorite vegetables such as broccoli, cauliflower, or string beans.',
  lines=[('3 cups water', ''), ('1 cube vegetable bouillon, low sodium', '~vegetable bouillon'), ('2 cups white potatoes cut in 2-inch strips', 'potatoes', 300),
         ('2 cups carrots, sliced', 'carrots', 244), ('4 cups summer squash, cut in 1-inch squares', 'zucchini', 452),
         ('1 cup summer squash, cut in four chunks', 'zucchini', 113), ('2 ears fresh corn (1½ cups)', 'cornears', 204),
         ('1 teaspoon thyme, ground', '~thyme'), ('2 cloves garlic, minced', 'garlic', 6), ('1 stalk scallion, chopped', '~scallion'),
         ('½ small hot red pepper, chopped', '~hot pepper'), ('1 cup onion, coarsely chopped', 'onions', 160), ('1 cup tomatoes, diced', 'tomatoes', 180)],
  extra=[('Make It a Meal', 'To make this dish a meal, serve it with a green salad that includes lettuce (romaine) or spinach, cucumber, and other fresh vegetables. Use a light dressing, such as a vinaigrette, or a low-fat or fat-free dressing. Serve with whole-grain bread or rolls.')])

recipe(key='macandcheese', book='aa', page=10, serves=8, slot='dinner', cuisine='american', title='Classic Macaroni and Cheese',
  note='This recipe proves you don’t have to give up your favorite dishes to eat heart-healthy meals. Here’s a lower-fat version of a true classic.',
  lines=[('2 cups macaroni', 'pasta', 244), ('½ cup chopped onions', 'onions', 80), ('½ cup evaporated, fat-free milk', 'evaporatedmilk', 128),
         ('1 medium egg, beaten', 'eggs', 44), ('¼ teaspoon black pepper', '~black pepper'),
         ('1 ¼ cups (4 oz.) reduced-fat, natural, sharp cheddar cheese, shredded', 'cheese', 113)])

recipe(key='caribbeancasserole', book='aa', page=13, serves=10, slot='dinner', cuisine='any', title='Caribbean Casserole',
  note='This tropical-inspired dish is gently spiced for a rich flavor.',
  lines=[('1 medium onion, chopped', 'onions', 110), ('½ green pepper, rinsed and diced', 'bellpepper', 60), ('1 tablespoon canola oil', 'oil', 13.6),
         ('1 can (14½-ounce) stewed tomatoes', 'cannedtomatoes', 411),
         ('1 can (15½-ounce) low sodium black beans (or beans of your choice)', 'blackbeans', 425),  # one can, whatever the label size
         ('1 teaspoon dried oregano', '~oregano'), ('½ teaspoon garlic powder', '~garlic powder'),
         ('1½ cups instant brown rice, uncooked', 'brownrice', 129)])  # instant brown rice ≈ 86 g a cup (lighter than regular)

recipe(key='ovenfriedchicken', book='aa', page=16, serves=6, slot='dinner', cuisine='southern', title='Crispy Oven-Fried Chicken',
  note='Kids will love this chicken—and it’s good for the heart.',
  lines=[('½ cup fat-free milk or buttermilk', 'milk', 122), ('1 teaspoon poultry seasoning', '~poultry seasoning'),
         ('1 cup cornflakes, crumbled (or breadcrumbs)', 'cornflakes', 85), ('1½ tablespoons onion powder', '~onion powder'),
         ('1½ tablespoons garlic powder', '~garlic powder'), ('2 teaspoons black pepper', '~black pepper'),
         ('2 teaspoons dried hot pepper, crushed', '~dried hot pepper'), ('1 teaspoon ginger, ground', '~ground ginger'),
         ('8 pieces chicken, skinless (4 breasts, 4 drumsticks)',) + CHICKEN_8, ('¼ teaspoon paprika', '~paprika')])

recipe(key='ovenfriedfish', book='aa', page=17, serves=6, slot='dinner', cuisine='southern', title='Mouth-Watering Oven-Fried Fish',
  note='This heart-healthy dish can be made with many kinds of fish—to be enjoyed over and over.',
  lines=[('2 pounds fish fillets', 'fish', 907), ('1 tablespoon lemon juice', '~lemon juice'), ('¼ cup fat-free or 1% buttermilk', 'buttermilk', 61),
         ('2 drops hot sauce', '~hot sauce'), ('1 teaspoon fresh garlic, minced', 'garlic', 3), ('¼ teaspoon ground white pepper', '~white pepper'),
         ('¼ teaspoon salt', ''), ('¼ teaspoon onion powder', '~onion powder'), ('½ cup cornflakes, crumbled, or regular bread crumbs', 'cornflakes', 43),
         ('1 tablespoon vegetable oil', 'oil', 13.6), ('1 fresh lemon, cut in wedges', '~lemon')])

recipe(key='curriedchicken', book='aa', page=18, serves=10, slot='dinner', cuisine='any', title='Finger-Licking Curried Chicken',
  note='The name tells all—ginger and curry powder make it irresistible.',
  lines=[('1½ teaspoons curry powder', '~curry powder'), ('1 teaspoon thyme', '~thyme'), ('1 stalk scallion (green onion), chopped', '~scallion'),
         ('1 tablespoon hot pepper, chopped', '~hot pepper'), ('½ tsp ground cayenne pepper', '~cayenne pepper'),
         ('1 teaspoon ground black pepper', '~black pepper'), ('8 cloves garlic, crushed', 'garlic', 24), ('1 tablespoon grated ginger', '~ginger'),
         ('¾ teaspoon salt', ''), ('8 pieces skinless chicken (4 breasts, 4 drumsticks)',) + CHICKEN_8, ('1 tablespoon olive oil', 'oliveoil', 13.5),
         ('1 cup water', ''), ('1 medium white potato, diced', 'potatoes', 213), ('1 large onion, chopped', 'onions', 150)])

recipe(key='poachedsalmon', book='aa', page=19, serves=4, slot='dinner', cuisine='southern', title='Poached Salmon',
  note='The tomato relish adds just the right amount of flavor.',
  lines=[('Spicy Tomato Relish', '#'), ('2 medium tomatoes, chopped', 'tomatoes', 246), ('2 tablespoons finely chopped yellow onion', 'onions', 20),
         ('2 tablespoons finely chopped fresh parsley', '~parsley'), ('1 teaspoon red pepper flakes, or to taste', '~red pepper flakes'),
         ('¼ cup red wine vinegar', '~red wine vinegar'), ('2 tablespoons olive oil', 'oliveoil', 27), ('ground black pepper, to taste', '~black pepper'),
         ('Salmon', '#'), ('4 salmon steaks, 5 ounces each', 'salmon', 567), ('3 cups water', ''), ('4 black peppercorns', '~black peppercorns'),
         ('1 lemon, thickly sliced', '~lemon'), ('3 parsley sprigs', '~parsley'), ('1 small onion, thickly sliced', 'onions', 70), ('2 bay leaves', '~bay leaves')])

recipe(key='jerkchicken', book='aa', page=20, serves=10, slot='dinner', cuisine='any', title='Jamaican Jerk Chicken',
  note='The spices and peppers in this dish will transport you to a whole new taste.',
  lines=[('½ teaspoon ground cinnamon', '~cinnamon'), ('1½ teaspoons ground allspice', '~allspice'), ('1½ teaspoons ground black pepper', '~black pepper'),
         ('1 tablespoon chopped hot pepper', '~hot pepper'), ('1 teaspoon dried hot pepper', '~dried hot pepper'), ('2 teaspoons crushed oregano', '~oregano'),
         ('2 teaspoons dried thyme', '~thyme'), ('½ teaspoon salt', ''), ('6 cloves garlic, finely chopped', 'garlic', 18),
         ('1 cup onion, pureed or finely chopped', 'onions', 160), ('¼ cup vinegar', '~vinegar'), ('3 tablespoons brown sugar', '~brown sugar'),
         ('8 pieces skinless chicken (4 breasts, 4 drumsticks)',) + CHICKEN_8])

recipe(key='porkchops', book='aa', page=21, serves=6, slot='dinner', cuisine='southern', title='Baked Pork Chops',
  note='You can really sink your chops into these—they’re made moist and spicy with egg whites, evaporated milk, and a lively blend of herbs.',
  lines=[('6 lean center-cut pork chops, ½-inch thick', 'porkchops', 726), ('1 egg white (or substitute liquid egg white)', 'eggs', 50),
         ('1 cup fat-free evaporated milk', 'evaporatedmilk', 256), ('¾ cup cornflake crumbs', 'cornflakes', 64), ('¼ cup bread crumbs', 'breadcrumbs', 27),
         ('4 teaspoons paprika', '~paprika'), ('2 teaspoons oregano', '~oregano'), ('¾ teaspoon chili powder', '~chili powder'),
         ('½ teaspoon garlic powder', '~garlic powder'), ('½ teaspoon ground black pepper', '~black pepper'), ('⅛ teaspoon cayenne pepper', '~cayenne pepper'),
         ('⅛ teaspoon dry mustard', '~dry mustard'), ('½ teaspoon salt', ''), ('cooking spray', '~cooking spray')],
  extra=[('Note:', 'Try the recipe with skinless, boneless chicken or turkey parts, or fish—bake for just 20 minutes.')])

recipe(key='jambalaya', book='aa', page=22, serves=9, slot='dinner', cuisine='southern', title='Jumpin’ Jambalaya',
  note='Here is a jambalaya that your family can enjoy. It has lots of flavor, veggies, and tasty low-fat meats! Green salad is a nice side dish.',
  lines=[('14 ounces low-fat turkey kielbasa', 'kielbasa', 397), ('1 pound boneless, skinless chicken breast', 'chickenbreast', 454),
         ('nonstick cooking spray', '~cooking spray'), ('1 medium celery stalk, chopped', 'celery', 40), ('2 small onions, chopped', 'onions', 140),
         ('4 cloves garlic, chopped', 'garlic', 12), ('1 small bunch green onions, chopped', '~green onions'),
         ('1 medium green bell pepper, chopped', 'bellpepper', 119), ('1 can (14½-ounce) no-salt-added diced tomatoes', 'cannedtomatoes', 411),
         ('1½ cups uncooked brown rice', 'brownrice', 278), ('4 cups water', ''), ('2 cubes low-sodium chicken bouillon', '~chicken bouillon'),
         ('1 bay leaf', '~bay leaves'), ('1½ teaspoons cayenne pepper', '~cayenne pepper'), ('3 tablespoons parsley, finely chopped', '~parsley')],
  extra=[('', '*Instant brown rice will take less time to cook.')])

recipe(key='meatloaf', book='aa', page=23, serves=6, slot='dinner', cuisine='southern', title='Scrumptious Meatloaf',
  note='Got the meatloaf blahs? This recipe transforms the ordinary into the extraordinary.',
  lines=[('1 pound extra-lean ground beef', 'groundbeef', 454), ('½ cup tomato paste', '~tomato paste'), ('4 cups chopped onion', 'onions', 640),
         ('4 cups chopped green pepper', 'bellpepper', 596), ('4 cups chopped red pepper', 'bellpepper', 596), ('1 cup fresh tomatoes, blanched', 'tomatoes', 180),
         ('2 teaspoons low-sodium mustard', '~mustard'), ('4 teaspoons ground black pepper', '~black pepper'), ('2 teaspoons chopped hot pepper', '~hot pepper'),
         ('2 cloves garlic, chopped', 'garlic', 6), ('2 scallions (green onions), chopped', '~scallions'), ('2 teaspoons ground ginger', '~ground ginger'),
         ('8 teaspoons ground nutmeg', '~nutmeg'), ('1 teaspoon grated orange rind', '~orange rind'), ('2 teaspoons crushed thyme', '~thyme'),
         ('4 cups bread crumbs', 'breadcrumbs', 432)])

recipe(key='bbqchicken', book='aa', page=24, serves=6, slot='dinner', cuisine='southern', title='Spicy Southern Barbecued Chicken',
  note='Let yourself fall under the spell of this Southern-style, sweet barbecue sauce.',
  lines=[('5 tablespoons tomato paste', '~tomato paste'), ('1 teaspoon ketchup', '~ketchup'), ('2 teaspoons honey', '~honey'), ('1 teaspoon molasses', '~molasses'),
         ('1 teaspoon Worcestershire sauce', '~worcestershire sauce'), ('4 teaspoons white vinegar', '~vinegar'), ('¾ teaspoon cayenne pepper', '~cayenne pepper'),
         ('⅛ teaspoon black pepper', '~black pepper'), ('¼ teaspoon onion powder', '~onion powder'), ('2 cloves garlic, minced', 'garlic', 6),
         ('⅛ teaspoon grated ginger', '~ginger'), ('8 pieces skinless chicken (4 breasts, 4 drumsticks)',) + CHICKEN_8])

# Kitchen basics that change who can eat a dish (the foods' own tags cover the rest).
PANTRY_AVOID = {'beef broth': ['meat'], 'chicken broth': ['meat'], 'chicken bouillon': ['meat'], 'worcestershire sauce': ['fish']}
BOOKS = {
  'latino': {'title': 'Delicious Heart-Healthy Latino Recipes', 'title_es': 'Platillos latinos ¡sabrosos y saludables!',
             'pub': 'NIH Publication No. 24-HL-4049S', 'date': 'April 2024',
             'url': 'https://www.nhlbi.nih.gov/resources/delicious-heart-healthy-latino-recipes-book-platillos-latinos-sabrosos-y-saludables'},
  'aa': {'title': 'Heart-Healthy Home Cooking African American Style', 'pub': 'NIH Publication No. 21-HL-3792', 'date': 'February 2021',
         'url': 'https://www.nhlbi.nih.gov/health-topics/all-publications-and-resources/heart-healthy-home-cooking-african-american-style'},
}
FOOD_WORD = {  # words used in recipe.ingredients (diet rules and the food-box matcher read these)
  'chickenbreast': 'chicken breast', 'drumsticks': 'chicken drumsticks', 'sirloin': 'beef', 'roundroast': 'beef', 'groundturkey': 'ground turkey',
  'kielbasa': 'turkey kielbasa', 'groundbeef': 'ground beef', 'porkchops': 'pork', 'fish': 'fish', 'salmon': 'salmon', 'tomatoes': 'tomatoes',
  'cannedtomatoes': 'canned tomatoes', 'tomatosauce': 'tomato sauce', 'oil': 'oil', 'oliveoil': 'olive oil', 'onions': 'onions', 'garlic': 'garlic',
  'bellpepper': 'bell peppers', 'celery': 'celery', 'carrots': 'carrots', 'potatoes': 'potatoes', 'lentils': 'lentils', 'rice': 'rice',
  'brownrice': 'brown rice', 'quinoa': 'quinoa', 'masaharina': 'masa harina', 'hominy': 'hominy', 'pasta': 'pasta', 'oats': 'oats',
  'eggs': 'eggs', 'milk': 'milk', 'evaporatedmilk': 'evaporated milk', 'buttermilk': 'buttermilk', 'cheese': 'cheese', 'mozzarella': 'mozzarella',
  'sourcream': 'sour cream', 'blackbeans': 'black beans', 'greenbeans': 'green beans', 'frozenpeas': 'peas', 'frozencorn': 'corn',
  'cornears': 'corn on the cob', 'zucchini': 'summer squash', 'plantains': 'plantains', 'avocado': 'avocado', 'raisins': 'raisins',
  'tortillas': 'tortillas', 'cornflakes': 'cornflakes', 'breadcrumbs': 'bread crumbs',
}

# ── Word-for-word check against the books ──────────────────────────────────────────────────────────
FOOTER = re.compile(r'^(Delicious Heart-Healthy Hispanic/Latino Recipes|Platillos latinos ¡sabrosos y saludables!|Heart-Healthy Home Cooking( \d+)?|\d+)$', re.I)
STOP = re.compile(r'^(Variation:|Alternativa:|\*|CUMIN$|Make It a Meal|Makes:? \d|Sirve|Note:)')
squash = lambda s: re.sub(r'\s+', '', s)

def page_lines(text):
    return [l.strip() for l in text.split('\n') if l.strip() and not FOOTER.match(l.strip())]

def join(lines):
    """Undo line breaks: a line ending in '-' joins the next (hyphen kept unless the break split a word)."""
    out = ''
    for l in lines:
        if not out: out = l
        elif out.endswith('-') and re.search(r'[a-záéíóúñ]-$', out) and l[:1].islower() and out.split()[-1] in BROKEN:
            out = out[:-1] + l
        elif out.endswith('-'): out += l
        else: out += ' ' + l
    return out
BROKEN = {'indivi-'}  # words the printer broke across lines (not real hyphens)

def steps_from(page):
    L = page_lines(page)
    i = next(i for i, l in enumerate(L) if re.match(r'^1\.\s', l))
    steps, cur = [], []
    for l in L[i:]:
        if STOP.match(l): break
        m = re.match(r'^(\d+)\.\s+(.*)', l)
        if m and int(m.group(1)) == len(steps) + (2 if cur else 1):
            if cur: steps.append(join(cur))
            cur = [m.group(2)]
        else:
            cur.append(l)
    steps.append(join(cur))
    return [re.sub(r'\s+Makes \d+ servings.*$', '', s) for s in steps]

def check_in_order(page, texts, where):
    flat = squash('\n'.join(page_lines(page)).replace('-\n', '-'))
    flat2 = squash('\n'.join(page_lines(page)).replace('-\n', ''))
    pos = 0
    for t in texts:
        k = flat.find(squash(t), pos)
        if k < 0 and flat2.find(squash(t)) >= 0: k = pos  # a word broken across lines
        if k < 0: raise SystemExit(f'NOT WORD FOR WORD ({where}): {t!r}')
        pos = k

def main():
    books = {'latino': open(sys.argv[1], encoding='utf-8').read().split('\f'), 'aa': open(sys.argv[2], encoding='utf-8').read().split('\f')}
    pages = {}
    for book in books:
        for line in open(ROOT / 'scripts' / 'nih-pages.tsv', encoding='utf-8'):
            b, key, idx = line.rstrip('\n').split('\t')
            if b == book: pages[key] = int(idx)

    # Foods
    nutrition, prices, sources, foods_js = {}, {}, {}, []
    for fid, (name, g, srv, cat, avoid, note, fdc, kcal, prot, fib, (price, kind, src)) in FOODS.items():
        nutrition[fid] = {'fdc': fdc, 'g': g, 'kcal': round(kcal * g / 100), 'protein': round(prot * g / 100, 1), 'fiber': round(fib * g / 100, 1)}
        prices[fid] = price
        sources[fid] = {'kind': kind, 'source': src}
        foods_js.append({'id': fid, 'name': name, 'cal': nutrition[fid]['kcal'], 'srv': srv, 'cat': cat, 'tier': 2, 'note': note,
                         'avoid': avoid, 'hasProp': None, 'recipeOnly': True})

    out = []
    for n, r in enumerate(R):
        page = books[r['book']][pages[r['key']]]
        lines, uses, pantry = [], {}, []
        for item in r['lines']:
            text = item[0]
            if len(item) == 2 and item[1] == '#': lines.append({'t': text, 'h': 1}); continue
            if len(item) == 2 and item[1] == '': lines.append({'t': text}); continue
            if len(item) == 2:
                word = item[1][1:]; lines.append({'t': text, 'p': word})
                if word not in pantry: pantry.append(word)
                continue
            pairs = list(zip(item[1::2], item[2::2]))
            for fid, g in pairs:
                uses[fid] = round(uses.get(fid, 0) + g, 1)
            lines.append({'t': text, 'f': [fid for fid, _ in pairs]})
        check_in_order(page, [r['title']] + [l['t'] for l in lines], f"{r['title']} ingredients")
        check_in_order(page, [r['note']] + [h + ' ' + t if h else t for h, t in r.get('extra', [])], f"{r['title']} note")
        if not re.search(rf"Makes:? {r['serves']} servings", page): raise SystemExit(f"servings? {r['title']}")
        steps = steps_from(page)
        food_avoid = {a for fid in uses for a in (FOODS[fid][4] if fid in FOODS else CORE_AVOID[fid])}
        avoid = sorted(food_avoid | {a for w in pantry for a in PANTRY_AVOID.get(w, [])})
        rec = {
            'id': 1001 + n, 'key': r['key'], 'title': r['title'], 'slot': r['slot'], 'cuisine': r['cuisine'], 'srv': r['serves'],
            'ingredients': [FOOD_WORD[fid] for fid in uses] + pantry, 'avoid': avoid,
            'uses': [{'id': fid, 'g': g} for fid, g in uses.items()], 'lines': lines, 'note': r['note'],
            'steps': steps, 'extra': [{'h': h, 't': t} for h, t in r.get('extra', [])], 'instructions': ' '.join(steps),
            'tags': 'nhlbi', 'source': {'book': r['book'], 'page': r['page']},
        }
        if r.get('es'):
            es = r['es']
            espage = books[r['book']][pages[r['key']] + 1]
            if len(es['lines']) != len(lines): raise SystemExit(f"ES lines don't line up: {r['title']}")
            check_in_order(espage, [es['title']] + es['lines'], f"{r['title']} ES ingredients")
            check_in_order(espage, [es['note']] + [h + ' ' + t if h else t for h, t in es.get('extra', [])], f"{r['title']} ES note")
            rec['es'] = {'title': es['title'], 'lines': es['lines'], 'note': es['note'], 'steps': steps_from(espage),
                         'extra': [{'h': h, 't': t} for h, t in es.get('extra', [])], 'page': r['page'] + 1}
            if len(rec['es']['steps']) != len(steps): raise SystemExit(f"ES steps don't line up: {r['title']}")
        out.append(rec)

    data = {'_about': 'Main dishes from two NHLBI cookbooks, word for word (built by scripts/build-nih-recipes.py; do not edit by hand).',
            'books': BOOKS, 'recipes': out}
    (ROOT / 'data' / 'nih-recipes.json').write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    js = ['// Built by scripts/build-nih-recipes.py: do not edit by hand. The foods the NHLBI main dishes need.',
          '// recipeOnly: bought only for those recipes (the older cart builder never picks them).',
          '// Nutrition: USDA FoodData Central SR Legacy (fdc id), per package of g edible grams.',
          '// Prices: national; BLS "live" foods are replaced by current BLS prices (server/prices.js).',
          f'export const EXTRA_FOODS = {json.dumps(foods_js, ensure_ascii=False)};',
          f'export const EXTRA_NUTRITION = {json.dumps(nutrition)};',
          f'export const EXTRA_PRICES = {json.dumps(prices)};',
          f'export const PRICE_SOURCES = {json.dumps(sources, ensure_ascii=False, indent=1)};',
          "export const EXTRA_PRICES_AS_OF = '2026-11-07';", '']
    (ROOT / 'engine' / 'extra-foods.js').write_text('\n'.join(js), encoding='utf-8')

    # Translations: official Spanish for the Latino book; our drafts for the rest.
    for lang in ['es', 'vi', 'zh-Hans']:
        path = ROOT / 'public' / 'i18n' / 'data' / f'{lang}.json'
        d = json.loads(path.read_text(encoding='utf-8'))
        tr_path = ROOT / 'scripts' / 'nih-translations' / f'{lang}.json'
        tr = json.loads(tr_path.read_text(encoding='utf-8')) if tr_path.exists() else {'foods': {}, 'recipes': {}}
        d['foods'].update(tr.get('foods', {}))
        d['ingredients'].update(tr.get('ingredients', {}))
        for rec in out:
            if lang == 'es' and 'es' in rec:
                e = rec['es']
                d['recipes'][str(rec['id'])] = {'title': e['title'], 'lines': e['lines'], 'note': e['note'], 'steps': e['steps'],
                                               'extra': e['extra'], 'instructions': ' '.join(e['steps']), 'official': True, 'page': e['page']}
            elif rec['key'] in tr.get('recipes', {}):
                t = tr['recipes'][rec['key']]
                if len(t['lines']) != len(rec['lines']) or len(t['steps']) != len(rec['steps']) or len(t.get('extra', [])) != len(rec['extra']):
                    raise SystemExit(f'{lang} translation of {rec["title"]} does not line up')
                d['recipes'][str(rec['id'])] = {**t, 'instructions': ' '.join(t['steps'])}
        path.write_text(json.dumps(d, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{len(out)} recipes, {len(FOODS)} new foods')
    for rec in out:
        print(f"{rec['id']} {rec['title']} | serves {rec['srv']} | {len(rec['steps'])} steps | avoid {rec['avoid']} | " +
              ', '.join(f"{u['id']} {u['g']}" for u in rec['uses']))

CORE_AVOID = {  # leave-out tags of the foods already in engine/food-db.js
  'oil': [], 'oliveoil': [], 'onions': [], 'garlic': [], 'bellpepper': [], 'celery': [], 'carrots': [], 'potatoes': [], 'lentils': [], 'rice': [],
  'cannedtomatoes': [], 'blackbeans': [], 'greenbeans': [], 'frozencorn': [], 'groundbeef': ['meat'], 'porkchops': ['meat'], 'eggs': ['eggs'],
  'milk': ['dairy'], 'evaporatedmilk': ['dairy'], 'cheese': ['dairy'], 'pasta': ['gluten'], 'oats': ['gluten'], 'tortillas': ['gluten'],
}

if __name__ == '__main__':
    main()
