// Open Eligibility (Open Referral's service taxonomy, CC BY-SA 3.0): standard categories for the
// help listings, food directory and "Need help with anything else?" needs. Used by the HSDS export
// (server/hsds.js) and the City report, so partners can read our categories in a vocabulary they know.
// Data: data/open-eligibility.json, built by scripts/build-open-eligibility.py from the official file.
import { readFileSync } from 'node:fs';

export const OE = JSON.parse(readFileSync(new URL('../data/open-eligibility.json', import.meta.url), 'utf8'));

/** "1130" → "Food > Food Pantry" (the full path, since some names repeat under different parents). */
export function oePath(code) {
  const parts = [];
  for (let c = String(code); c && OE.terms[c]; c = OE.terms[c].parent) parts.unshift(OE.terms[c].name);
  return parts.join(' > ');
}

// Each of our categories → the closest Open Eligibility terms. Where nothing fits closely, nothing is
// mapped (e.g. "fresh produce" has no term of its own; it stays in the listing's own words).
export const NEED_TERMS = {
  rent:      ['1137', '1138'],  // Housing > Help Pay for Housing; … > Help Pay for Utilities
  health:    ['1206', '1199'],  // Health > Medical Care; Health > Help Pay for Healthcare
  childcare: ['1280'],          // Care > Daytime Care > Childcare
  jobs:      ['1357', '1172'],  // Work > Help Find Work; Transit > Help Pay for Transit
};
export const KIND_TERMS = {
  pantry: ['1130'],             // Food > Food Pantry
  fridge: ['1128'],             // Food > Emergency Food
  meals: ['1131'],              // Food > Free Meals
  mutual_aid: ['1128'],         // Food > Emergency Food
  other: ['1102'],              // Food
};
export const OFFER_TERMS = {
  groceries: ['1130'], meals: ['1131'], baby: ['1155'], hygiene: ['1167'],
  rent: NEED_TERMS.rent, health: ['1206'], childcare: ['1280'], jobs: ['1357'],
};

/** Codes → [{ code, path }], unknown codes dropped. */
export const describe = codes => [...new Set(codes || [])].filter(c => OE.terms[c]).map(c => ({ code: c, path: oePath(c) }));
