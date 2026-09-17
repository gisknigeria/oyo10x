import { createClient } from '@libsql/client';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.OYO_DB || path.join(__dirname, 'data', 'oyo10x.db');

if (!process.env.TURSO_DATABASE_URL) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const url = process.env.TURSO_DATABASE_URL || `file:${DB_PATH}`;
const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const execute = (sql, args = []) => client.execute({ sql, args });
const makeDb = (run) => ({
  exec: async (sql) => {
    const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) await run(statement);
  },
  prepare: (sql) => ({
    get: async (...args) => {
      const result = await run(sql, args);
      return result.rows[0] || undefined;
    },
    all: async (...args) => (await run(sql, args)).rows,
    run: async (...args) => {
      const result = await run(sql, args);
      return {
        changes: Number(result.rowsAffected || 0),
        lastInsertRowid: result.lastInsertRowid,
      };
    },
  }),
});
const exec = async (sql) => {
  const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) await execute(statement);
};

export const db = {
  exec,
  prepare: (sql) => ({
    get: async (...args) => {
      const result = await execute(sql, args);
      return result.rows[0] || undefined;
    },
    all: async (...args) => (await execute(sql, args)).rows,
    run: async (...args) => {
      const result = await execute(sql, args);
      return {
        changes: Number(result.rowsAffected || 0),
        lastInsertRowid: result.lastInsertRowid,
      };
    },
  }),
  transaction: async (fn) => {
    const tx = await client.transaction('write');
    const txDb = makeDb((sql, args = []) => tx.execute({ sql, args }));
    try {
      const result = await fn(txDb);
      await tx.commit();
      return result;
    } catch (error) {
      try { await tx.rollback(); } catch { /* preserve the original error */ }
      throw error;
    }
  },
};

await db.exec('PRAGMA foreign_keys = ON');

await db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  must_reset    INTEGER NOT NULL DEFAULT 1,
  role          TEXT NOT NULL,          -- superadmin|admin|candidate|mobiliser
  office        TEXT,                   -- Governor|Deputy Governor|Senator|House of Reps|House of Assembly
  full_name     TEXT NOT NULL,
  phone         TEXT,
  scope_type    TEXT NOT NULL DEFAULT 'state',
  scope_value   TEXT,
  upline_id     INTEGER REFERENCES users(id),
  member_id     INTEGER,
  referral_code TEXT UNIQUE,
  status        TEXT NOT NULL DEFAULT 'active',
  last_login    TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT NOT NULL UNIQUE,
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  phone            TEXT NOT NULL,
  title            TEXT,
  designation      TEXT,
  pvc_no           TEXT,
  nin              TEXT,
  bank_name        TEXT,
  account_number   TEXT,
  account_name     TEXT,
  lga              TEXT NOT NULL,
  ward             TEXT NOT NULL,
  polling_unit     TEXT NOT NULL,
  level            TEXT NOT NULL DEFAULT 'mobiliser',
  upline_user_id   INTEGER REFERENCES users(id),
  upline_member_id INTEGER REFERENCES members(id),
  lat REAL, lng REAL, accuracy REAL, captured_at TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending|verified|rejected|duplicate
  review_note      TEXT,
  reviewed_by      INTEGER REFERENCES users(id),
  reviewed_at      TEXT,
  checks_json      TEXT,
  risk_score       INTEGER NOT NULL DEFAULT 0,
  risk_flags       TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_members_upline_user ON members(upline_user_id);
CREATE INDEX IF NOT EXISTS idx_members_upline_member ON members(upline_member_id);
CREATE INDEX IF NOT EXISTS idx_members_geo ON members(lga, ward);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_members_nin ON members(nin);
CREATE INDEX IF NOT EXISTS idx_members_pvc ON members(pvc_no);

CREATE TABLE IF NOT EXISTS tasks (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  title              TEXT NOT NULL,
  description        TEXT,
  type               TEXT NOT NULL,   -- rally|survey|canvass|meeting|issue_report|service|training
  points             INTEGER NOT NULL DEFAULT 5,
  mandatory          INTEGER NOT NULL DEFAULT 1,
  requires_photo     INTEGER NOT NULL DEFAULT 0,
  requires_location  INTEGER NOT NULL DEFAULT 1,
  questions_json     TEXT,
  target_level       TEXT NOT NULL DEFAULT 'all',
  target_scope_type  TEXT NOT NULL DEFAULT 'state',
  target_scope_value TEXT,
  period             TEXT NOT NULL,   -- YYYY-MM
  opens_at           TEXT,
  due_at             TEXT,
  status             TEXT NOT NULL DEFAULT 'open',
  created_by         INTEGER REFERENCES users(id),
  created_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id      INTEGER NOT NULL REFERENCES tasks(id),
  member_id    INTEGER REFERENCES members(id),
  user_id      INTEGER REFERENCES users(id),
  answers_json TEXT,
  photo_path   TEXT,
  lat REAL, lng REAL, accuracy REAL,
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|rejected
  points_awarded INTEGER NOT NULL DEFAULT 0,
  review_note  TEXT,
  reviewed_by  INTEGER REFERENCES users(id),
  reviewed_at  TEXT,
  created_at   TEXT NOT NULL,
  UNIQUE(task_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_sub_task ON submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_sub_member ON submissions(member_id);

CREATE TABLE IF NOT EXISTS points_ledger (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  INTEGER REFERENCES members(id),
  user_id    INTEGER REFERENCES users(id),
  source     TEXT NOT NULL,      -- task|activation|bonus|adjustment
  source_id  INTEGER,
  points     INTEGER NOT NULL,
  period     TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_points_member ON points_ledger(member_id, period);

-- INEC register extract, loaded by an administrator. Persisted so PVC matching
-- survives a restart and can be queried rather than held in memory.
CREATE TABLE IF NOT EXISTS voter_roll (
  vin          TEXT PRIMARY KEY,
  last_name    TEXT,
  first_name   TEXT,
  lga          TEXT,
  ward         TEXT,
  polling_unit TEXT,
  loaded_at    TEXT NOT NULL,
  batch        TEXT
);
CREATE INDEX IF NOT EXISTS idx_roll_pu ON voter_roll(polling_unit);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  actor      TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  detail     TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS registration_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  creator_user_id INTEGER NOT NULL REFERENCES users(id),
  data_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL
);

-- One current disparities/challenges report per candidate, per the Campaign
-- Council directive of 9 Sept 2026 (items i & ii). Upserted on submission --
-- updated_at tracks edits, reviewed_* tracks leadership follow-up.
CREATE TABLE IF NOT EXISTS disparity_reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  disparities  TEXT,
  challenges   TEXT,
  positives    TEXT,
  lat          REAL,
  lng          REAL,
  accuracy     REAL,
  submitted_at TEXT NOT NULL,
  updated_at   TEXT,
  reviewed_by  INTEGER REFERENCES users(id),
  reviewed_at  TEXT,
  review_note  TEXT
);

-- Self-service "forgot password". There is no email/SMS provider wired up,
-- so this cannot deliver a reset link by itself -- what it can safely do is
-- verify the requester knows the phone number on file and hand the request
-- to an administrator, who fulfils it the same way every password on this
-- platform is already issued: generated once, relayed by a human. This
-- turns "please DM the office" into a real queue admins can see and act on,
-- without weakening the login below what admin-initiated resets already are.
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  phone_matched INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  requested_ip  TEXT,
  resolved_by   INTEGER REFERENCES users(id),
  resolved_at   TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reset_requests_user ON password_reset_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_requests_status ON password_reset_requests(status);
`);

// Additive migrations. Safe to run on every boot: an existing column throws,
// which we swallow, so upgrading an already-populated database needs no steps.
for (const [table, column, type] of [
  ['members', 'bank_verified_name', 'TEXT'],
  ['members', 'bank_verified_at', 'TEXT'],
  ['members', 'bank_verified_source', 'TEXT'],
  // A coordinator is a mobiliser promoted by admin to oversee a ward/LGA
  // (everyone in that area, not just people they personally added) rather
  // than a separate registration tier.
  ['users', 'is_coordinator', 'INTEGER NOT NULL DEFAULT 0'],
  ['disparity_reports', 'lat', 'REAL'],
  ['disparity_reports', 'lng', 'REAL'],
  ['disparity_reports', 'accuracy', 'REAL'],
  ['disparity_reports', 'positives', 'TEXT'],
]) {
  try {
    await db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + type);
  } catch { /* column already present */ }
}

// Office is meaningful only for candidate accounts. Clean up older accounts
// created before the role-specific office field was enforced.
await db.prepare("UPDATE users SET office = NULL WHERE role <> 'candidate'").run();

export const nowISO = () => new Date().toISOString();
export const period = (d = new Date()) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export async function audit(userId, actor, action, entity, entityId, detail, ip) {
  await db.prepare(`INSERT INTO audit_log (user_id,actor,action,entity,entity_id,detail,ip,created_at)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run(userId ?? null, actor ?? null, action, entity ?? null,
         entityId ?? null, detail ? JSON.stringify(detail) : null, ip ?? null, nowISO());
}

export default db;
