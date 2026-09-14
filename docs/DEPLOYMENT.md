# Hosting OYO 10X for free

## Read this before picking a host

This app stores data in a **SQLite file on disk**. Most free tiers (Render's
free web service, Railway's free trial, Vercel, Netlify) give the container an
**ephemeral filesystem** — anything written to disk is wiped every time the
service redeploys, restarts, or wakes from sleep. Put this database on one of
those without a persistent volume and it looks fine in your demo, then comes
back empty the next day.

There are three honest ways to handle that, in order of how much it matters
that your data survives:

| Situation | What to do |
|---|---|
| Showing people the app, data can reset | Free tier, `SEED_ON_BOOT=1` (below) |
| Real registrations, must not disappear | A host with a **free persistent volume** — this is Fly.io |
| Real registrations, on Render specifically | Render's cheapest **paid** plan (~$7/mo) with a disk attached |

Everything below is wired up already: a `Dockerfile`, `render.yaml`, `fly.toml`,
and an `OYO_DB` / `OYO_UPLOADS` environment variable the server already reads
(see `server/db.js` and `server/index.js`).

---

## Option A — Fly.io (recommended: free *and* your data survives)

Fly's free allowance includes small persistent **volumes**, which is the piece
every other free tier is missing.

```bash
# once
curl -L https://fly.io/install.sh | sh
fly auth signup       # or: fly auth login

cd oyo10x
fly launch --no-deploy               # detects fly.toml, asks to confirm the app name
fly volumes create oyo10x_data --size 1 --region lhr
fly secrets set OYO_SECRET="$(openssl rand -hex 32)"
fly deploy
```

That's it — `fly.toml` already points `OYO_DB` and `OYO_UPLOADS` at the mounted
volume and sets `SEED_ON_BOOT=1` for the first boot. After the first deploy,
turn seeding off so a later restart can never re-seed over real data:

```bash
fly secrets set SEED_ON_BOOT=0
```

Your app is live at `https://oyo10x.fly.dev` (or whatever name you chose).
`fly deploy` again any time you push changes.

---

## Option B — Render (easiest UI, free tier resets on redeploy)

1. Push this repo to GitHub.
2. On [render.com](https://render.com) → **New → Blueprint** → point at the repo.
   Render reads `render.yaml` automatically.
3. It builds the `Dockerfile` and deploys. `OYO_SECRET` is generated for you.

Free tier notes:
- The service **sleeps after 15 minutes idle** and takes ~30s to wake on the
  next request.
- The disk is ephemeral — a redeploy or a sleep/wake cycle can reset it.
  `SEED_ON_BOOT=1` is already set in `render.yaml`, so it comes back seeded
  with demo data rather than blank.
- **To keep real data**, switch `plan: free` to `plan: starter` in
  `render.yaml` and uncomment the `disk:` block, then set `SEED_ON_BOOT=0`.
  This is the cheapest paid tier (~$7/month) and is the option to use once
  you're collecting real registrations on Render.

---

## Option C — Railway

Railway's free trial credit works the same way as Render, minus the sleep:

```bash
npm i -g @railway/cli
railway login
railway init
railway up
railway variables set OYO_SECRET=$(openssl rand -hex 32) SEED_ON_BOOT=1
```

Railway also offers a **persistent volume** add-on (small monthly cost) — mount
it at `/data` and set `OYO_DB=/data/oyo10x.db`, `OYO_UPLOADS=/data/uploads`,
same as the Fly setup, if you want data to survive on Railway specifically.

---

## The database itself — you don't need a separate one

SQLite is a single file, not a server, so there is nothing extra to provision.
`server/db.js` already uses Node's built-in `node:sqlite` — no native build, no
connection string, no separate free-tier database to sign up for. The only
thing that matters is **where that file lives**:

- Locally: `server/data/oyo10x.db` (the default).
- In any of the setups above: `OYO_DB=/data/oyo10x.db` on a mounted volume.

If you outgrow SQLite later (many concurrent writers, need managed backups),
the natural next step is a free **Postgres** tier — Neon, Supabase, or Render's
own managed Postgres all have one — but nothing here requires that yet. At the
programme's real scale (tens of thousands of rows, occasional writes) SQLite on
a persistent volume is genuinely fine.

---

## Before your first real deploy

1. **Set `OYO_SECRET`** to a long random value. Every option above does this
   for you, but double-check it landed — the server prints a warning on boot
   if it's missing.
2. **Decide on `SEED_ON_BOOT`.** `1` while you're showing the app around, `0`
   the moment real names are in it — otherwise a redeploy on an ephemeral disk
   silently seeds demo data back in.
3. **Change the admin password** from `oyo10x-admin` immediately after your
   first login on the live URL.
4. **HTTPS.** Fly, Render and Railway all terminate TLS for you automatically
   — you do not need to configure certificates. Just don't put the app behind
   plain HTTP anywhere, since it collects NIN, PVC and bank details.
5. If you turn on the Paystack or NIN provider keys (see
   [DATA-SOURCES.md](DATA-SOURCES.md)), set them as **secrets**, not plain
   environment variables checked into a repo.

---

## Quick local check that mirrors the container

```bash
npm run build
OYO_DB=/tmp/oyo10x.db OYO_UPLOADS=/tmp/oyo10x-uploads SEED_ON_BOOT=1 \
  OYO_SECRET=test-secret PORT=4000 npm start
curl http://localhost:4000/api/health
```

A `{"status":"ok","seeded":true,...}` response means the same thing will happen
on the host you choose.
