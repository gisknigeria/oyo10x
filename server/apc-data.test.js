import test from 'node:test';
import assert from 'node:assert/strict';
import { readApcFile } from './seed-apc.js';
import { LGAS, WARDS } from './data/geo.js';

test('APC register file: clean, de-duplicated, and keyed to geo.js names', () => {
  const rows = readApcFile();
  assert.equal(rows.length, 112268);
  const ids = new Set();
  for (const [no, first, , , phone, lga, ward] of rows) {
    assert.ok(LGAS.includes(lga), 'unknown LGA ' + lga);
    if (ward) assert.ok(WARDS[lga].includes(ward), lga + ' / ' + ward);
    assert.ok(first, 'missing first name');
    if (no) { assert.ok(!ids.has(no), 'duplicate ' + no); ids.add(no); }
    // Same normalisation as members.phone, or the 10X match silently misses.
    // Some sheet phones are simply invalid; those are kept as given.
    if (phone) assert.doesNotMatch(phone, /^[789][01]\d{8}$/, 'un-normalised ' + phone);
  }
});
