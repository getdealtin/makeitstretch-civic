"""Build data/snap-stores-travis.json from USDA's SNAP Retailer Locator data.

Source: USDA Food and Nutrition Administration, "Historical SNAP Retailer Locator Data"
https://www.fna.usda.gov/snap/retailer-locator/data  (CSV in a .zip; public data)
The release used here is "current as of Dec. 31, 2025" (page updated Feb 19, 2026).

Run:  python3 -I scripts/build-snap-stores.py "<path to the unzipped CSV>"
Keeps stores in Travis County, TX that were still authorized (no end date). Store types are
USDA's own. Display names drop store numbers and tidy chain names; usda_name keeps the original.
"""
import csv, json, re, sys

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
        n = n.title()
    return re.sub(r'\s+', ' ', n).strip()


def main(path):
    out = []
    for r in csv.DictReader(open(path, encoding='utf-8-sig')):
        if r['State'] != 'TX' or r['County'].strip().upper() != 'TRAVIS' or r['End Date'].strip():
            continue
        if not r['Latitude'] or not r['Longitude']:
            continue
        name = clean(r['Store Name'])
        out.append({
            'id': int(r['Record ID']), 'name': name, 'usda_name': r['Store Name'].strip(),
            'type': r['Store Type'], 'group': GROUP.get(r['Store Type'], 'other'),
            'full': r['Store Type'] in FULL, 'membership': name in MEMBERSHIP,
            'addr': ' '.join(x for x in [r['Street Number'].strip(), r['Street Name'].strip()] if x),
            'zip': r['Zip Code'][:5], 'lat': round(float(r['Latitude']), 5), 'lon': round(float(r['Longitude']), 5),
        })
    out.sort(key=lambda s: s['id'])
    json.dump({'source': 'USDA SNAP Retailer Locator historical data', 'as_of': SRC_ASOF, 'county': 'Travis, TX', 'stores': out},
              open('data/snap-stores-travis.json', 'w'), separators=(',', ':'))
    print(len(out), 'stores written')


if __name__ == '__main__':
    main(sys.argv[1])
