"""Build data/open-eligibility.json: the Open Eligibility service taxonomy, maintained by Open Referral.

Source: https://github.com/openreferral/openeligibility (taxonomy.csv). License: CC BY-SA 3.0, a derivative
of "Human Services Taxonomy" by Aunt Bertha, Inc. Used to tag help listings and needs in the HSDS export
(/api/hsds) and the City report, so partners can read them in a standard vocabulary.

Run: git clone --depth 1 https://github.com/openreferral/openeligibility.git <dir>
     python3 -I scripts/build-open-eligibility.py <dir>
"""
import csv, json, sys, os, subprocess

d = sys.argv[1]
rows = list(csv.DictReader(open(os.path.join(d, 'taxonomy.csv'), encoding='utf-8')))
commit = subprocess.run(['git', '-C', d, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
terms = {r['id']: {'name': r['name'], 'parent': r['parent_id'] if r['parent_id'] != '0' else None} for r in rows}
out = {
    'name': 'Open Eligibility',
    'source': 'https://github.com/openreferral/openeligibility',
    'commit': commit,
    'license': 'CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/). A derivative of "Human Services Taxonomy" by Aunt Bertha, Inc.; maintained by Open Referral.',
    'checked': '2026-11-06',
    'terms': terms,
}
json.dump(out, open('data/open-eligibility.json', 'w'), indent=0, ensure_ascii=False)
print(len(terms), 'terms, commit', commit[:7])
