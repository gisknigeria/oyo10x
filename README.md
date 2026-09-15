# OYO 10X — Community Engagement & Intelligence Platform

A web application for the OYO 10X 90-day grassroots programme. It replaces the
"anyone with the link can submit" problem of a Google Form with **controlled
logins, a traceable 10X network, task-gated performance pay and automatic data
integrity checks**.

---

## Run it

Requires **Node.js 22 or newer** (uses the built-in SQLite module — no native
build step, no database server to install).

```bash
npm run setup
```

That installs both packages and seeds the database. Then:

```bash
npm run dev
```

- App: **http://localhost:5173**
- API: **http://localhost:4000**

To run it as a single process instead (API serves the built app on port 4000):

```bash
npm run build
npm start
```

### Sign in

| Account | Username | Password |
|---|---|---|
| Programme administrator | `admin` | `oyo10x-admin` |
| Every other account | see `server/data/credentials.csv` | generated at seed time |

The seed creates all **51 candidate logins** (Governor, Deputy Governor,
3 Senators, 14 Representatives, 32 Assembly members) plus demonstration
Mobiliser accounts for three LGAs.

Useful demo logins: `gov.oyo`, `sen.oyo-central`, `rep.ibadan-north`,
`mob.ibadan-north`.

To rebuild the demo data from scratch: `node server/seed.js --reset`

---

## What it does

### 1. Controlled access instead of an open form

Only accounts issued by the programme office can submit names. Every record is
stamped with the login that created it, the timestamp and the GPS position at
the moment of capture. Candidates can share their login with their own staff, and
the entries still trace back to that candidate.

### 2. Role-scoped visibility

Each login sees only its own slice of the data — enforced server-side in the
SQL, not hidden in the UI:

| Role | Sees |
|---|---|
| Governor / Deputy / Administrator | All 33 LGAs |
| Senator | The LGAs of their senatorial district |
| House of Representatives | The LGAs of their federal constituency |
| House of Assembly | Their state constituency |
| Mobiliser | Only their own branch of the network |
| Participant | Their own record |

### 3. The 10X network

Every member is linked to the person who activated them, forming a tree:
**Mobiliser → Community Participant**. The network page renders the tree and
marks who has met the baseline of 10 activations.

### 4. Tasks

Administrators create tasks — rallies, household canvassing, surveys with custom
questions, issue reports, community meetings. Tasks can be targeted at one level
or one LGA, marked mandatory, and set to require photo evidence and GPS. Field
agents submit evidence; supervisors approve or reject it; approval releases points.

### 5. Payment eligibility — three gates

This is the core rule. A member is paid for a month only when **all three** pass:

1. **Baseline** — at least 10 verified activations.
2. **Own work** — every mandatory task for the period approved.
3. **Downline** — every one of their verified downline members has also cleared
   their mandatory tasks.

Points are then capped at 100 points per mobiliser per month and converted at
**1 point = ₦100**. Recruitment alone earns nothing: the
first 10 activations are the baseline requirement worth zero points, and only
verified activations *above* 10 earn 2 bonus points each.

The payroll screen shows exactly which gate is blocking each person, and the
payment schedule exports to CSV with bank details for finance.

### 6. Data integrity

Every registration runs a check pipeline producing a **risk score out of 100**.
Ten of the twelve controls need **no API key and no provider account**:
duplicate detection across phone/NIN/VIN/account, the CBN **NUBAN check digit**,
account-name matching, format validation, GPS boundary check, surname clustering,
shared accounts, bulk-entry detection, INEC register matching, and **bank
reconciliation** from your own payment file.

The **Verification** page shows every check, what it costs, and the flagged
queue. See [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) for the full picture,
including why live bank-name lookup is the one thing that genuinely needs a key
and how to get the same answer without one.

### 7. Campaign branding

Colours, typography and layout follow the campaign cover. Drop two files into
`client/public/brand/` and they appear automatically:

- `candidate.jpg` — the candidate photograph
- `logo.png` — the official OYO 10X crest

Until then the app draws its own SVG crest and shows a labelled placeholder, so
nothing breaks. Campaign wording lives in one place,
`client/src/components/Brand.jsx`.

---

## Project layout

```
server/
  index.js        API routes
  db.js           SQLite schema
  auth.js         scrypt passwords, HMAC session tokens, role guards
  verify.js       identity checks, duplicate + fraud detection
  points.js       scoring, monthly caps, payment eligibility
  seed.js         demo data and the 51 candidate logins
  data/geo.js     33 LGAs, 351 wards, constituencies, banks
client/
  src/pages/      Login, Dashboard, Register, Members, Network,
                  Tasks, Review queue, Payroll, Logins, Data sources
```

---

## Before going live

These are deliberately left as configuration rather than guesses in code:

1. **Replace the ward list.** `server/data/geo.js` generates 351 correctly-counted
   placeholder ward names. Swap in the official INEC ward list.
2. **Verify the senatorial district mapping** in the same file — it is marked
   `VERIFY` in a comment.
3. **Set a real session secret**: `OYO_SECRET=<long random string>`.
4. **Change the admin password** and re-issue passwords from the Logins screen.
5. Optionally connect verification providers — see the data sources document.
6. Serve over **HTTPS**. The application collects NIN, PVC and bank details;
   these must never travel over plain HTTP.

---

## Deploying it

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — free hosting options for the
backend, frontend and database (SQLite on a mounted volume, no separate
database service needed), including the one thing to get right: most free
tiers wipe the disk on every redeploy, so pick a host with a persistent volume
(Fly.io) or turn on `SEED_ON_BOOT` while data can still reset.
# oyo10x
