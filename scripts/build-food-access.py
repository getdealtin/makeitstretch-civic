"""Build a city's food-access file (data/food-access-<county>.json): USDA low-income and low-access (LILA) census tracts in its county.

Sources (USDA Economic Research Service, Food Access Research Atlas, Download the Data page, updated 7/27/2026):
  https://www.ers.usda.gov/data-products/food-access-research-atlas/download-the-data
  • 2015 Food Access Research Atlas (archived)        – distance to supermarkets; 2010 census tracts
  • 2019 Large Retailer Access Map (formerly FARA)     – distance to supermarkets; 2010 census tracts
  • 2025 SNAP-authorized Retailer Access Map (SRAM)    – distance to any SNAP-authorized store except
    farmers markets and delivery routes (so convenience stores count); 2020 census tracts; straight-line distance
Tract → ZIP: U.S. Census Bureau relationship files (2010: zcta_tract_rel_10.txt; 2020: tab20_zcta520_tract20_natl.txt).
Each tract is assigned to the ZIP code holding the largest share of its population (2010) or land (2020).

Measure used: low income and low access at 1 mile (urban) and 10 miles (rural), USDA's standard "1 and 10".

Run: python3 -I scripts/build-food-access.py <dir with the downloaded files> [--state Texas --county Travis
       --fips 48453 --focus 78702,78721,...]
     (Travis County, TX and Austin's focus ZIP codes are the defaults; a new city passes its own, the same
     focus ZIP codes as its config's focus_zips, then names the output file in its config: local.food_access.)
"""
import argparse, csv, json, os

AUSTIN_FOCUS = '78702,78721,78723,78724,78741,78744,78725,78617,78719,78752,78753,78758'
FOCUS, STATE, COUNTY, FIPS = [], 'Texas', 'Travis', '48453'  # set from the command line in __main__


def assign_2010(path):
    best = {}
    for r in csv.DictReader(open(path, encoding='utf-8-sig')):
        if r['STATE'] != FIPS[:2] or r['COUNTY'] != FIPS[2:]:
            continue
        p = float(r['TRPOPPCT'] or 0)
        if r['GEOID'] not in best or p > best[r['GEOID']][1]:
            best[r['GEOID']] = (r['ZCTA5'], p)
    return {g: z for g, (z, _) in best.items()}


def assign_2020(path):
    best = {}
    for r in csv.DictReader(open(path, encoding='utf-8-sig'), delimiter='|'):
        g = r['GEOID_TRACT_20']
        if not g.startswith(FIPS) or not r['GEOID_ZCTA5_20']:
            continue
        a = float(r['AREALAND_PART'] or 0)
        if g not in best or a > best[g][1]:
            best[g] = (r['GEOID_ZCTA5_20'], a)
    return {g: z for g, (z, _) in best.items()}


def summarize(flags):
    """flags: list of (zip, is_lila)"""
    lila = [z for z, f in flags if f]
    by_zip = {}
    for z in lila:
        by_zip[z] = by_zip.get(z, 0) + 1
    return {'tracts': len(flags), 'lila': len(lila), 'lila_focus': sum(z in FOCUS for z in lila),
            'lila_by_focus_zip': {z: by_zip.get(z, 0) for z in FOCUS}}


def main(d):
    z10, z20 = assign_2010(os.path.join(d, 'rel2010.txt')), assign_2020(os.path.join(d, 'rel2020.txt'))
    out = {'source': 'USDA ERS Food Access Research Atlas', 'checked': '2026-11-06', 'measure': 'Low income and low access at 1 mile (urban) / 10 miles (rural)',
           'focus_zips': FOCUS, 'editions': {}}
    # 2015 (xlsx)
    import openpyxl
    wb = openpyxl.load_workbook(os.path.join(d, 'f15', 'FoodAccessResearchAtlasData2015.xlsx'), read_only=True)
    ws = [w for w in wb.worksheets if 'data' in w.title.lower() or 'Food' in w.title][0]
    rows = ws.iter_rows(values_only=True); head = list(next(rows)); ix = {h: i for i, h in enumerate(head)}
    f15 = [(z10.get(str(r[ix['CensusTract']]).zfill(11), ''), str(r[ix['LILATracts_1And10']]) == '1')
           for r in rows if r[ix['State']] == STATE and str(r[ix['County']]).startswith(COUNTY)]
    out['editions']['2015'] = {'name': '2015 Food Access Research Atlas (archived)', 'counts_distance_to': 'supermarkets', **summarize(f15)}
    # 2019 LRAM
    f19 = [(z10.get(r['CensusTract'].zfill(11), ''), r['LILATracts_1And10'] == '1')
           for r in csv.DictReader(open(os.path.join(d, 'lram', 'Food Access Research Atlas.csv'), encoding='latin-1'))
           if r['State'] == STATE and r['County'].startswith(COUNTY)]
    out['editions']['2019'] = {'name': '2019 Large Retailer Access Map', 'counts_distance_to': 'supermarkets', **summarize(f19)}
    # 2025 SRAM
    f25 = [(z20.get(r['CensusTract20'].zfill(11), ''), r['SD_SRAM_LILATracts_1And10'] == '1')
           for r in csv.DictReader(open(os.path.join(d, 'sram', 'SRAM Straight Line Distance Data.csv'), encoding='latin-1'))
           if r['State'] == STATE and r['County20'].startswith(COUNTY)]
    out['editions']['2025'] = {'name': '2025 SNAP-authorized Retailer Access Map', 'counts_distance_to': 'any SNAP-authorized store except farmers markets (convenience stores count)', **summarize(f25)}
    dest = f'data/food-access-{COUNTY.lower().replace(" ", "-")}.json'
    json.dump(out, open(dest, 'w'), indent=1)
    print('written to', dest)
    for y, e in out['editions'].items():
        print(y, e['tracts'], 'tracts;', e['lila'], 'LILA;', e['lila_focus'], 'mostly in focus ZIPs')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('dir'); ap.add_argument('--state', default='Texas'); ap.add_argument('--county', default='Travis')
    ap.add_argument('--fips', default='48453', help='5-digit state+county FIPS code'); ap.add_argument('--focus', default=AUSTIN_FOCUS)
    a = ap.parse_args()
    FOCUS[:] = a.focus.split(','); STATE, COUNTY, FIPS = a.state, a.county, a.fips
    main(a.dir)
