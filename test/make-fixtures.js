// Regenerates test/fixtures.json from the FROZEN LEGACY reference (not the new engine),
// so the goldens always describe the live tool's behavior.
import { writeFileSync } from 'node:fs';
import { GOLDEN } from './cases.js';
import { runLegacy } from './run-both.js';
const out = Object.fromEntries(GOLDEN.map(g => [g.name, { input: g, expected: runLegacy(g) }]));
writeFileSync(new URL('./fixtures.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log('wrote', Object.keys(out).length, 'fixtures');
