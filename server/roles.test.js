import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseRole, ADMIN_ROLES, isUnitPromoterRole, isCandidateRole } from './auth.js';

test('role aliases are normalised for the new organisation structure', () => {
  assert.equal(normaliseRole('mobiliser'), 'unit_promoter');
  assert.equal(normaliseRole('unit promoter'), 'unit_promoter');
  assert.equal(normaliseRole('Unit Promoter'), 'unit_promoter');
  assert.equal(normaliseRole('grassroot'), 'grassroot');
  assert.equal(normaliseRole('dg'), 'campaign_admin');
  assert.equal(normaliseRole('Campaign Administrator'), 'campaign_admin');
  assert.equal(normaliseRole('candidate'), 'candidate');
});

test('permission checks recognise the new admin and field roles', () => {
  assert.ok(ADMIN_ROLES.has('campaign_admin'));
  assert.ok(ADMIN_ROLES.has('superadmin'));
  assert.ok(isUnitPromoterRole('unit_promoter'));
  assert.ok(isUnitPromoterRole('mobiliser'));
  assert.ok(isCandidateRole('candidate'));
  assert.ok(!isCandidateRole('grassroot'));
});
