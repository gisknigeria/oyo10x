// Who can see whose members.
//
// Its own module so it can be tested directly -- importing index.js starts a
// server. This is the function that keeps one candidate's registrants out of
// another candidate's dashboard, so it is worth testing on its own.

import { ADMIN_ROLES, normaliseRole, isUnitPromoterRole, isGrassrootRole } from './auth.js';
import { LGAS, WARDS, lgasForScope } from './data/geo.js';
import { wardsInStateConstituency } from './data/ward-constituencies.js';

/**
 * Build a SQL WHERE fragment limiting `members` rows to what this user may see.
 *
 *  - Admin: everyone.
 *  - Plain Unit Promoter (not a Coordinator): only the people THEY personally
 *    added -- ownership, not geography. Two promoters can share a polling
 *    unit and must never see each other's registrants.
 *  - Coordinator, Candidate, Admin: by geography -- their assigned
 *    ward/LGA/constituency/state.
 *
 * Returns { sql, params }. The fragment names bare columns, so a caller
 * joining `members` under an alias rewrites them (see index.js).
 */
export function memberScope(user) {
  if (ADMIN_ROLES.has(normaliseRole(user.role))) return { sql: '1=1', params: [] };

  if ((isUnitPromoterRole(user.role) || isGrassrootRole(user.role))
      && !Number(user.is_coordinator)) {
    return {
      sql: '(id = ? OR upline_user_id = ? OR upline_member_id = ?)',
      params: [user.member_id || -1, user.id, user.member_id || -1],
    };
  }

  if (user.scope_type === 'state') return { sql: '1=1', params: [] };

  // State Assembly seats are the only ones that cut an LGA in half: Akinyele
  // I and II share Akinyele, as do the four split Ibadan LGAs. Matching on
  // LGA alone would show each of those candidates their neighbour's members
  // as well as their own, so they are scoped by ward.
  if (user.scope_type === 'state_const') {
    const wards = wardsInStateConstituency(user.scope_value);
    if (!wards.length) return { sql: '1=0', params: [] };
    return {
      sql: '(lga, ward) IN (' + wards.map(() => '(?,?)').join(',') + ')',
      params: wards.flatMap((w) => [w.lga, w.ward]),
    };
  }

  // Senatorial districts and federal constituencies are made of whole LGAs
  // (the geo tests assert each covers all 33 exactly once), so matching on
  // LGA is both correct and cheaper here.
  if (['senatorial', 'federal'].includes(user.scope_type)) {
    const lgas = lgasForScope(user.scope_type, user.scope_value);
    if (!lgas.length) return { sql: '1=0', params: [] };
    return { sql: 'lga IN (' + lgas.map(() => '?').join(',') + ')', params: lgas };
  }

  if (user.scope_type === 'lga') return { sql: 'lga = ?', params: [user.scope_value] };
  if (user.scope_type === 'ward') return { sql: 'ward = ?', params: [user.scope_value] };
  if (user.scope_type === 'polling_unit') {
    const [lga, ward, pollingUnit] = String(user.scope_value || '').split('|');
    if (!lga || !ward || !pollingUnit) return { sql: '1=0', params: [] };
    return {
      sql: 'lga = ? AND ward = ? AND polling_unit = ?',
      params: [lga, ward, pollingUnit],
    };
  }

  // Fallback: own registrations plus own downline branch.
  return {
    sql: '(upline_user_id = ? OR upline_member_id = ?)',
    params: [user.id, user.member_id || -1],
  };
}

/** The LGAs a user may pick from in dropdowns. */
export function scopedLgas(user) {
  if (ADMIN_ROLES.has(normaliseRole(user.role)) || user.scope_type === 'state') return LGAS;
  if (user.scope_type === 'polling_unit') {
    return [String(user.scope_value || '').split('|')[0]].filter(Boolean);
  }
  return lgasForScope(user.scope_type, user.scope_value);
}

/**
 * The wards a user may pick from inside one LGA. A State Assembly candidate
 * holds part of an LGA, not all of it, so their dropdown must not offer the
 * wards belonging to the candidate next door.
 */
export function scopedWards(user, lga) {
  if (user.scope_type !== 'state_const') return WARDS[lga] || [];
  const mine = wardsInStateConstituency(user.scope_value)
    .filter((w) => w.lga === lga)
    .map((w) => w.ward);
  return mine.length ? mine : (WARDS[lga] || []);
}
