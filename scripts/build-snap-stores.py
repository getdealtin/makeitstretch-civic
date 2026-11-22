"""Build a city's store list (data/snap-stores-<county>.json) from USDA's SNAP Retailer Locator data.

Source: USDA Food and Nutrition Administration, "Historical SNAP Retailer Locator Data"
https://www.fna.usda.gov/snap/retailer-locator/data  (CSV in a .zip; public data)
The release used here is "current as of Dec. 31, 2025" (page updated Feb 19, 2026).

Run:  python3 -I scripts/build-snap-stores.py "<path to the unzipped CSV>" [--state TX --county Travis]
      (Travis County, TX is the default; a new city passes its own state and county, then names the
      output file in its config: local.stores.)
      python3 -I scripts/build-snap-stores.py "<CSV>" --national
      (makeitstretch.org, owner decision Nov 22 2026: every grocery store and farmers market in the U.S. that
      takes SNAP → data/snap-stores-us.json, and each ZIP code's store mix → data/store-mix-by-zip.json.)
Keeps stores in the county that were still authorized (no end date). Store types are
USDA's own. Display names drop store numbers and tidy chain names; usda_name keeps the original.
"""
# USDA's CSV drops leading zeros ("6040" for 06040, CT), so every ZIP is padded back to 5 digits.
import argparse, csv, json, re

SRC_ASOF = '2025-12-31'
GROUP = {
    'Supermarket': 'grocery', 'Super Store': 'grocery', 'Large Grocery Store': 'grocery',
    'Medium Grocery Store': 'grocery', 'Small Grocery Store': 'grocery',
    "Farmers' Market": 'market', 'Convenience Store': 'convenience',
}
FULL = {'Supermarket', 'Super Store', 'Large Grocery Store'}
CHAINS = [  # (pattern on the USDA name, display name)
    (r'^HEB Central Market', 'Central Market'), (r'^Central Market', 'Central Market'), (r'^HEB\b', 'H-E-B'),
    (r'^Target\b', 'Target'), (r'^Randalls\b', 'Randalls'), (r'^Walmart Supercenter', 'Walmart Supercenter'),
    (r'^Walmart\b', 'Walmart'), (r'^Costco', 'Costco'), (r"^Sam'?s Club", "Sam's Club"), (r'^Aldi\b', 'Aldi'),
    (r"^Trader Joe'?s", "Trader Joe's"), (r'^Whole Foods', 'Whole Foods Market'), (r'^Sprouts', 'Sprouts Farmers Market'),
    (r'^Fiesta Mart', 'Fiesta Mart'), (r'^Natural Grocers', 'Natural Grocers'), (r'^Vitamin Cottage', 'Natural Grocers'),
    (r'^99 Ranch', '99 Ranch Market'), (r'^Brookshire Brothers', 'Brookshire Brothers'),
    (r'^Sfc Farmers. Market At Sunset Valley', "SFC Farmers' Market Sunset Valley"),
    (r'^SFC Farmers Market Downtown', "SFC Farmers' Market Downtown"),
]
MEMBERSHIP = {'Costco', "Sam's Club"}


def clean(name):
    n = re.sub(r'\s+', ' ', name).strip()
    for pat, disp in CHAINS:
        if re.search(pat, n, re.I):
            return disp
    n = re.sub(r'\b(LLC|L\.?P\.?|Inc\.?|N/A|NAFMNP)\b\.?', '', n, flags=re.I)
    n = re.sub(r'(\s+(#\s*)?[A-Z]?\s?\d+[A-Z]?)+\s*$', '', n).strip(' ,')
    if n.isupper():
        n = re.sub(r"(\w)['’]S\b", r"\1's", n.title())  # "GRISTEDE'S" → "Gristede's", not "Gristede'S"
    return re.sub(r'\s+', ' ', n).strip()


def main(path, state='TX', county='Travis'):
    out = []
    for r in csv.DictReader(open(path, encoding='utf-8-sig')):
        if r['State'] != state or r['County'].strip().upper() != county.upper() or r['End Date'].strip():
            continue
        if not r['Latitude'] or not r['Longitude']:
            continue
        name = clean(r['Store Name'])
        out.append({
            'id': int(r['Record ID']), 'name': name, 'usda_name': r['Store Name'].strip(),
            'type': r['Store Type'], 'group': GROUP.get(r['Store Type'], 'other'),
            'full': r['Store Type'] in FULL, 'membership': name in MEMBERSHIP,
            'addr': ' '.join(x for x in [r['Street Number'].strip(), r['Street Name'].strip()] if x),
            'zip': r['Zip Code'].strip()[:5].zfill(5), 'lat': round(float(r['Latitude']), 5), 'lon': round(float(r['Longitude']), 5),
        })
    out.sort(key=lambda s: s['id'])
    dest = f'data/snap-stores-{county.lower().replace(" ", "-")}.json'
    json.dump({'source': 'USDA SNAP Retailer Locator historical data', 'as_of': SRC_ASOF, 'county': f'{county}, {state}', 'stores': out},
              open(dest, 'w'), separators=(',', ':'))
    print(len(out), 'stores written to', dest)


# ── National: the main site's "Where to shop", and each ZIP code's store mix for the insights ─────────
LISTED = set(GROUP) - {'Convenience Store'}  # what "Where to shop" lists: grocery stores and farmers markets
TYPES = sorted(LISTED)


def national(path):
    import math, os
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
    centers = json.load(open(os.path.join(root, 'zip-centroids.json')))
    listed, full, mix = [], [], {}
    for r in csv.DictReader(open(path, encoding='utf-8-sig')):
        if r['End Date'].strip() or not r['Latitude'] or not r['Longitude']:
            continue
        t, z = r['Store Type'], r['Zip Code'].strip()[:5].zfill(5)
        lat, lon = round(float(r['Latitude']), 5), round(float(r['Longitude']), 5)
        # Store mix inside each ZIP code, by USDA store type (same groups as the City report).
        m = mix.setdefault(z, [None, 0, 0, 0, 0, 0])  # nearest full grocery (mi), full, other grocery, markets, convenience, dollar/other
        if t in FULL: m[1] += 1
        elif GROUP.get(t) == 'grocery': m[2] += 1
        elif t == "Farmers' Market": m[3] += 1
        elif t == 'Convenience Store': m[4] += 1
        elif t == 'Combination Grocery/Other': m[5] += 1  # mostly dollar stores and pharmacies
        if t in FULL: full.append((lat, lon))
        if t in LISTED:
            name = clean(r['Store Name'])
            listed.append([int(r['Record ID']), name, TYPES.index(t),
                           ' '.join(x for x in [r['Street Number'].strip(), r['Street Name'].strip()] if x),
                           r['City'].strip().title(), r['State'].strip(), z, lat, lon])
    listed.sort(key=lambda s: s[0])
    # Nearest full grocery to each ZIP code's center: a 0.5° grid, searched ring by ring.
    grid = {}
    for la, lo in full: grid.setdefault((math.floor(la * 2), math.floor(lo * 2)), []).append((la, lo))
    def mi(a, b):
        p1, p2 = math.radians(a[0]), math.radians(b[0])
        h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2
        return 3958.8 * 2 * math.asin(math.sqrt(h))
    out_mix = {}
    for z, c in centers.items():
        gy, gx = math.floor(c[0] * 2), math.floor(c[1] * 2)
        best = None
        for ring in range(0, 40):
            cells = [(gy + dy, gx + dx) for dy in range(-ring, ring + 1) for dx in range(-ring, ring + 1) if max(abs(dy), abs(dx)) == ring]
            for cell in cells:
                for s in grid.get(cell, []):
                    d = mi(c, s)
                    if best is None or d < best: best = d
            # Every store not yet seen is at least `ring` cells (0.5° each) away; stop once the best is closer.
            if best is not None and best <= ring * 0.5 * 69.0 * math.cos(math.radians(abs(c[0]) + 0.5)):
                break
        m = mix.get(z, [None, 0, 0, 0, 0, 0])
        # Puerto Rico (006, 007, 009) has no SNAP (it has NAP), so no distance: it would only find Virgin Islands stores (008).
        m[0] = round(best, 1) if best is not None and z[:3] not in ('006', '007', '009') else None
        out_mix[z] = m
    json.dump({'source': 'USDA SNAP Retailer Locator historical data', 'as_of': SRC_ASOF, 'county': 'United States',
               'cols': ['id', 'name', 'type', 'addr', 'city', 'state', 'zip', 'lat', 'lon'], 'types': TYPES, 'stores': listed},
              open(os.path.join(root, 'snap-stores-us.json'), 'w'), separators=(',', ':'))
    json.dump({'source': 'USDA SNAP Retailer Locator historical data', 'as_of': SRC_ASOF,
               'note': 'Per ZIP code: miles from its center to the nearest supermarket, super store or large grocery; then SNAP stores inside the ZIP code by USDA type.',
               'cols': ['nearest_full_miles', 'full', 'other_grocery', 'markets', 'convenience', 'dollar_or_other'], 'zips': out_mix},
              open(os.path.join(root, 'store-mix-by-zip.json'), 'w'), separators=(',', ':'))
    print(len(listed), 'stores in snap-stores-us.json;', len(out_mix), 'ZIP codes in store-mix-by-zip.json')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('csv'); ap.add_argument('--state', default='TX'); ap.add_argument('--county', default='Travis')
    ap.add_argument('--national', action='store_true', help='every U.S. grocery store and farmers market, plus each ZIP code\'s store mix')
    a = ap.parse_args()
    national(a.csv) if a.national else main(a.csv, a.state, a.county)
