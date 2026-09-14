// Identity & data-integrity checks for registered members.
//
// WHAT IS ACTUALLY POSSIBLE (full write-up in docs/DATA-SOURCES.md):
//
//  - Bank account name -> REAL, cheap, instant. Paystack/Flutterwave resolve an
//    account number to the registered account name. Enable with PAYSTACK_SECRET_KEY.
//  - NIN -> REAL, but NIMC only exposes this through licensed aggregators
//    (Dojah, Prembly, VerifyMe, Youverify). Enable with KYC_PROVIDER + KYC_API_KEY.
//  - PVC / VIN -> NO public INEC API exists. INEC publishes no programmable
//    lookup. The workable route is bulk matching against an INEC register
//    extract for the ward, loaded as CSV (loadVoterRoll below), plus format
//    validation and duplicate detection.
//
// Everything degrades safely: with no keys configured the checks still run
// format validation, duplicate detection and geo-consistency, and mark the
// external checks "not_configured" rather than silently passing them.

import { db } from './db.js';

// Oyo State approximate bounding box (degrees).
const OYO_BOUNDS = { minLat: 6.95, maxLat: 9.25, minLng: 2.6, maxLng: 4.65 };

const digits = (s) => String(s || '').replace(/\D/g, '');
const upper = (s) => String(s || '').toUpperCase().replace(/\s/g, '');
const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z]/g, '');

export function normalisePhone(raw) {
  let d = digits(raw);
  if (d.startsWith('234')) d = '0' + d.slice(3);
  if (d.length === 10 && /^[789]/.test(d)) d = '0' + d;
  return d;
}

export const isValidPhone = (raw) => /^0[789][01]\d{8}$/.test(normalisePhone(raw));
export const isValidNIN = (raw) => /^\d{11}$/.test(digits(raw));
// INEC VIN is 19 alphanumeric characters.
export const isValidVIN = (raw) => /^[A-Z0-9]{19}$/.test(upper(raw));
export const isValidAccount = (raw) => /^\d{10}$/.test(digits(raw));

/* ------------------- NUBAN check digit (no API key) ------------------- */

// The CBN NUBAN standard makes the 10th digit of an account number a checksum
// over the bank code and the 9-digit serial. Verifying it costs nothing and
// needs no provider, and it rejects invented or mistyped account numbers
// outright.
//
// IMPORTANT LIMIT: a valid check digit proves the number is WELL-FORMED. It
// does NOT prove the account exists, and it does not prove who owns it. Only
// NIBSS (through a licensed provider) can answer those.
const NUBAN_WEIGHTS = [3, 7, 3, 3, 7, 3, 3, 7, 3, 3, 7, 3];

export function nubanCheckDigit(bankCode, serial) {
  const seed = String(bankCode).padStart(3, '0') + String(serial).padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(seed[i]) * NUBAN_WEIGHTS[i];
  const d = 10 - (sum % 10);
  return d === 10 ? 0 : d;
}

/**
 * Validate an account number against its bank's NUBAN check digit.
 * Only applies to commercial banks, which use 3-digit CBN codes. Fintechs and
 * microfinance banks (Opay, Palmpay, Kuda, Moniepoint) carry longer codes and a
 * different scheme, so they are reported as not applicable rather than failed.
 */
export function checkNuban(accountNumber, bankName) {
  const acct = digits(accountNumber);
  if (!/^\d{10}$/.test(acct)) {
    return { status: 'fail', reason: 'NUBAN account number must be 10 digits' };
  }
  const code = BANK_CODES[bankName];
  if (!code) {
    return { status: 'skipped', reason: 'No bank selected, so the check digit cannot be computed' };
  }
  if (!/^\d{3}$/.test(code)) {
    return { status: 'not_applicable',
      reason: bankName + ' is a fintech or microfinance bank and does not use the 3-digit NUBAN scheme' };
  }
  const expected = nubanCheckDigit(code, acct.slice(0, 9));
  const actual = Number(acct[9]);
  return expected === actual
    ? { status: 'pass', reason: 'Check digit is valid for ' + bankName }
    : { status: 'fail',
        reason: 'Check digit is wrong for ' + bankName + ' — this account number cannot exist' };
}

/** Does the typed account name plausibly belong to the person being registered? */
export function checkAccountName(m) {
  if (!m.account_name) {
    return { status: 'missing', reason: 'No account name was entered' };
  }
  const acct = norm(m.account_name);
  const first = norm(m.first_name);
  const last = norm(m.last_name);
  if (!first || !last) return { status: 'skipped' };

  const hasLast = acct.includes(last);
  const hasFirst = acct.includes(first);
  if (hasLast && hasFirst) {
    return { status: 'pass', reason: 'Account name matches the registered name' };
  }
  if (hasLast || hasFirst) {
    return { status: 'missing',
      reason: 'Account name "' + m.account_name + '" only partly matches '
            + m.first_name + ' ' + m.last_name };
  }
  return { status: 'fail',
    reason: 'Account name "' + m.account_name + '" does not match '
          + m.first_name + ' ' + m.last_name };
}

export function inOyoState(lat, lng) {
  if (lat == null || lng == null) return null;
  return lat >= OYO_BOUNDS.minLat && lat <= OYO_BOUNDS.maxLat
      && lng >= OYO_BOUNDS.minLng && lng <= OYO_BOUNDS.maxLng;
}

/** Format-level validation. Returns { ok, checks, errors }. */
export function validateFormat(m) {
  const checks = {};
  const errors = [];

  checks.phone = isValidPhone(m.phone)
    ? { status: 'pass', value: normalisePhone(m.phone) }
    : { status: 'fail', reason: 'Not a valid Nigerian mobile number' };
  if (checks.phone.status === 'fail') errors.push('Phone number is not valid');

  checks.nin_format = !m.nin ? { status: 'missing' }
    : isValidNIN(m.nin) ? { status: 'pass' }
    : { status: 'fail', reason: 'NIN must be exactly 11 digits' };
  if (checks.nin_format.status === 'fail') errors.push('NIN must be 11 digits');

  checks.pvc_format = !m.pvc_no ? { status: 'missing' }
    : isValidVIN(m.pvc_no) ? { status: 'pass' }
    : { status: 'fail', reason: 'VIN must be 19 alphanumeric characters' };
  if (checks.pvc_format.status === 'fail') errors.push('PVC/VIN must be 19 characters');

  checks.account_format = !m.account_number ? { status: 'missing' }
    : isValidAccount(m.account_number) ? { status: 'pass' }
    : { status: 'fail', reason: 'NUBAN account number must be 10 digits' };
  if (checks.account_format.status === 'fail') errors.push('Account number must be 10 digits');

  return { ok: errors.length === 0, checks, errors };
}

/** Cross-check the submission against everyone already in the database. */
export function findDuplicates(m, excludeId = null) {
  const dupes = [];
  const scan = (field, value, label) => {
    if (!value) return;
    const rows = db.prepare(
      'SELECT id, code, first_name, last_name, lga, ward FROM members '
      + 'WHERE ' + field + ' = ? AND status != \'rejected\' AND id IS NOT ?'
    ).all(value, excludeId);
    for (const r of rows) dupes.push({ field: label, value, match: r });
  };
  scan('phone', normalisePhone(m.phone), 'Phone number');
  scan('nin', digits(m.nin) || null, 'NIN');
  scan('pvc_no', m.pvc_no ? upper(m.pvc_no) : null, 'PVC/VIN');
  scan('account_number', digits(m.account_number) || null, 'Account number');
  return dupes;
}

/**
 * Same surname + same polling unit, shared accounts, burst entry.
 *
 * `excludeId` is the member being re-checked. It must be excluded from every
 * count, otherwise an existing record matches itself and every member in the
 * database looks like a duplicate the moment checks are re-run.
 */
export function findClustering(m, uplineUserId, excludeId = null) {
  const flags = [];

  const sameName = db.prepare(
    'SELECT COUNT(*) n FROM members WHERE LOWER(last_name) = LOWER(?) '
    + "AND polling_unit = ? AND status != 'rejected' AND id IS NOT ?"
  ).get(m.last_name, m.polling_unit, excludeId).n;
  if (sameName >= 3) {
    flags.push({ code: 'surname_cluster', weight: 25,
      message: sameName + ' other people with the surname "' + m.last_name
             + '" are registered at this polling unit' });
  }

  const account = digits(m.account_number);
  if (account) {
    const sameAccount = db.prepare(
      "SELECT COUNT(*) n FROM members WHERE account_number = ? "
      + "AND status != 'rejected' AND id IS NOT ?"
    ).get(account, excludeId).n;
    if (sameAccount >= 1) {
      flags.push({ code: 'shared_account', weight: 40,
        message: 'This bank account is already used by another registered member' });
    }
  }

  if (uplineUserId) {
    // created_at is stored as a JS ISO string ("...T...Z"), which does not sort
    // against SQLite's datetime() format ("... ..."). Compare like for like.
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const burst = db.prepare(
      'SELECT COUNT(*) n FROM members WHERE upline_user_id = ? '
      + 'AND created_at > ? AND id IS NOT ?'
    ).get(uplineUserId, cutoff, excludeId).n;
    if (burst >= 15) {
      flags.push({ code: 'rapid_entry', weight: 20,
        message: burst + ' registrations from this account in the last 10 minutes' });
    }
  }
  return flags;
}

/* -------- Voter-roll matching against an INEC register extract -------- */

/**
 * Load an INEC register extract into the database. Accepts the common column
 * spellings so an extract can be uploaded without being reshaped first.
 * Returns { loaded, skipped }.
 */
export function loadVoterRoll(rows, batch = null) {
  const stamp = new Date().toISOString();
  const tag = batch || 'batch-' + stamp.slice(0, 19);
  const stmt = db.prepare(
    'INSERT INTO voter_roll (vin,last_name,first_name,lga,ward,polling_unit,loaded_at,batch) '
    + 'VALUES (?,?,?,?,?,?,?,?) '
    + 'ON CONFLICT(vin) DO UPDATE SET last_name=excluded.last_name, '
    + 'first_name=excluded.first_name, lga=excluded.lga, ward=excluded.ward, '
    + 'polling_unit=excluded.polling_unit, loaded_at=excluded.loaded_at, batch=excluded.batch'
  );

  let loaded = 0;
  let skipped = 0;
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const vin = upper(r.vin || r.VIN || r.vin_no || r.voter_id);
      if (!vin) { skipped++; continue; }
      stmt.run(vin,
        r.last_name || r.surname || null,
        r.first_name || r.firstname || null,
        r.lga || r.local_government || null,
        r.ward || null,
        r.polling_unit || r.pu || r.pollingunit || null,
        stamp, tag);
      loaded++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { loaded, skipped };
}

export const voterRollSize = () =>
  db.prepare('SELECT COUNT(*) n FROM voter_roll').get().n;

export function clearVoterRoll() {
  const n = voterRollSize();
  db.exec('DELETE FROM voter_roll');
  return n;
}

export function voterRollBatches() {
  return db.prepare(
    'SELECT batch, COUNT(*) rows, MAX(loaded_at) loaded_at '
    + 'FROM voter_roll GROUP BY batch ORDER BY loaded_at DESC'
  ).all();
}

export function checkVoterRoll(m) {
  if (voterRollSize() === 0) {
    return { status: 'not_configured',
      reason: 'No INEC register extract loaded. Upload one under Admin > Data sources.' };
  }
  const hit = db.prepare('SELECT * FROM voter_roll WHERE vin = ?').get(upper(m.pvc_no));
  if (!hit) return { status: 'fail', reason: 'VIN not found in the loaded INEC extract' };

  const rollPU = String(hit.polling_unit || '').trim().toLowerCase();
  const claimPU = String(m.polling_unit || '').trim().toLowerCase();
  if (rollPU && claimPU && rollPU !== claimPU) {
    return { status: 'mismatch',
      reason: 'Register shows polling unit "' + hit.polling_unit
            + '", submission claims "' + m.polling_unit + '"' };
  }

  // The VIN is in the register at the right polling unit. If the extract also
  // carries a surname, check that it belongs to the person being registered.
  if (hit.last_name && norm(hit.last_name) !== norm(m.last_name)) {
    return { status: 'mismatch',
      reason: 'Register shows this VIN belongs to "' + hit.last_name
            + '", not "' + m.last_name + '"' };
  }

  return { status: 'pass',
    matched: { polling_unit: hit.polling_unit, ward: hit.ward, lga: hit.lga } };
}

/* -------------- External provider adapters (env-gated) -------------- */

/**
 * Demonstration mode. With VERIFY_MODE=simulate the paid lookups return
 * deterministic, plausible answers so the whole verification workflow can be
 * shown end to end without provider keys. Every simulated result carries
 * `simulated: true` and the UI labels it, so it can never be mistaken for a
 * real identity check.
 */
export const isSimulated = () => process.env.VERIFY_MODE === 'simulate';

/** Stable 0-99 value derived from a string, so results do not change on re-run. */
function simBucket(value) {
  let h = 0;
  const s = String(value || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 100;
}

const FAKE_SURNAMES = ['Adeleke', 'Okonkwo', 'Musa', 'Bello', 'Nwachukwu'];

function simulateBank(m) {
  const bucket = simBucket('bank:' + m.account_number);
  if (bucket < 6) {
    return { status: 'fail', simulated: true,
      reason: 'Account number could not be resolved at this bank' };
  }
  if (bucket < 18) {
    // Account belongs to somebody else -- the padding signature worth catching.
    const other = FAKE_SURNAMES[bucket % FAKE_SURNAMES.length];
    return { status: 'pass', simulated: true,
      account_name: (m.first_name || 'IBRAHIM').toUpperCase() + ' ' + other.toUpperCase() };
  }
  return { status: 'pass', simulated: true,
    account_name: (m.last_name + ' ' + m.first_name).toUpperCase() };
}

function simulateNIN(m) {
  const bucket = simBucket('nin:' + m.nin);
  if (bucket < 8) {
    return { status: 'fail', simulated: true, reason: 'NIN not found on the NIMC database' };
  }
  if (bucket < 16) {
    const other = FAKE_SURNAMES[bucket % FAKE_SURNAMES.length];
    return { status: 'pass', simulated: true,
      first_name: m.first_name, last_name: other, phone: m.phone };
  }
  return { status: 'pass', simulated: true,
    first_name: m.first_name, last_name: m.last_name, phone: m.phone };
}

async function resolveBankAccount(accountNumber, bankName) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    return { status: 'not_configured',
      reason: 'Set PAYSTACK_SECRET_KEY to resolve account names automatically' };
  }
  const code = BANK_CODES[bankName];
  if (!code) return { status: 'skipped', reason: 'No bank code mapped for "' + bankName + '"' };
  try {
    const url = 'https://api.paystack.co/bank/resolve?account_number='
              + digits(accountNumber) + '&bank_code=' + code;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + key } });
    const j = await r.json();
    if (!j.status) return { status: 'fail', reason: j.message || 'Account could not be resolved' };
    return { status: 'pass', account_name: j.data.account_name };
  } catch (e) {
    return { status: 'error', reason: e.message };
  }
}

async function verifyNIN(nin) {
  const provider = process.env.KYC_PROVIDER;
  const key = process.env.KYC_API_KEY;
  if (!provider || !key) {
    return { status: 'not_configured',
      reason: 'Set KYC_PROVIDER (dojah|prembly) and KYC_API_KEY to verify NIN against NIMC' };
  }
  const endpoints = {
    dojah: {
      url: 'https://api.dojah.io/api/v1/kyc/nin?nin=' + digits(nin),
      headers: { Authorization: key, AppId: process.env.KYC_APP_ID || '' },
    },
    prembly: {
      url: 'https://api.prembly.com/identitypass/verification/nin',
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: digits(nin) }),
    },
  };
  const cfg = endpoints[provider];
  if (!cfg) return { status: 'error', reason: 'Unknown KYC_PROVIDER "' + provider + '"' };
  try {
    const r = await fetch(cfg.url, {
      method: cfg.method || 'GET', headers: cfg.headers, body: cfg.body,
    });
    const j = await r.json();
    const d = j.entity || j.data || j;
    if (!d || (!d.firstname && !d.first_name)) {
      return { status: 'fail', reason: j.message || 'NIN not found' };
    }
    return { status: 'pass',
      first_name: d.firstname || d.first_name,
      last_name: d.surname || d.last_name,
      phone: d.telephoneno || d.phone_number };
  } catch (e) {
    return { status: 'error', reason: e.message };
  }
}

/** Full verification pass. Returns { checks, flags, riskScore, autoClear }. */
export async function runChecks(m, opts = {}) {
  const { uplineUserId = null, excludeId = null, external = true } = opts;
  const fmt = validateFormat(m);
  const checks = Object.assign({}, fmt.checks);
  const flags = [];

  for (const e of fmt.errors) flags.push({ code: 'format', weight: 30, message: e });

  const dupes = findDuplicates(m, excludeId);
  checks.duplicates = dupes.length
    ? { status: 'fail', count: dupes.length, matches: dupes }
    : { status: 'pass' };
  for (const d of dupes) {
    flags.push({ code: 'duplicate', weight: 50,
      message: d.field + ' already registered to ' + d.match.first_name + ' '
             + d.match.last_name + ' (' + d.match.code + ')' });
  }

  for (const f of findClustering(m, uplineUserId, excludeId)) flags.push(f);

  const inside = inOyoState(m.lat, m.lng);
  checks.location = m.lat == null
    ? { status: 'missing', reason: 'No GPS captured at registration' }
    : inside
      ? { status: 'pass', lat: m.lat, lng: m.lng }
      : { status: 'fail', reason: 'Capture location falls outside Oyo State' };
  if (checks.location.status === 'fail') {
    flags.push({ code: 'geo_outside', weight: 35, message: 'Registered from outside Oyo State' });
  } else if (checks.location.status === 'missing') {
    flags.push({ code: 'geo_missing', weight: 10, message: 'No GPS captured at registration' });
  }

  checks.voter_roll = checkVoterRoll(m);
  if (checks.voter_roll.status === 'fail' || checks.voter_roll.status === 'mismatch') {
    flags.push({ code: 'voter_roll', weight: 45, message: checks.voter_roll.reason });
  }

  // Keyless bank checks. These cost nothing and need no provider.
  checks.nuban = m.account_number
    ? checkNuban(m.account_number, m.bank_name)
    : { status: 'missing', reason: 'No account number entered' };
  if (checks.nuban.status === 'fail') {
    flags.push({ code: 'nuban_invalid', weight: 35, message: checks.nuban.reason });
  }

  checks.account_name = checkAccountName(m);
  if (checks.account_name.status === 'fail') {
    flags.push({ code: 'account_name_mismatch', weight: 20, message: checks.account_name.reason });
  }

  // Names confirmed from a real bank payment file outrank every other signal,
  // because the bank itself returned them.
  if (m.bank_verified_name) {
    const confirmed = norm(m.bank_verified_name);
    const match = confirmed.includes(norm(m.last_name)) && confirmed.includes(norm(m.first_name));
    checks.bank_confirmed = match
      ? { status: 'pass',
          reason: 'Confirmed by the bank as "' + m.bank_verified_name + '"',
          source: m.bank_verified_source }
      : { status: 'fail',
          reason: 'The bank paid "' + m.bank_verified_name + '", not '
                + m.first_name + ' ' + m.last_name,
          source: m.bank_verified_source };
    if (!match) {
      flags.push({ code: 'bank_confirmed_mismatch', weight: 60,
        message: checks.bank_confirmed.reason });
    }
  }

  if (external) {
    const sim = isSimulated();

    checks.nin_identity = !(m.nin && isValidNIN(m.nin)) ? { status: 'skipped' }
      : sim ? simulateNIN(m) : await verifyNIN(m.nin);

    checks.bank = !(m.account_number && isValidAccount(m.account_number)) ? { status: 'skipped' }
      : sim ? simulateBank(m) : await resolveBankAccount(m.account_number, m.bank_name);

    if (checks.bank.status === 'pass') {
      const resolved = norm(checks.bank.account_name);
      const match = resolved.includes(norm(m.last_name)) && resolved.includes(norm(m.first_name));
      checks.bank.name_match = match;
      if (!match) {
        flags.push({ code: 'bank_name_mismatch', weight: 40,
          message: 'Account belongs to "' + checks.bank.account_name + '", not '
                 + m.first_name + ' ' + m.last_name });
      }
    }
    if (checks.nin_identity.status === 'pass') {
      const match = norm(checks.nin_identity.last_name) === norm(m.last_name);
      checks.nin_identity.name_match = match;
      if (!match) {
        flags.push({ code: 'nin_name_mismatch', weight: 45,
          message: 'NIN is registered to "' + checks.nin_identity.last_name
                 + '", not "' + m.last_name + '"' });
      }
    }
  }

  const riskScore = Math.min(100, flags.reduce((a, f) => a + f.weight, 0));
  return { checks, flags, riskScore, autoClear: riskScore === 0 };
}

// Paystack/NIBSS bank codes for the banks offered in the form.
export const BANK_CODES = {
  'Access Bank': '044', 'Citibank Nigeria': '023', 'Ecobank Nigeria': '050',
  'Fidelity Bank': '070', 'First Bank of Nigeria': '011',
  'First City Monument Bank (FCMB)': '214', 'Globus Bank': '00103',
  'Guaranty Trust Bank (GTB)': '058', 'Heritage Bank': '030', 'Jaiz Bank': '301',
  'Keystone Bank': '082', 'Kuda Microfinance Bank': '50211', 'Lotus Bank': '303',
  'Moniepoint MFB': '50515', 'Opay (Paycom)': '999992', 'Palmpay': '999991',
  'Parallex Bank': '104', 'Polaris Bank': '076', 'Premium Trust Bank': '105',
  'Providus Bank': '101', 'Stanbic IBTC Bank': '221',
  'Standard Chartered Bank': '068', 'Sterling Bank': '232', 'SunTrust Bank': '100',
  'TAJBank': '302', 'Titan Trust Bank': '102', 'Union Bank of Nigeria': '032',
  'United Bank for Africa (UBA)': '033', 'Unity Bank': '215',
  'VFD Microfinance Bank': '566', 'Wema Bank': '035', 'Zenith Bank': '057',
};
