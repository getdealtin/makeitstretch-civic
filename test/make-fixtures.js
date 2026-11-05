// Regenerates test/fixtures.json from the CURRENT engine (since the Nov 2026 satiety upgrade).
// Run only when an engine change is intended and reviewed: the goldens exist so that
// any unintended change to carts or meal plans fails loudly.
import { writeFileSync } from 'node:fs';
import { GOLDEN } from './cases.js';
import { runNew } from './run-both.js';
const out = Object.fromEntries(GOLDEN.map(g => [g.name, { input: g, expected: runNew(g) }]));
writeFileSync(new URL('./fixtures.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log('wrote', Object.keys(out).length, 'fixtures');
