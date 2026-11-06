"""Build data/zip-districts.json: how each ZIP code's residents split across Austin City Council districts.

Sources:
  • City of Austin Council District Boundaries (data.austintexas.gov, dataset w3v2-cj58; current districts).
    Download: https://data.austintexas.gov/api/geospatial/w3v2-cj58?method=export&format=GeoJSON
  • 2020 Census Redistricting Data (PL 94-171), Texas geographic header (txgeo2020.pl): every census block's
    2020 population and internal point.  https://www2.census.gov/programs-surveys/decennial/2020/data/01-Redistricting_File--PL_94-171/Texas/
  • 2020 Census ZCTA boundaries (cartographic, 1:500k): cb_2020_us_zcta520_500k.  https://www2.census.gov/geo/tiger/GENZ2020/shp/

Method: each census block in Travis, Williamson and Hays counties is placed in a ZIP (ZCTA) and a council
district by its internal point, then weighted by its 2020 population. A ZIP's share in a district is the
share of its residents living there; the rest live outside the City of Austin. Population-weighted, not area.

Run: python3 -I scripts/build-zip-districts.py <districts.geojson> <txgeo2020.pl> <cb_2020_us_zcta520_500k.shp>
"""
import json, sys
import shapefile
from shapely.geometry import shape, Point
from shapely.strtree import STRtree

districts_path, geo_path, zcta_path = sys.argv[1:4]
COUNTIES = {'453', '491', '209'}  # Travis, Williamson, Hays
POP100, INTPTLAT, INTPTLON = 90, 92, 93  # positions in the 2020 PL geographic header (pipe-delimited)

dist = [(f['properties']['district_number'], shape(f['geometry'])) for f in json.load(open(districts_path))['features']]
dtree = STRtree([g for _, g in dist])
city = dist[0][1]
for _, g in dist[1:]: city = city.union(g)
minx, miny, maxx, maxy = city.buffer(0.3).bounds

z_ids, z_geoms = [], []
r = shapefile.Reader(zcta_path)
fields = [f[0] for f in r.fields[1:]]
for sr in r.iterShapeRecords():
    bx = sr.shape.bbox
    if bx[2] < minx or bx[0] > maxx or bx[3] < miny or bx[1] > maxy: continue
    z_ids.append(dict(zip(fields, sr.record))['ZCTA5CE20']); z_geoms.append(shape(sr.shape.__geo_interface__))
ztree = STRtree(z_geoms)

def first_hit(tree, geoms, pt):
    for i in tree.query(pt):
        if geoms[i].contains(pt): return i
    return None

out, blocks, people = {}, 0, 0
for line in open(geo_path, encoding='latin-1'):
    f = line.rstrip('\n').split('|')
    if f[2] != '750' or f[14] not in COUNTIES: continue
    pop, lat, lon = int(f[POP100] or 0), float(f[INTPTLAT]), float(f[INTPTLON])
    if not pop: continue
    pt = Point(lon, lat)
    zi = first_hit(ztree, z_geoms, pt)
    if zi is None: continue
    di = first_hit(dtree, [g for _, g in dist], pt)
    z = out.setdefault(z_ids[zi], {'pop': 0, 'by': {}})
    key = dist[di][0] if di is not None else 'outside'
    z['pop'] += pop; z['by'][key] = z['by'].get(key, 0) + pop
    blocks += 1; people += pop

zips = {}
for z, v in sorted(out.items()):
    shares = {k: round(n / v['pop'], 3) for k, n in sorted(v['by'].items(), key=lambda kv: -kv[1])}
    inside = {k: s for k, s in shares.items() if k != 'outside'}
    if not inside: continue  # ZIPs with no residents in the city
    zips[z] = {'pop2020': v['pop'], 'main': max(inside, key=inside.get), 'shares': shares}
json.dump({'source': 'City of Austin Council District Boundaries (data.austintexas.gov w3v2-cj58); 2020 Census PL 94-171 block population; 2020 Census ZCTA boundaries',
           'method': 'Population-weighted: 2020 census blocks placed by internal point. "main" is the district holding the most of the ZIP\'s city residents; "outside" is the share living outside the City of Austin.',
           'checked': '2026-11-06', 'zips': zips}, open('data/zip-districts.json', 'w'), indent=0)
print(blocks, 'blocks,', people, 'people;', len(zips), 'ZIPs with city residents')
