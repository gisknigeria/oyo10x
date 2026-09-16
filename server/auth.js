import crypto from 'node:crypto';
import { db, nowISO } from './db.js';

const SECRET = process.env.OYO_SECRET || 'dev-only-change-me-in-production';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const dk = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${dk}`;
}

export function verifyPassword(plain, stored) {
  try {
    const [scheme, salt, dk] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const test = crypto.scryptSync(plain, salt, 64);
    const ref = Buffer.from(dk, 'hex');
    return test.length === ref.length && crypto.timingSafeEqual(test, ref);
  } catch { return false; }
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

export function issueToken(user) {
  const body = b64({ uid: user.id, role: user.role, exp: Date.now() + TOKEN_TTL_MS });
  return `${body}.${sign(body)}`;
}

export function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = sign(body);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

/** Generate a readable, non-guessable temporary password for bulk account creation. */
export function tempPassword() {
  const words = ['Oyo', 'Ward', 'Poll', 'Unit', 'Team', 'Base', 'Lead', 'Gate'];
  const w = words[crypto.randomInt(words.length)];
  return `${w}${crypto.randomInt(1000, 9999)}${crypto.randomBytes(2).toString('hex')}`;
}

export function referralCode(prefix = 'OYO') {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return `${prefix}-${s}`;
}

export async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const payload = readToken(header.replace(/^Bearer\s+/i, ''));
  if (!payload) return res.status(401).json({ error: 'Not signed in' });
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
  if (!user || user.status !== 'active') return res.status(401).json({ error: 'Account inactive' });
  delete user.password_hash;
  req.user = user;
  next();
}

export const ROLE_ALIASES = Object.freeze({
  superadmin: 'superadmin',
  admin: 'admin',
  campaign_admin: 'campaign_admin',
  'campaign administrator': 'campaign_admin',
  dg: 'campaign_admin',
  'd.g.': 'campaign_admin',
  'd.g': 'campaign_admin',
  candidate: 'candidate',
  mobiliser: 'unit_promoter',
  'unit promoter': 'unit_promoter',
  unit_promoter: 'unit_promoter',
  grassroots: 'grassroot',
  grassroot: 'grassroot',
  'grass root': 'grassroot',
});

export function normaliseRole(role) {
  const raw = String(role ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (ROLE_ALIASES[raw]) return ROLE_ALIASES[raw];
  return raw.replace(/[.\s-]+/g, '_');
}

export const ADMIN_ROLES = new Set(['superadmin', 'admin', 'campaign_admin']);
export const UNIT_PROMOTER_ROLES = new Set(['unit_promoter', 'mobiliser']);
export const isUnitPromoterRole = (role) => UNIT_PROMOTER_ROLES.has(normaliseRole(role));
export const isCandidateRole = (role) => normaliseRole(role) === 'candidate';
export const isGrassrootRole = (role) => normaliseRole(role) === 'grassroot';

export function requireRole(...roles) {
  const allowed = new Set(roles.map((r) => normaliseRole(r)));
  return (req, res, next) =>
    allowed.has(normaliseRole(req.user.role)) ? next()
      : res.status(403).json({ error: 'You do not have access to this action' });
}

export const requireAdmin = (req, res, next) =>
  ADMIN_ROLES.has(normaliseRole(req.user.role)) ? next()
    : res.status(403).json({ error: 'Administrator access required' });

export async function touchLogin(id) {
  await db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(nowISO(), id);
}
