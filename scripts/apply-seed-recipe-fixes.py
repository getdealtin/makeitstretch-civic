"""Apply scripts/seed-recipe-fixes.json to data/seed-recipes.json and the recipe translations (Nov 19 2026).

Each fix may set a recipe's ingredients (words the planner prices, engine/box.js INGREDIENT_FOODS), its extras
(seasonings with no government price, shown as "You'll also need" and not in the total), its leave-out tags,
and its steps in all four languages. Titles never change: every dish keeps its name (owner decision).
Also adds the translations for the new foods (engine/recipe-foods.js) and the new ingredient and seasoning words.
Safe to run again: it sets values, it doesn't append.

Run: python3 -I scripts/apply-seed-recipe-fixes.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANGS = {'es': 'es', 'vi': 'vi', 'zh-Hans': 'zh'}

# The new foods' names in each language (name, full = with package, note). DRAFT, pending native-speaker review.
FOODS = {
 'es': {
  'catfish': ('Bagre', 'Filetes de bagre congelados (1 lb)', 'Suave y rápido. Cúbralo con harina de maíz y fríalo, o al horno.'),
  'kimchi': ('Kimchi', 'Kimchi (frasco de 16 oz)', 'Repollo fermentado picante. La mayoría lleva salsa de pescado; el kimchi vegano lo dice en la etiqueta.'),
  'feta': ('Queso feta', 'Queso feta desmoronado (6 oz)', 'Salado y ácido. Con poquito basta.'),
  'tofu': ('Tofu firme', 'Tofu firme (14 oz)', 'Quítele el agua apretándolo y fríalo o saltéelo. Una proteína vegetal barata.'),
  'favabeans': ('Habas en lata', 'Habas en lata (15 oz)', 'También se venden como “ful”. La base del ful medames.'),
  'blackeyedpeas': ('Frijoles carita', 'Frijoles carita secos (1 lb)', 'No hace falta remojarlos. Se cuecen en como una hora.'),
  'biscuits': ('Biscuits refrigerados', 'Biscuits refrigerados (lata de 16 oz, 8 piezas)', 'Se hornean directo de la lata en unos 15 minutos.'),
  'pita': ('Pan pita', 'Pan pita (6 piezas)', 'Caliéntelo o tuéstelo. Bueno para comer frijoles y en ensaladas.'),
  'lemons': ('Limones amarillos', 'Limones amarillos (2)', 'Un chorrito le da vida al pescado, los frijoles y las ensaladas.'),
  'groundpork': ('Carne de cerdo molida', 'Carne de cerdo molida (1 lb)', 'Dórela con ajo para fideos, o sazónela como chorizo para el desayuno.'),
 },
 'vi': {
  'catfish': ('Cá trê', 'Phi lê cá trê đông lạnh (1 lb)', 'Thịt mềm, nấu nhanh. Lăn bột bắp rồi chiên, hoặc nướng.'),
  'kimchi': ('Kim chi', 'Kim chi (hũ 16 oz)', 'Bắp cải lên men cay. Đa số có nước mắm; kim chi chay có ghi trên nhãn.'),
  'feta': ('Phô mai feta', 'Phô mai feta vụn (6 oz)', 'Mặn và chua nhẹ. Dùng một ít là đủ.'),
  'tofu': ('Đậu phụ cứng', 'Đậu phụ cứng (14 oz)', 'Ép bớt nước rồi chiên hoặc xào. Đạm thực vật rẻ.'),
  'favabeans': ('Đậu fava đóng hộp', 'Đậu fava đóng hộp (15 oz)', 'Còn gọi là “ful”. Nguyên liệu chính của món ful medames.'),
  'blackeyedpeas': ('Đậu mắt đen', 'Đậu mắt đen khô (1 lb)', 'Không cần ngâm. Nấu khoảng một giờ là mềm.'),
  'biscuits': ('Bánh biscuit làm lạnh', 'Bánh biscuit làm lạnh (hộp 16 oz, 8 cái)', 'Nướng thẳng từ hộp khoảng 15 phút.'),
  'pita': ('Bánh mì pita', 'Bánh mì pita (6 cái)', 'Hâm nóng hoặc nướng giòn. Ăn với đậu hoặc trộn gỏi.'),
  'lemons': ('Chanh vàng', 'Chanh vàng (2 quả)', 'Vắt một ít cho cá, đậu và gỏi thêm tươi.'),
  'groundpork': ('Thịt heo xay', 'Thịt heo xay (1 lb)', 'Xào với tỏi để ăn mì, hoặc nêm làm xúc xích ăn sáng.'),
 },
 'zh': {
  'catfish': ('鲶鱼', '冷冻鲶鱼片（1 磅）', '肉质细嫩，熟得快。裹玉米面煎炸或烤都可以。'),
  'kimchi': ('韩式泡菜', '韩式泡菜（16 盎司一罐）', '辣味发酵白菜。大多含鱼露；纯素泡菜会在标签上注明。'),
  'feta': ('菲达奶酪', '菲达奶酪碎（6 盎司）', '咸香带酸，放一点就够。'),
  'tofu': ('老豆腐', '老豆腐（14 盎司）', '压出水分后煎或炒。便宜的植物蛋白。'),
  'favabeans': ('罐头蚕豆', '罐头蚕豆（15 盎司）', '也叫“ful”。埃及蚕豆泥（ful medames）的主料。'),
  'blackeyedpeas': ('黑眼豆', '干黑眼豆（1 磅）', '不用泡，煮一个小时左右就软了。'),
  'biscuits': ('冷藏饼干面团', '冷藏饼干面团（16 盎司一罐，8 个）', '直接从罐里拿出来烤，约 15 分钟。'),
  'pita': ('皮塔饼', '皮塔饼（6 个）', '加热或烤脆。配豆子吃或拌沙拉都好。'),
  'lemons': ('柠檬', '柠檬（2 个）', '挤一点，让鱼、豆子和沙拉更清爽。'),
  'groundpork': ('猪肉末', '猪肉末（1 磅）', '加蒜炒香拌面，或调味做早餐香肠。'),
 },
}

# New ingredient words (priced) and seasoning words (extras), in each language. DRAFT.
WORDS = {
 'es': {'catfish': 'bagre', 'kimchi': 'kimchi', 'feta': 'queso feta', 'fava beans': 'habas', 'black-eyed peas': 'frijoles carita',
        'biscuits': 'biscuits refrigerados', 'pita': 'pan pita', 'lemon': 'limón amarillo', 'ground pork': 'carne de cerdo molida',
        'red beans': 'frijoles rojos', 'spinach': 'espinacas', 'cucumber': 'pepino', 'zucchini': 'calabacita', 'tofu': 'tofu',
        'baking powder': 'polvo para hornear', 'turmeric': 'cúrcuma', 'cumin': 'comino', 'curry powder': 'curry en polvo',
        'paprika': 'pimentón', 'sugar': 'azúcar', 'chipotle peppers in adobo': 'chiles chipotles en adobo', 'miso': 'miso',
        'black pepper': 'pimienta negra', 'sumac': 'zumaque (sumac)', 'garam masala': 'garam masala', 'gochujang': 'gochujang (pasta coreana de chile)',
        'chili oil': 'aceite de chile', 'Sichuan peppercorns': 'pimienta de Sichuan'},
 'vi': {'catfish': 'cá trê', 'kimchi': 'kim chi', 'feta': 'phô mai feta', 'fava beans': 'đậu fava', 'black-eyed peas': 'đậu mắt đen',
        'biscuits': 'bánh biscuit làm lạnh', 'pita': 'bánh mì pita', 'lemon': 'chanh vàng', 'ground pork': 'thịt heo xay',
        'red beans': 'đậu đỏ', 'spinach': 'rau bina', 'cucumber': 'dưa leo', 'zucchini': 'bí ngòi', 'tofu': 'đậu phụ',
        'baking powder': 'bột nở', 'turmeric': 'nghệ', 'cumin': 'thì là Ai Cập (cumin)', 'curry powder': 'bột cà ri',
        'paprika': 'ớt bột paprika', 'sugar': 'đường', 'chipotle peppers in adobo': 'ớt chipotle ngâm sốt adobo', 'miso': 'miso',
        'black pepper': 'tiêu đen', 'sumac': 'sumac', 'garam masala': 'garam masala', 'gochujang': 'gochujang (tương ớt Hàn Quốc)',
        'chili oil': 'dầu ớt', 'Sichuan peppercorns': 'tiêu Tứ Xuyên'},
 'zh': {'catfish': '鲶鱼', 'kimchi': '韩式泡菜', 'feta': '菲达奶酪', 'fava beans': '蚕豆', 'black-eyed peas': '黑眼豆',
        'biscuits': '冷藏饼干面团', 'pita': '皮塔饼', 'lemon': '柠檬', 'ground pork': '猪肉末',
        'red beans': '红芸豆', 'spinach': '菠菜', 'cucumber': '黄瓜', 'zucchini': '西葫芦', 'tofu': '豆腐',
        'baking powder': '泡打粉', 'turmeric': '姜黄', 'cumin': '孜然', 'curry powder': '咖喱粉',
        'paprika': '红椒粉', 'sugar': '糖', 'chipotle peppers in adobo': '腌渍烟熏辣椒（chipotle in adobo）', 'miso': '味噌',
        'black pepper': '黑胡椒', 'sumac': '漆树粉（sumac）', 'garam masala': '印度综合香料（garam masala）', 'gochujang': '韩式辣酱',
        'chili oil': '辣椒油', 'Sichuan peppercorns': '花椒'},
}


def main():
    fixes = json.loads((ROOT / 'scripts' / 'seed-recipe-fixes.json').read_text(encoding='utf-8'))['fixes']
    path = ROOT / 'data' / 'seed-recipes.json'
    recipes = json.loads(path.read_text(encoding='utf-8'))
    for key, f in fixes.items():
        r = recipes[int(key) - 1]
        for k in ('ingredients', 'extras', 'avoid'):
            if k in f: r[k] = f[k]
        r['instructions'] = f['en']
    path.write_text(json.dumps(recipes, indent=2, ensure_ascii=True), encoding='utf-8')

    for code, k in LANGS.items():
        p = ROOT / 'public' / 'i18n' / 'data' / f'{code}.json'
        d = json.loads(p.read_text(encoding='utf-8'))
        for key, f in fixes.items():
            d['recipes'][key]['instructions'] = f[k]
        for fid, (name, full, note) in FOODS[k].items():
            d['foods'][fid] = {'name': name, 'full': full, 'note': note}
        d['ingredients'].update(WORDS[k])
        p.write_text(json.dumps(d, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'{len(fixes)} recipes updated in 4 languages; {len(FOODS["es"])} foods and {len(WORDS["es"])} words translated.')


if __name__ == '__main__':
    main()
