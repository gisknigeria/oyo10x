// memberScope decides which member rows a login can see. A mistake here is a
// data leak between candidates, not a cosmetic bug, so it is tested directly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { memberScope, scopedLgas, scopedWards } from './scope.js';
import { WARDS, SENATORIAL, STATE_CONST } from './data/geo.js';
import { wardsInStateConstituency } from './data/ward-constituencies.js';

const candidate = (scope_type, scope_value) =>
  ({ id: 7, role: 'candidate', scope_type, scope_value, member_id: null });

test('an admin sees everyone', () => {
  const s = memberScope({ id: 1, role: 'admin', scope_type: 'state' });
  assert.equal(s.sql, '1=1');
  assert.deepEqual(s.params, []);
});

test('a plain unit promoter sees only people they added, never by geography', () => {
  const s = memberScope({ id: 9, role: 'unit_promoter', member_id: 42, is_coordinator: 0 });
  assert.match(s.sql, /upline_user_id/);
  assert.doesNotMatch(s.sql, /\blga\b/, 'must not widen to a whole LGA');
  assert.deepEqual(s.params, [42, 9, 42]);
});

test('a coordinator is scoped by geography, not ownership', () => {
  const s = memberScope({ id: 9, role: 'unit_promoter', member_id: 42,
                          is_coordinator: 1, scope_type: 'lga', scope_value: 'Akinyele' });
  assert.equal(s.sql, 'lga = ?');
  assert.deepEqual(s.params, ['Akinyele']);
});

test('a senator is scoped to the LGAs of their district', () => {
  const s = memberScope(candidate('senatorial', 'Oyo Central'));
  const expected = SENATORIAL['Oyo Central'];
  assert.equal(s.params.length, expected.length);
  assert.deepEqual([...s.params].sort(), [...expected].sort());
  // The senatorial correction: Ibadan North belongs to Oyo South, not Central.
  assert.ok(!s.params.includes('Ibadan North'), 'Ibadan North is in Oyo South');
  assert.ok(s.params.includes('Oluyole'), 'Oluyole is in Oyo Central');
});

test('a state assembly candidate is scoped by ward, not by LGA', () => {
  const s = memberScope(candidate('state_const', 'Akinyele I'));
  assert.match(s.sql, /\(lga, ward\) IN/);
  assert.equal(s.params.length, 12, '6 wards, two params each');
});

test('Akinyele I and Akinyele II do not see each other', () => {
  const a = memberScope(candidate('state_const', 'Akinyele I'));
  const b = memberScope(candidate('state_const', 'Akinyele II'));
  const wardsOf = (s) => s.params.filter((_, i) => i % 2 === 1);
  const overlap = wardsOf(a).filter((w) => wardsOf(b).includes(w));
  assert.deepEqual(overlap, [], 'the two halves of Akinyele must not overlap');
  assert.equal(wardsOf(a).length, 6);
  assert.equal(wardsOf(b).length, 6);
});

test('every state constituency produces a usable scope', () => {
  const broken = [];
  for (const name of Object.keys(STATE_CONST)) {
    const s = memberScope(candidate('state_const', name));
    if (s.sql === '1=0' || !s.params.length) broken.push(name);
  }
  assert.deepEqual(broken, [], 'these candidates would see nothing');
});

test('an unknown constituency matches nothing rather than everything', () => {
  // Failing open here would hand a stranger the whole state.
  const s = memberScope(candidate('state_const', 'Not A Real Constituency'));
  assert.equal(s.sql, '1=0');
  const f = memberScope(candidate('federal', 'Nowhere'));
  assert.equal(f.sql, '1=0');
});

test('a polling-unit login with a malformed scope matches nothing', () => {
  const s = memberScope({ id: 3, role: 'candidate', scope_type: 'polling_unit',
                          scope_value: 'incomplete' });
  assert.equal(s.sql, '1=0');
});

test('scopedWards narrows a split LGA but leaves whole LGAs alone', () => {
  const split = scopedWards(candidate('state_const', 'Akinyele I'), 'Akinyele');
  assert.equal(split.length, 6, 'only this half of Akinyele');
  assert.equal(WARDS.Akinyele.length, 12, 'the LGA itself still has twelve');

  const whole = scopedWards(candidate('state_const', 'Afijio'), 'Afijio');
  assert.deepEqual(whole.sort(), [...WARDS.Afijio].sort(), 'unsplit LGA is unchanged');

  const senator = scopedWards(candidate('senatorial', 'Oyo Central'), 'Akinyele');
  assert.equal(senator.length, 12, 'a senator sees the whole LGA');
});

test('scopedLgas gives a state assembly candidate their own LGAs', () => {
  assert.deepEqual(scopedLgas(candidate('state_const', 'Irepo/Olorunsogo')).sort(),
    ['Irepo', 'Olorunsogo']);
  assert.deepEqual(scopedLgas(candidate('state_const', 'Akinyele II')), ['Akinyele']);
});

test('the ward params really are that constituency\'s wards', () => {
  const s = memberScope(candidate('state_const', 'Saki/Atisbo'));
  const expected = wardsInStateConstituency('Saki/Atisbo');
  const pairs = [];
  for (let i = 0; i < s.params.length; i += 2) pairs.push(s.params[i] + '|' + s.params[i + 1]);
  assert.deepEqual(pairs.sort(), expected.map((w) => w.lga + '|' + w.ward).sort());
});
