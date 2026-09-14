import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { db, nowISO, period as currentPeriod, audit } from './db.js';
import {
  hashPassword, verifyPassword, issueToken, authenticate,
  requireAdmin, tempPassword, referralCode, touchLogin, ADMIN_ROLES,
} from './auth.js';
import {
  LGAS, WARDS, POLLING_UNITS, SENATORIAL, FEDERAL, STATE_CONST, BANKS,
  TOTAL_WARDS, lgasForScope,
} from './data/geo.js';
import {
  runChecks, normalisePhone, loadVoterRoll, voterRollSize,
  clearVoterRoll, voterRollBatches, isSimulated, resolveBankAccount,
} from './verify.js';
import {
  LEVEL_CAPS, ACTIVITY_POINTS, NAIRA_PER_POINT, BASELINE_ACTIVATIONS,
  recomputeActivationPoints, eligibility, payroll, awardTaskPoints,
  downlineCounts, pointsBreakdown, taskCompletion,
} from './points.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
// OYO_UPLOADS lets a host mount a persistent volume for field evidence, the
// same way OYO_DB relocates the database. Both default to the repo folder.
const UPLOAD_DIR = process.env.OYO_UPLOADS || path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
// Auth here is a Bearer token in localStorage, never a cookie, so there is no
// CSRF exposure from allowing cross-origin requests -- this is what makes a
// split deploy (frontend on Vercel, API on Render) safe without extra
// plumbing. ALLOWED_ORIGINS optionally locks it down to specific origins
// (comma-separated, e.g. "https://oyo10x.vercel.app,https://oyo10x.app");
// left unset, every origin is allowed, which is fine given the auth model.
const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const allowedOrigins = new Set([
  'https://oyo10x.vercel.app',
  ...configuredOrigins,
]);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _f, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) =>
      cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8)
              + path.extname(file.originalname || '.jpg')),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ip = (req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress;
const draftToken = () => crypto.randomBytes(24).toString('base64url');

/* ------------------------------ scope rules ------------------------------ */

/**
 * Build a SQL WHERE fragment limiting `members` rows to what this user may see.
 * Leadership sees by geography; field roles see their own network branch.
 */
function memberScope(user) {
  if (ADMIN_ROLES.has(user.role)) return { sql: '1=1', params: [] };

  if (user.scope_type === 'state') return { sql: '1=1', params: [] };

  if (['senatorial', 'federal', 'state_const'].includes(user.scope_type)) {
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

  // Field agent: own registrations plus their own downline branch.
  return {
    sql: '(upline_user_id = ? OR upline_member_id = ?)',
    params: [user.id, user.member_id || -1],
  };
}

function canRegisterLevels(user) {
  if (ADMIN_ROLES.has(user.role) || user.role === 'candidate') {
    return ['ambassador', 'champion', 'mobiliser', 'participant'];
  }
  if (user.role === 'ambassador') return ['champion'];
  if (user.role === 'champion') return ['mobiliser'];
  if (user.role === 'mobiliser') return ['participant'];
  return [];
}

function scopedLgas(user) {
  if (ADMIN_ROLES.has(user.role) || user.scope_type === 'state') return LGAS;
  if (user.scope_type === 'polling_unit') {
    return [String(user.scope_value || '').split('|')[0]].filter(Boolean);
  }
  return lgasForScope(user.scope_type, user.scope_value);
}

/* ------------------------------- health --------------------------------- */

// Unauthenticated, so platform health checks (Render, Fly, Cloud Run) get a 200.
// Deliberately exposes no data beyond liveness.
app.get('/api/health', async (_req, res) => {
  try {
    const users = (await db.prepare('SELECT COUNT(*) n FROM users').get()).n;
    res.json({ status: 'ok', seeded: users > 0, uptime: Math.round(process.uptime()) });
  } catch (e) {
    res.status(503).json({ status: 'degraded', error: e.message });
  }
});

/* -------------------------------- auth ---------------------------------- */

app.post('/api/auth/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const user = await db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)')
    .get(String(username || '').trim());

  if (!user || !verifyPassword(password || '', user.password_hash)) {
    await audit(null, username, 'login_failed', 'user', null, null, ip(req));
    return res.status(401).json({ error: 'Incorrect username or password' });
  }
  if (user.status !== 'active') {
    return res.status(403).json({ error: 'This account has been suspended' });
  }

  await touchLogin(user.id);
  await audit(user.id, user.username, 'login', 'user', user.id, null, ip(req));
  delete user.password_hash;
  res.json({ token: issueToken(user), user });
}));

app.get('/api/me', authenticate, (req, res) => {
  const caps = LEVEL_CAPS[req.user.role] || null;
  res.json({
    user: req.user,
    permissions: {
      is_admin: ADMIN_ROLES.has(req.user.role),
      can_register_levels: canRegisterLevels(req.user),
      can_review: ADMIN_ROLES.has(req.user.role)
        || ['candidate', 'ambassador', 'champion'].includes(req.user.role),
      scoped_lgas: scopedLgas(req.user),
    },
    caps,
  });
});

app.post('/api/auth/change-password', authenticate, wrap(async (req, res) => {
  const { current_password, new_password } = req.body || {};
  const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current_password || '', row.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  await db.prepare('UPDATE users SET password_hash = ?, must_reset = 0 WHERE id = ?')
    .run(hashPassword(new_password), req.user.id);
  audit(req.user.id, req.user.username, 'password_changed', 'user', req.user.id, null, ip(req));
  res.json({ ok: true });
}));

/* ----------------------------- reference data ---------------------------- */

app.get('/api/geo', authenticate, (req, res) => {
  const allowed = scopedLgas(req.user);
  res.json({
    lgas: allowed,
    all_lgas: LGAS,
    wards: Object.fromEntries(allowed.map((l) => [l, WARDS[l]])),
    polling_units: Object.fromEntries(allowed.map((l) => [l, POLLING_UNITS[l]])),
    senatorial: Object.keys(SENATORIAL),
    federal: Object.keys(FEDERAL),
    state_const: Object.keys(STATE_CONST),
    banks: BANKS,
    totals: { lgas: LGAS.length, wards: TOTAL_WARDS },
    levels: canRegisterLevels(req.user),
    activity_points: ACTIVITY_POINTS,
  });
});

app.get('/api/public/geo', (_req, res) => res.json({
  lgas: LGAS, wards: WARDS, polling_units: POLLING_UNITS, banks: BANKS,
}));

app.get('/api/public/registration/:token', wrap(async (req, res) => {
  const draft = await db.prepare(
    'SELECT data_json,expires_at,completed_at FROM registration_drafts WHERE token = ?'
  ).get(req.params.token);
  if (!draft || draft.completed_at || new Date(draft.expires_at) < new Date()) {
    return res.status(404).json({ error: 'This registration link is invalid, expired, or already completed' });
  }
  res.json({ ...JSON.parse(draft.data_json), expires_at: draft.expires_at });
}));

app.post('/api/registration-drafts', authenticate, wrap(async (req, res) => {
  const b = req.body || {};
  if (!String(b.first_name || '').trim() || !String(b.last_name || '').trim() || !b.level) {
    return res.status(400).json({ error: 'First name, last name, and network position are required' });
  }
  const token = draftToken();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare(
    'INSERT INTO registration_drafts (token,creator_user_id,data_json,expires_at,created_at) VALUES (?,?,?,?,?)'
  ).run(token, req.user.id, JSON.stringify({
    first_name: String(b.first_name).trim(), last_name: String(b.last_name).trim(),
    level: b.level, designation: b.designation || '', lga: b.lga || '', ward: b.ward || '',
  }), expires, nowISO());
  res.status(201).json({ token, expires_at: expires });
}));

app.post('/api/public/registration/:token', wrap(async (req, res) => {
  const draft = await db.prepare(
    'SELECT * FROM registration_drafts WHERE token = ?'
  ).get(req.params.token);
  if (!draft || draft.completed_at || new Date(draft.expires_at) < new Date()) {
    return res.status(404).json({ error: 'This registration link is invalid, expired, or already completed' });
  }
  const b = { ...JSON.parse(draft.data_json), ...(req.body || {}) };
  for (const f of ['first_name', 'last_name', 'phone', 'lga', 'ward', 'polling_unit']) {
    if (!String(b[f] || '').trim()) return res.status(400).json({ error: 'Missing ' + f.replace(/_/g, ' ') });
  }
  const payload = {
    first_name: String(b.first_name).trim(), last_name: String(b.last_name).trim(),
    phone: normalisePhone(b.phone), title: b.title || null, designation: b.designation || null,
    pvc_no: b.pvc_no ? String(b.pvc_no).toUpperCase().replace(/\s/g, '') : null,
    nin: b.nin ? String(b.nin).replace(/\D/g, '') : null, bank_name: b.bank_name || null,
    account_number: b.account_number ? String(b.account_number).replace(/\D/g, '') : null,
    account_name: b.account_name || null, lga: b.lga, ward: b.ward,
    polling_unit: String(b.polling_unit).trim(), level: b.level,
    lat: b.lat ?? null, lng: b.lng ?? null, accuracy: b.accuracy ?? null,
  };
  const result = await runChecks(payload, { uplineUserId: draft.creator_user_id });
  const hardFail = result.flags.some((f) => f.code === 'format' || f.code === 'duplicate');
  if (hardFail) return res.status(409).json({ error: 'This entry did not pass validation', flags: result.flags });
  const info = await db.prepare(
    'INSERT INTO members (code,first_name,last_name,phone,title,designation,pvc_no,nin,bank_name,account_number,account_name,lga,ward,polling_unit,level,upline_user_id,lat,lng,accuracy,captured_at,status,checks_json,risk_score,risk_flags,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(referralCode('OYO'), payload.first_name, payload.last_name, payload.phone, payload.title,
    payload.designation, payload.pvc_no, payload.nin, payload.bank_name, payload.account_number,
    payload.account_name, payload.lga, payload.ward, payload.polling_unit, payload.level,
    draft.creator_user_id, payload.lat, payload.lng, payload.accuracy,
    payload.lat != null ? nowISO() : null, result.riskScore >= 50 ? 'flagged' : 'pending',
    JSON.stringify(result.checks), result.riskScore, JSON.stringify(result.flags), nowISO());
  await db.prepare('UPDATE registration_drafts SET completed_at = ? WHERE id = ?').run(nowISO(), draft.id);
  res.status(201).json({ id: Number(info.lastInsertRowid), status: result.riskScore >= 50 ? 'flagged' : 'pending' });
}));

app.post('/api/bank/resolve', authenticate, wrap(async (req, res) => {
  const accountNumber = String(req.body?.account_number || '').replace(/\D/g, '');
  const bankName = String(req.body?.bank_name || '').trim();
  if (!/^\d{10}$/.test(accountNumber)) {
    return res.status(400).json({ error: 'Account number must be exactly 10 digits' });
  }
  if (!bankName) return res.status(400).json({ error: 'Select a bank first' });
  const result = await resolveBankAccount(accountNumber, bankName);
  if (result.status === 'pass') return res.json(result);
  const status = result.status === 'not_configured' ? 503 : 422;
  return res.status(status).json(result);
}));

/* -------------------------------- members -------------------------------- */

const MEMBER_FIELDS = ['first_name', 'last_name', 'phone', 'title', 'designation',
  'pvc_no', 'nin', 'bank_name', 'account_number', 'account_name',
  'lga', 'ward', 'polling_unit', 'level'];

app.post('/api/members', authenticate, wrap(async (req, res) => {
  const b = req.body || {};
  const level = b.level || canRegisterLevels(req.user)[0];

  if (!canRegisterLevels(req.user).includes(level)) {
    return res.status(403).json({ error: 'You cannot register members at the "' + level + '" level' });
  }
  for (const f of ['first_name', 'last_name', 'phone', 'lga', 'ward', 'polling_unit']) {
    if (!String(b[f] || '').trim()) {
      return res.status(400).json({ error: 'Missing required field: ' + f.replace(/_/g, ' ') });
    }
  }
  if (!scopedLgas(req.user).includes(b.lga)) {
    return res.status(403).json({ error: b.lga + ' is outside your constituency' });
  }

  const payload = {
    first_name: String(b.first_name).trim(),
    last_name: String(b.last_name).trim(),
    phone: normalisePhone(b.phone),
    title: b.title || null,
    designation: b.designation || null,
    pvc_no: b.pvc_no ? String(b.pvc_no).toUpperCase().replace(/\s/g, '') : null,
    nin: b.nin ? String(b.nin).replace(/\D/g, '') : null,
    bank_name: b.bank_name || null,
    account_number: b.account_number ? String(b.account_number).replace(/\D/g, '') : null,
    account_name: b.account_name || null,
    lga: b.lga, ward: b.ward, polling_unit: String(b.polling_unit).trim(),
    level,
    lat: b.lat ?? null, lng: b.lng ?? null, accuracy: b.accuracy ?? null,
  };

  const result = await runChecks(payload, { uplineUserId: req.user.id });

  if (req.query.dry_run === '1') return res.json({ preview: true, ...result });

  const hardFail = result.flags.some((f) => f.code === 'format' || f.code === 'duplicate');
  if (hardFail && req.query.force !== '1') {
    return res.status(409).json({
      error: 'This entry did not pass validation',
      flags: result.flags, checks: result.checks, risk_score: result.riskScore,
    });
  }

  const code = referralCode('OYO');
  const info = await db.prepare(
    'INSERT INTO members (code,first_name,last_name,phone,title,designation,pvc_no,nin,'
    + 'bank_name,account_number,account_name,lga,ward,polling_unit,level,'
    + 'upline_user_id,upline_member_id,lat,lng,accuracy,captured_at,status,'
    + 'checks_json,risk_score,risk_flags,created_at) '
    + 'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(code, payload.first_name, payload.last_name, payload.phone, payload.title,
    payload.designation, payload.pvc_no, payload.nin, payload.bank_name,
    payload.account_number, payload.account_name, payload.lga, payload.ward,
    payload.polling_unit, level, req.user.id, req.user.member_id || null,
    payload.lat, payload.lng, payload.accuracy, payload.lat != null ? nowISO() : null,
    result.riskScore >= 50 ? 'flagged' : 'pending',
    JSON.stringify(result.checks), result.riskScore, JSON.stringify(result.flags), nowISO());

  const id = Number(info.lastInsertRowid);
  audit(req.user.id, req.user.username, 'member_registered', 'member', id,
    { code, level, lga: payload.lga, risk: result.riskScore }, ip(req));

  res.status(201).json({
    id, code, status: result.riskScore >= 50 ? 'flagged' : 'pending',
    risk_score: result.riskScore, flags: result.flags, checks: result.checks,
  });
}));

app.get('/api/members', authenticate, wrap(async (req, res) => {
  const scope = memberScope(req.user);
  const where = [scope.sql];
  const params = [...scope.params];

  if (req.query.status) { where.push('status = ?'); params.push(req.query.status); }
  if (req.query.lga) { where.push('lga = ?'); params.push(req.query.lga); }
  if (req.query.ward) { where.push('ward = ?'); params.push(req.query.ward); }
  if (req.query.level) { where.push('level = ?'); params.push(req.query.level); }
  if (req.query.q) {
    where.push('(first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR code LIKE ? OR polling_unit LIKE ?)');
    const like = '%' + req.query.q + '%';
    params.push(like, like, like, like, like);
  }

  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const offset = Number(req.query.offset) || 0;
  const clause = where.join(' AND ');

  const total = (await db.prepare('SELECT COUNT(*) n FROM members WHERE ' + clause).get(...params)).n;
  const rows = await db.prepare(
    'SELECT m.*, u.full_name upline_name, u.username upline_username '
    + 'FROM members m LEFT JOIN users u ON u.id = m.upline_user_id '
    + 'WHERE ' + clause.replace(/\b(status|lga|ward|level|first_name|last_name|phone|code|polling_unit|upline_user_id|upline_member_id)\b/g, 'm.$1')
    + ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?'
  ).all(...params, limit, offset);

  res.json({ total, limit, offset, rows });
}));

app.get('/api/members/:id', authenticate, wrap(async (req, res) => {
  const scope = memberScope(req.user);
  const m = await db.prepare('SELECT * FROM members WHERE id = ? AND (' + scope.sql + ')')
    .get(req.params.id, ...scope.params);
  if (!m) return res.status(404).json({ error: 'Member not found or outside your scope' });

  m.checks = m.checks_json ? JSON.parse(m.checks_json) : null;
  m.flags = m.risk_flags ? JSON.parse(m.risk_flags) : [];
  const per = req.query.period || currentPeriod();

  res.json({
    member: m,
    downline: await downlineCounts(m.id),
    downline_rows: await db.prepare(
      'SELECT id,code,first_name,last_name,phone,level,status,ward,polling_unit '
      + 'FROM members WHERE upline_member_id = ? ORDER BY created_at DESC'
    ).all(m.id),
    eligibility: await eligibility(m, per),
    points: await pointsBreakdown(m.id, per),
    submissions: await db.prepare(
      'SELECT s.*, t.title task_title, t.points task_points FROM submissions s '
      + 'JOIN tasks t ON t.id = s.task_id WHERE s.member_id = ? ORDER BY s.created_at DESC'
    ).all(m.id),
  });
}));

app.post('/api/members/:id/review', authenticate, wrap(async (req, res) => {
  if (!ADMIN_ROLES.has(req.user.role)
      && !['candidate', 'ambassador', 'champion'].includes(req.user.role)) {
    return res.status(403).json({ error: 'You cannot review registrations' });
  }
  const { status, note } = req.body || {};
  if (!['verified', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'status must be verified, rejected or pending' });
  }
  const scope = memberScope(req.user);
  const m = await db.prepare('SELECT * FROM members WHERE id = ? AND (' + scope.sql + ')')
    .get(req.params.id, ...scope.params);
  if (!m) return res.status(404).json({ error: 'Member not found or outside your scope' });

  await db.prepare('UPDATE members SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?')
    .run(status, note || null, req.user.id, nowISO(), req.params.id);

  // A status change alters the upline's activation count, so re-score them.
  if (m.upline_member_id) await recomputeActivationPoints(m.upline_member_id);

  await audit(req.user.id, req.user.username, 'member_' + status, 'member', m.id, { note }, ip(req));
  res.json({ ok: true, status });
}));

app.post('/api/members/:id/recheck', authenticate, requireAdmin, wrap(async (req, res) => {
  const m = await db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Member not found' });
  const result = await runChecks(m, { excludeId: m.id, uplineUserId: m.upline_user_id });
  await db.prepare('UPDATE members SET checks_json = ?, risk_score = ?, risk_flags = ? WHERE id = ?')
    .run(JSON.stringify(result.checks), result.riskScore, JSON.stringify(result.flags), m.id);
  res.json(result);
}));

/* -------------------------------- network -------------------------------- */

app.get('/api/network', authenticate, wrap(async (req, res) => {
  const rootId = req.query.root ? Number(req.query.root) : (req.user.member_id || null);
  const scope = memberScope(req.user);

  // Direct registrations by this login (the top of their visible tree).
  const roots = rootId
    ? await db.prepare('SELECT * FROM members WHERE id = ?').all(rootId)
    : await db.prepare('SELECT * FROM members WHERE upline_user_id = ? AND (' + scope.sql + ') '
                 + 'ORDER BY created_at DESC LIMIT 500')
        .all(req.user.id, ...scope.params);

  const childStmt = await db.prepare(
    'SELECT id,code,first_name,last_name,phone,level,status,lga,ward,polling_unit,risk_score '
    + 'FROM members WHERE upline_member_id = ? ORDER BY created_at'
  );

  const build = async (m, depth) => {
    const node = {
      id: m.id, code: m.code, name: m.first_name + ' ' + m.last_name,
      phone: m.phone, level: m.level, status: m.status,
      lga: m.lga, ward: m.ward, polling_unit: m.polling_unit,
      risk_score: m.risk_score, children: [],
    };
    if (depth < 3) {
      for (const c of await childStmt.all(m.id)) node.children.push(await build(c, depth + 1));
    } else {
      node.truncated = (await childStmt.all(m.id)).length;
    }
    const counts = await downlineCounts(m.id);
    node.verified_downline = counts.verified;
    node.total_downline = counts.total;
    node.meets_baseline = counts.verified >= BASELINE_ACTIVATIONS;
    return node;
  };

  res.json({ baseline: BASELINE_ACTIVATIONS,
    roots: await Promise.all(roots.map((m) => build(m, 0))) });
}));

/* --------------------------------- tasks --------------------------------- */

app.get('/api/tasks', authenticate, wrap(async (req, res) => {
  const per = req.query.period || currentPeriod();
  const rows = await db.prepare(
    'SELECT t.*, (SELECT COUNT(*) FROM submissions s WHERE s.task_id = t.id) submissions, '
    + "(SELECT COUNT(*) FROM submissions s WHERE s.task_id = t.id AND s.status = 'approved') approved "
    + 'FROM tasks t WHERE t.period = ? ORDER BY t.created_at DESC'
  ).all(per);
  for (const t of rows) t.questions = t.questions_json ? JSON.parse(t.questions_json) : [];
  res.json({ period: per, rows, activity_points: ACTIVITY_POINTS });
}));

app.post('/api/tasks', authenticate, requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  if (!String(b.title || '').trim()) return res.status(400).json({ error: 'Task title is required' });

  const info = await db.prepare(
    'INSERT INTO tasks (title,description,type,points,mandatory,requires_photo,requires_location,'
    + 'questions_json,target_level,target_scope_type,target_scope_value,period,opens_at,due_at,'
    + 'status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(
    b.title, b.description || null, b.type || 'canvass',
    Number(b.points) || ACTIVITY_POINTS[b.type] || 5,
    b.mandatory === false ? 0 : 1,
    b.requires_photo ? 1 : 0, b.requires_location === false ? 0 : 1,
    b.questions ? JSON.stringify(b.questions) : null,
    b.target_level || 'all', b.target_scope_type || 'state', b.target_scope_value || null,
    b.period || currentPeriod(), b.opens_at || null, b.due_at || null,
    'open', req.user.id, nowISO()
  );
  audit(req.user.id, req.user.username, 'task_created', 'task', Number(info.lastInsertRowid),
    { title: b.title }, ip(req));
  res.status(201).json({ id: Number(info.lastInsertRowid) });
}));

app.patch('/api/tasks/:id', authenticate, requireAdmin, wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!['open', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'status must be open or closed' });
  }
  await db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
}));

/** Tasks that apply to a given member, with their submission state. */
app.get('/api/tasks/for-member/:memberId', authenticate, wrap(async (req, res) => {
  const m = await db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.memberId);
  if (!m) return res.status(404).json({ error: 'Member not found' });
  const per = req.query.period || currentPeriod();
  const completion = await taskCompletion(m, per);
  const subs = await db.prepare('SELECT * FROM submissions WHERE member_id = ?').all(m.id);
  const byTask = new Map(subs.map((s) => [s.task_id, s]));
  const all = await db.prepare(
    'SELECT * FROM tasks WHERE period = ? '
    + "AND (target_level = 'all' OR target_level = ?) "
    + "AND (target_scope_type = 'state' "
    + "     OR (target_scope_type = 'lga' AND target_scope_value = ?) "
    + "     OR (target_scope_type = 'ward' AND target_scope_value = ?))"
  ).all(per, m.level, m.lga, m.ward);

  res.json({
    member: { id: m.id, code: m.code, name: m.first_name + ' ' + m.last_name, level: m.level },
    completion,
    tasks: all.map((t) => ({
      ...t,
      questions: t.questions_json ? JSON.parse(t.questions_json) : [],
      submission: byTask.get(t.id) || null,
    })),
  });
}));

app.post('/api/tasks/:id/submit', authenticate, upload.single('photo'), wrap(async (req, res) => {
  const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.status !== 'open') return res.status(400).json({ error: 'This task is closed' });

  const memberId = Number(req.body.member_id) || req.user.member_id;
  if (!memberId) return res.status(400).json({ error: 'No member selected for this submission' });

  const scope = memberScope(req.user);
  const m = await db.prepare('SELECT * FROM members WHERE id = ? AND (' + scope.sql + ')')
    .get(memberId, ...scope.params);
  if (!m) return res.status(403).json({ error: 'That member is outside your scope' });

  if (task.requires_photo && !req.file) {
    return res.status(400).json({ error: 'This task requires photo evidence' });
  }
  const lat = req.body.lat ? Number(req.body.lat) : null;
  const lng = req.body.lng ? Number(req.body.lng) : null;
  if (task.requires_location && lat == null) {
    return res.status(400).json({ error: 'This task requires your location' });
  }

  const existing = await db.prepare('SELECT id FROM submissions WHERE task_id = ? AND member_id = ?')
    .get(task.id, memberId);
  if (existing) return res.status(409).json({ error: 'Already submitted for this task' });

  const info = await db.prepare(
    'INSERT INTO submissions (task_id,member_id,user_id,answers_json,photo_path,lat,lng,accuracy,'
    + 'note,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).run(task.id, memberId, req.user.id,
    req.body.answers || null,
    req.file ? '/uploads/' + req.file.filename : null,
    lat, lng, req.body.accuracy ? Number(req.body.accuracy) : null,
    req.body.note || null, 'pending', nowISO());

  audit(req.user.id, req.user.username, 'task_submitted', 'submission',
    Number(info.lastInsertRowid), { task: task.title, member: m.code }, ip(req));
  res.status(201).json({ id: Number(info.lastInsertRowid), status: 'pending' });
}));

app.get('/api/submissions', authenticate, wrap(async (req, res) => {
  const scope = memberScope(req.user);
  const where = ['(' + scope.sql.replace(/\b(lga|ward|upline_user_id|upline_member_id)\b/g, 'm.$1') + ')'];
  const params = [...scope.params];
  if (req.query.status) { where.push('s.status = ?'); params.push(req.query.status); }
  if (req.query.task_id) { where.push('s.task_id = ?'); params.push(req.query.task_id); }

  const rows = await db.prepare(
    'SELECT s.*, t.title task_title, t.points task_points, t.type task_type, '
    + 'm.code member_code, m.first_name, m.last_name, m.lga, m.ward, m.polling_unit '
    + 'FROM submissions s JOIN tasks t ON t.id = s.task_id '
    + 'JOIN members m ON m.id = s.member_id WHERE ' + where.join(' AND ')
    + ' ORDER BY s.created_at DESC LIMIT 500'
  ).all(...params);
  res.json({ rows });
}));

app.post('/api/submissions/:id/review', authenticate, wrap(async (req, res) => {
  if (!ADMIN_ROLES.has(req.user.role)
      && !['candidate', 'ambassador', 'champion'].includes(req.user.role)) {
    return res.status(403).json({ error: 'You cannot review submissions' });
  }
  const { status, note } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved or rejected' });
  }
  const s = await db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Submission not found' });
  const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(s.task_id);

  let awarded = 0;
  if (status === 'approved') {
    awarded = await awardTaskPoints(s, task, task.period);
  } else {
    await db.prepare("DELETE FROM points_ledger WHERE source = 'task' AND source_id = ?").run(s.id);
  }

  await db.prepare('UPDATE submissions SET status = ?, review_note = ?, reviewed_by = ?, '
    + 'reviewed_at = ?, points_awarded = ? WHERE id = ?')
    .run(status, note || null, req.user.id, nowISO(), awarded, s.id);

  audit(req.user.id, req.user.username, 'submission_' + status, 'submission', s.id,
    { points: awarded }, ip(req));
  res.json({ ok: true, status, points_awarded: awarded });
}));

/* -------------------------------- payroll -------------------------------- */

app.get('/api/payroll', authenticate, wrap(async (req, res) => {
  const per = req.query.period || currentPeriod();
  const scope = memberScope(req.user);
  const levels = ['ambassador', 'champion', 'mobiliser'];
  const rows = await db.prepare(
    'SELECT * FROM members WHERE (' + scope.sql + ') '
    + "AND status = 'verified' AND level IN ('ambassador','champion','mobiliser') "
    + 'ORDER BY lga, ward'
  ).all(...scope.params);
  const result = await payroll(rows, per);
  result.caps = LEVEL_CAPS;
  result.naira_per_point = NAIRA_PER_POINT;
  result.levels = levels;
  res.json(result);
}));

/* ------------------------------- dashboard ------------------------------- */

app.get('/api/dashboard', authenticate, wrap(async (req, res) => {
  const scope = memberScope(req.user);
  const per = req.query.period || currentPeriod();
  const p = scope.params;

  const totals = await db.prepare(
    'SELECT COUNT(*) total, '
    + "SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) verified, "
    + "SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending, "
    + "SUM(CASE WHEN status='flagged' THEN 1 ELSE 0 END) flagged, "
    + "SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) rejected "
    + 'FROM members WHERE ' + scope.sql
  ).get(...p);

  const byLevel = await db.prepare(
    'SELECT level, COUNT(*) n FROM members WHERE ' + scope.sql + ' GROUP BY level'
  ).all(...p);

  const byLga = await db.prepare(
    'SELECT lga, COUNT(*) total, '
    + "SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) verified, "
    + 'COUNT(DISTINCT ward) wards, COUNT(DISTINCT polling_unit) units '
    + 'FROM members WHERE ' + scope.sql + ' GROUP BY lga ORDER BY total DESC'
  ).all(...p);

  const coverage = await db.prepare(
    'SELECT COUNT(DISTINCT lga) lgas, COUNT(DISTINCT ward) wards, '
    + 'COUNT(DISTINCT polling_unit) units FROM members WHERE ' + scope.sql
  ).get(...p);

  const recent = await db.prepare(
    'SELECT id,code,first_name,last_name,level,lga,ward,polling_unit,status,risk_score,created_at '
    + 'FROM members WHERE ' + scope.sql + ' ORDER BY created_at DESC LIMIT 10'
  ).all(...p);

  const tasks = await db.prepare(
    'SELECT COUNT(*) total, '
    + "SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) open "
    + 'FROM tasks WHERE period = ?'
  ).get(per);

  const subs = await db.prepare(
    'SELECT s.status, COUNT(*) n FROM submissions s JOIN members m ON m.id = s.member_id '
    + 'WHERE ' + scope.sql.replace(/\b(lga|ward|upline_user_id|upline_member_id)\b/g, 'm.$1')
    + ' GROUP BY s.status'
  ).all(...p);

  const highRisk = await db.prepare(
    'SELECT COUNT(*) n FROM members WHERE ' + scope.sql + ' AND risk_score >= 50'
  ).get(...p).n;

  res.json({
    period: per,
    totals,
    by_level: byLevel,
    by_lga: byLga,
    coverage,
    targets: { lgas: LGAS.length, wards: TOTAL_WARDS, engagements: 35100, mobilisers: 3510 },
    recent,
    tasks,
    submissions: subs,
    high_risk: highRisk,
    voter_roll_loaded: voterRollSize(),
  });
}));

/* --------------------------------- users --------------------------------- */

app.get('/api/users', authenticate, requireAdmin, wrap(async (req, res) => {
  const rows = await db.prepare(
    'SELECT id,username,role,office,full_name,phone,scope_type,scope_value,status,'
    + 'must_reset,last_login,created_at,'
    + '(SELECT COUNT(*) FROM members m WHERE m.upline_user_id = users.id) registered '
    + 'FROM users ORDER BY role, full_name'
  ).all();
  res.json({ rows });
}));

app.post('/api/users', authenticate, requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  for (const f of ['username', 'full_name', 'role']) {
    if (!String(b[f] || '').trim()) return res.status(400).json({ error: 'Missing ' + f });
  }
  const exists = await db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(b.username);
  if (exists) return res.status(409).json({ error: 'That username is already taken' });

  const pw = b.password || tempPassword();
  const info = await db.prepare(
    'INSERT INTO users (username,password_hash,must_reset,role,office,full_name,phone,'
    + 'scope_type,scope_value,referral_code,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(String(b.username).trim().toLowerCase(), hashPassword(pw), 1, b.role,
    b.role === 'candidate' ? (b.office || null) : null, b.full_name, b.phone || null,
    b.scope_type || 'state', b.scope_value || null, referralCode('U'), 'active', nowISO());

  audit(req.user.id, req.user.username, 'user_created', 'user', Number(info.lastInsertRowid),
    { username: b.username, role: b.role }, ip(req));
  res.status(201).json({ id: Number(info.lastInsertRowid), username: b.username, password: pw });
}));

app.post('/api/users/:id/reset-password', authenticate, requireAdmin, wrap(async (req, res) => {
  const pw = tempPassword();
  await db.prepare('UPDATE users SET password_hash = ?, must_reset = 1 WHERE id = ?')
    .run(hashPassword(pw), req.params.id);
  audit(req.user.id, req.user.username, 'password_reset', 'user', Number(req.params.id), null, ip(req));
  res.json({ password: pw });
}));

app.patch('/api/users/:id', authenticate, requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  if (b.status !== undefined) {
    if (!['active', 'suspended'].includes(b.status)) {
      return res.status(400).json({ error: 'status must be active or suspended' });
    }
    await db.prepare('UPDATE users SET status = ? WHERE id = ?').run(b.status, req.params.id);
    audit(req.user.id, req.user.username, 'user_' + b.status, 'user', Number(req.params.id), null, ip(req));
    return res.json({ ok: true });
  }

  for (const f of ['full_name', 'role', 'scope_type']) {
    if (!String(b[f] || '').trim()) return res.status(400).json({ error: 'Missing ' + f });
  }
  const office = b.role === 'candidate' ? (b.office || null) : null;
  await db.prepare(
    'UPDATE users SET full_name = ?, phone = ?, role = ?, office = ?, scope_type = ?, scope_value = ? WHERE id = ?'
  ).run(b.full_name.trim(), b.phone || null, b.role, office,
    b.scope_type, b.scope_value || null, req.params.id);
  audit(req.user.id, req.user.username, 'user_updated', 'user', Number(req.params.id),
    { role: b.role, scope_type: b.scope_type }, ip(req));
  res.json({ ok: true });
}));

/* ------------------------------ admin / data ----------------------------- */

/** Minimal RFC4180-aware CSV parser (handles quoted fields and commas). */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return [];

  const cols = rows[0].map((c) => c.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(cols.map((c, i) => [c, (r[i] || '').trim()])));
}

app.post('/api/admin/voter-roll', authenticate, requireAdmin, upload.single('file'),
  wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Upload a CSV file' });
    let rows;
    try {
      rows = parseCsv(fs.readFileSync(req.file.path, 'utf8'));
    } finally {
      fs.unlink(req.file.path, () => {});
    }
    if (!rows.length) return res.status(400).json({ error: 'That CSV had no data rows' });
    if (!('vin' in rows[0] || 'VIN' in rows[0] || 'voter_id' in rows[0])) {
      return res.status(400).json({
        error: 'The CSV needs a "vin" column. Columns found: '
             + Object.keys(rows[0]).join(', '),
      });
    }

    const result = loadVoterRoll(rows, req.file.originalname);
    audit(req.user.id, req.user.username, 'voter_roll_loaded', null, null, result, ip(req));
    res.json({ ...result, total: voterRollSize() });
  }));

app.post('/api/admin/voter-roll/clear', authenticate, requireAdmin, wrap(async (req, res) => {
  const n = clearVoterRoll();
  audit(req.user.id, req.user.username, 'voter_roll_cleared', null, null, { rows: n }, ip(req));
  res.json({ cleared: n });
}));

/**
 * Build a sample INEC-style extract from members already registered, so the
 * matching workflow can be demonstrated before the real extract arrives.
 * Deliberately imperfect: some members are omitted and some are placed at a
 * different polling unit, which is what the matcher is meant to catch.
 */
app.get('/api/admin/voter-roll/sample.csv', authenticate, requireAdmin, wrap(async (req, res) => {
  const members = await db.prepare(
    'SELECT * FROM members WHERE pvc_no IS NOT NULL ORDER BY RANDOM() LIMIT 4000'
  ).all();

  const lines = ['vin,last_name,first_name,lga,ward,polling_unit'];
  let omitted = 0, moved = 0;
  members.forEach((m, i) => {
    if (i % 17 === 0) { omitted++; return; }            // not on the register
    const pu = i % 23 === 0                              // registered elsewhere
      ? (moved++, m.ward + ' / PU 999')
      : m.polling_unit;
    const esc = (v) => (/[",\n]/.test(String(v ?? '')) ? '"' + v + '"' : (v ?? ''));
    lines.push([m.pvc_no, m.last_name, m.first_name, m.lga, m.ward, pu].map(esc).join(','));
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="sample-inec-extract.csv"');
  res.setHeader('X-Sample-Omitted', String(omitted));
  res.setHeader('X-Sample-Moved', String(moved));
  res.send(lines.join('\n'));
}));

/**
 * Payment reconciliation — bank-confirmed account names, with no API key.
 *
 * When money is actually moved, the bank's payment-confirmation file (or a
 * downloaded statement) lists the REAL beneficiary name for every account it
 * paid. Uploading that file back gives the same answer a paid name-resolution
 * API would, sourced from the bank itself, for free.
 *
 * Expected columns: account_number, account_name  (amount and date optional).
 */
app.post('/api/admin/reconcile-bank', authenticate, requireAdmin, upload.single('file'),
  wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Upload a CSV file' });
    let rows;
    try {
      rows = parseCsv(fs.readFileSync(req.file.path, 'utf8'));
    } finally {
      fs.unlink(req.file.path, () => {});
    }
    if (!rows.length) return res.status(400).json({ error: 'That CSV had no data rows' });

    const first = rows[0];
    const acctKey = ['account_number', 'accountnumber', 'account', 'nuban', 'beneficiary_account']
      .find((k) => k in first);
    const nameKey = ['account_name', 'accountname', 'beneficiary_name', 'beneficiary', 'name']
      .find((k) => k in first);
    if (!acctKey || !nameKey) {
      return res.status(400).json({
        error: 'The CSV needs an account number column and an account name column. '
             + 'Columns found: ' + Object.keys(first).join(', '),
      });
    }

    const source = req.file.originalname || 'bank-file';
    const stamp = nowISO();
    const find = await db.prepare('SELECT * FROM members WHERE account_number = ?');
    const save = await db.prepare(
      'UPDATE members SET bank_verified_name = ?, bank_verified_at = ?, '
      + 'bank_verified_source = ? WHERE id = ?'
    );

    const result = { rows: rows.length, matched: 0, unmatched: 0, confirmed: 0, mismatched: [] };
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

    await db.exec('BEGIN');
    try {
      for (const r of rows) {
        const acct = String(r[acctKey] || '').replace(/\D/g, '');
        const name = String(r[nameKey] || '').trim();
        if (!acct || !name) continue;

        const members = find.all(acct);
        if (!members.length) { result.unmatched++; continue; }
        result.matched++;

        for (const m of members) {
          save.run(name, stamp, source, m.id);
          const confirmed = norm(name);
          if (confirmed.includes(norm(m.last_name)) && confirmed.includes(norm(m.first_name))) {
            result.confirmed++;
          } else {
            result.mismatched.push({
              id: m.id, code: m.code,
              registered_as: m.first_name + ' ' + m.last_name,
              bank_says: name, account_number: acct,
            });
          }
        }
      }
      await db.exec('COMMIT');
    } catch (e) {
      await db.exec('ROLLBACK');
      throw e;
    }

    audit(req.user.id, req.user.username, 'bank_reconciled', null, null,
      { rows: result.rows, matched: result.matched, mismatched: result.mismatched.length },
      ip(req));
    res.json(result);
  }));

/** Re-run the full check pipeline over a batch of members. */
app.post('/api/admin/verify-bulk', authenticate, requireAdmin, wrap(async (req, res) => {
  const scopeFilter = req.body?.only === 'pending'
    ? "WHERE status IN ('pending','flagged')" : '';
  const limit = Math.min(Number(req.body?.limit) || 500, 5000);
  const members = await db.prepare(
    'SELECT * FROM members ' + scopeFilter + ' ORDER BY created_at DESC LIMIT ?'
  ).all(limit);

  const update = await db.prepare(
    'UPDATE members SET checks_json = ?, risk_score = ?, risk_flags = ?, '
    + "status = CASE WHEN ? >= 50 AND status = 'pending' THEN 'flagged' "
    + "WHEN ? < 50 AND status = 'flagged' THEN 'pending' ELSE status END WHERE id = ?"
  );

  const tally = { checked: 0, clean: 0, flagged: 0, by_flag: {} };
  for (const m of members) {
    const r = await runChecks(m, { excludeId: m.id, uplineUserId: m.upline_user_id });
    update.run(JSON.stringify(r.checks), r.riskScore, JSON.stringify(r.flags),
      r.riskScore, r.riskScore, m.id);
    tally.checked++;
    if (r.riskScore >= 50) tally.flagged++; else if (r.riskScore === 0) tally.clean++;
    for (const f of r.flags) tally.by_flag[f.code] = (tally.by_flag[f.code] || 0) + 1;
  }

  audit(req.user.id, req.user.username, 'verify_bulk', null, null, tally, ip(req));
  res.json(tally);
}));

/** Members carrying verification flags, worst first. */
app.get('/api/verification/queue', authenticate, wrap(async (req, res) => {
  const scope = memberScope(req.user);
  const rows = await db.prepare(
    'SELECT id,code,first_name,last_name,phone,level,lga,ward,polling_unit,status,'
    + 'risk_score,risk_flags,created_at FROM members WHERE (' + scope.sql + ') '
    + 'AND risk_score > 0 ORDER BY risk_score DESC, created_at DESC LIMIT 300'
  ).all(...scope.params);
  for (const r of rows) r.flags = r.risk_flags ? JSON.parse(r.risk_flags) : [];

  const spread = await db.prepare(
    'SELECT '
    + ' SUM(CASE WHEN risk_score = 0 THEN 1 ELSE 0 END) clean,'
    + ' SUM(CASE WHEN risk_score BETWEEN 1 AND 49 THEN 1 ELSE 0 END) watch,'
    + ' SUM(CASE WHEN risk_score >= 50 THEN 1 ELSE 0 END) high,'
    + ' COUNT(*) total FROM members WHERE ' + scope.sql
  ).get(...scope.params);

  res.json({ rows, spread, simulated: isSimulated() });
}));

app.get('/api/admin/status', authenticate, requireAdmin, wrap(async (req, res) => {
  const rollRows = await voterRollSize();
  res.json({
    voter_roll_rows: rollRows,
    voter_roll_batches: await voterRollBatches(),
    simulated: isSimulated(),
    providers: {
      bank_resolution: process.env.PAYSTACK_SECRET_KEY ? 'configured'
        : isSimulated() ? 'simulated' : 'not_configured',
      nin_verification: (process.env.KYC_PROVIDER && process.env.KYC_API_KEY)
        ? 'configured (' + process.env.KYC_PROVIDER + ')'
        : isSimulated() ? 'simulated' : 'not_configured',
      pvc_verification: rollRows
        ? 'INEC extract loaded (' + rollRows + ' rows)'
        : 'no INEC extract loaded - no public API exists',
    },
    members_total: (await db.prepare('SELECT COUNT(*) n FROM members').get()).n,
    audit_entries: (await db.prepare('SELECT COUNT(*) n FROM audit_log').get()).n,
  });
}));

app.get('/api/admin/audit', authenticate, requireAdmin, wrap(async (req, res) => {
  res.json({
    rows: await db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200').all(),
  });
}));

/* --------------------------------- export -------------------------------- */

function toCSV(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [columns.join(',')]
    .concat(rows.map((r) => columns.map((c) => esc(r[c])).join(',')))
    .join('\n');
}

app.get('/api/export/members.csv', authenticate, wrap(async (req, res) => {
  const scope = memberScope(req.user);
  const rows = await db.prepare('SELECT * FROM members WHERE ' + scope.sql + ' ORDER BY lga, ward')
    .all(...scope.params);
  const cols = ['code', 'first_name', 'last_name', 'phone', 'title', 'designation',
    'lga', 'ward', 'polling_unit', 'level', 'pvc_no', 'nin', 'bank_name',
    'account_number', 'account_name', 'status', 'risk_score', 'created_at'];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="oyo10x-members.csv"');
  audit(req.user.id, req.user.username, 'export_members', null, null, { rows: rows.length }, ip(req));
  res.send(toCSV(rows, cols));
}));

app.get('/api/export/payroll.csv', authenticate, wrap(async (req, res) => {
  const per = req.query.period || currentPeriod();
  const scope = memberScope(req.user);
  const members = await db.prepare(
    'SELECT * FROM members WHERE (' + scope.sql + ") AND status = 'verified' "
    + "AND level IN ('ambassador','champion','mobiliser')"
  ).all(...scope.params);
  const { rows } = await payroll(members, per);
  const cols = ['code', 'name', 'level', 'lga', 'ward', 'verified_downline',
    'raw_points', 'capped_points', 'eligible', 'amount_naira',
    'bank_name', 'account_number', 'account_name'];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="oyo10x-payroll-' + per + '.csv"');
  audit(req.user.id, req.user.username, 'export_payroll', null, null, { period: per }, ip(req));
  res.send(toCSV(rows, cols));
}));

/* ------------------------------ static / errors --------------------------- */

const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) =>
    res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error('[api]', err);
  res.status(500).json({ error: err.message || 'Server error' });
});

/**
 * On hosts with an ephemeral disk the database is empty after every deploy.
 * SEED_ON_BOOT=1 repopulates it automatically so a demonstration deployment is
 * never blank. It only ever runs when there are no users at all, so it cannot
 * overwrite real data.
 */
async function maybeSeed() {
  if (process.env.SEED_ON_BOOT !== '1') return;
  if ((await db.prepare('SELECT COUNT(*) n FROM users').get()).n > 0) return;
  console.log('SEED_ON_BOOT: empty database detected, seeding...');
  await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'seed.js')], {
      env: process.env,
      stdio: 'inherit',
    });
    child.on('error', (error) => {
      console.error('SEED_ON_BOOT failed:', error.message);
      resolve();
    });
    child.on('exit', (code) => {
      if (code === 0) console.log('SEED_ON_BOOT: done.');
      else console.error('SEED_ON_BOOT failed with exit code ' + code + '.');
      resolve();
    });
  });
}

app.listen(PORT, '0.0.0.0', async () => {
  console.log('OYO 10X API listening on port ' + PORT);
  await maybeSeed();
  const users = (await db.prepare('SELECT COUNT(*) n FROM users').get()).n;
  if (!users) console.log('No users yet -- run:  npm run seed');
  if (!process.env.OYO_SECRET) {
    console.warn('WARNING: OYO_SECRET is not set. Sessions use the development '
      + 'default. Set it before exposing this to the internet.');
  }
});
