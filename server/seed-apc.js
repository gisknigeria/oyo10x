// Loads the APC membership register (server/data/apc-members.csv.gz) into the
// apc_members table, so admins and candidates can see who on the party
// register is -- or is not yet -- part of the 10X network.
//
//   node server/seed-apc.js            # load if the table is empty
//   --replace                          # wipe and reload from the file
//
// It also runs by itself, once, when the server boots (see index.js). The
// file was built from APC_ALL_LOCAL_GOVERNMENT__MEMBERSHIP_DATA_4.xlsx: three
// different column layouts normalised, blank rows dropped, duplicate
// membership numbers kept once, phones normalised exactly as members.phone is
// (so the 10X match is a plain equality), and wards matched to geo.js names.
// `ward` is empty where the sheet's ward could not be matched; `ward_raw`
// always keeps what the sheet said.

import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initSchema, audit } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, 'data', 'apc-members.csv.gz');
const COLUMNS = ['membership_no', 'first_name', 'middle_name', 'last_name', 'phone',
  'lga', 'ward', 'ward_raw', 'registered_on'];

function parseCsv(text) {
  const rows = [];
  let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function readApcFile() {
  const rows = parseCsv(zlib.gunzipSync(fs.readFileSync(FILE)).toString('utf8'));
  rows.shift(); // header
  return rows.filter((r) => r.length === COLUMNS.length);
}

export async function importApc({ replace = false, log = console.log } = {}) {
  const rows = readApcFile();
  const BATCH = 500;
  await db.transaction(async (tx) => {
    if (replace) await tx.prepare('DELETE FROM apc_members').run();
    const one = '(' + COLUMNS.map(() => '?').join(',') + ')';
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      await tx.prepare(
        'INSERT INTO apc_members (' + COLUMNS.join(',') + ') VALUES '
        + chunk.map(() => one).join(',')
      ).run(...chunk.flat().map((v) => (v === '' ? null : v)));
    }
  });
  await audit(null, 'system', 'apc_import', null, null, { rows: rows.length, replace });
  log('APC register: loaded ' + rows.length + ' members.');
  return rows.length;
}

/** Boot hook: load the register if the table is empty. Never fatal. */
export async function importApcIfEmpty() {
  if (process.env.APC_IMPORT_ON_BOOT === '0') return;
  try {
    const { n } = await db.prepare('SELECT COUNT(*) n FROM apc_members').get();
    if (Number(n)) return;
    await importApc();
  } catch (error) {
    console.error('APC register import failed: ' + error.message);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await initSchema();
  const replace = process.argv.includes('--replace');
  const { n } = await db.prepare('SELECT COUNT(*) n FROM apc_members').get();
  if (Number(n) && !replace) {
    console.log('apc_members already has ' + n + ' rows; pass --replace to reload.');
  } else {
    await importApc({ replace });
  }
  process.exit(0);
}
