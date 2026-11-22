"""Build data/snap-share-by-zip.json: how many households use SNAP, per ZIP code, for the SNAP box
("You're not alone: about 1 in 4 households in 60609 use SNAP."). Owner decision, Nov 22 2026.

Source: U.S. Census Bureau, American Community Survey 5-year estimates (2020–2024), table B22003
"Receipt of Food Stamps/SNAP in the Past 12 Months", by ZIP Code Tabulation Area (public data, no key):
https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b22003.dat

Run:  python3 -I scripts/build-snap-share.py "<path to acsdt5y2024-b22003.dat>"

Each ZIP gets n, for "about 1 in n households" (n = 1 / share, rounded), or "most" when 60% or more do.
Left out, so the site says the national figure instead:
  • ZIP codes where fewer households use SNAP than in the U.S. as a whole (the line is there to show
    someone they're not alone; a low local share would do the opposite),
  • ZIP codes with fewer than 300 households, or where the Census margin of error is more than half the
    estimate (too uncertain to state),
  • Puerto Rico (006, 007, 009): SNAP doesn't operate there (it has NAP), so "use SNAP" would be wrong.
"""
import json, os, sys

VINTAGE = 'ACS 5-year estimates, 2020–2024'
PR = ('006', '007', '009')


def main(path):
    us, zips = None, {}
    with open(path, encoding='utf-8') as f:
        cols = f.readline().strip().split('|')
        i_tot, i_snap, i_moe = cols.index('B22003_E001'), cols.index('B22003_E002'), cols.index('B22003_M002')
        for line in f:
            row = line.rstrip('\n').split('|')
            geo = row[0]
            if geo == '0100000US':
                us = (int(row[i_tot]), int(row[i_snap]))
            elif geo.startswith('860Z200US'):
                zips[geo[-5:]] = (int(row[i_tot]), int(row[i_snap]), int(row[i_moe]))
    us_share = us[1] / us[0]
    out = {}
    for z, (tot, snap, moe) in sorted(zips.items()):
        if z[:3] in PR or tot < 300 or snap == 0 or moe > snap * 0.5:
            continue
        share = snap / tot
        if share < us_share:
            continue
        out[z] = 'most' if share >= 0.6 else max(2, round(1 / share))
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
    json.dump({'source': 'U.S. Census Bureau, American Community Survey, table B22003', 'vintage': VINTAGE,
               'us': {'households': us[0], 'snap': us[1], 'n': round(1 / us_share)}, 'zips': out},
              open(os.path.join(root, 'snap-share-by-zip.json'), 'w'), separators=(',', ':'))
    print(f'U.S.: {us[1]:,} of {us[0]:,} households ({us_share:.1%}, about 1 in {round(1 / us_share)}); '
          f'{len(out)} of {len(zips)} ZIP codes kept')


if __name__ == '__main__':
    main(sys.argv[1])
