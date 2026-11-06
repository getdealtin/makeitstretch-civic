// Annual updates reminder (/admin): every item has dates, sorted by due date, statuses follow the clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maintenanceFor } from '../server/maintenance.js';
import { CITIES } from '../cities/index.js';

test('annual updates: all items, sorted, with statuses', () => {
  const city = CITIES.austin;
  const items = maintenanceFor(city, new Date('2026-11-06T12:00:00Z'));
  const ids = items.map(i => i.id).sort();
  assert.deepEqual(ids, ['access', 'bls', 'links', 'notes', 'snap', 'stores', 'tfp']);
  for (const i of items) {
    assert.match(i.last, /^\d{4}-\d{2}-\d{2}$/); assert.match(i.due, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(i.due > i.last); assert.ok(i.how && i.what);
  }
  assert.deepEqual(items.map(i => i.due), [...items.map(i => i.due)].sort());
  // Two years on, everything is due; today, the BLS check (just done) is not.
  assert.ok(maintenanceFor(city, new Date('2028-12-01')).every(i => i.status === 'due'));
  assert.equal(items.find(i => i.id === 'bls').status, 'ok');
});
