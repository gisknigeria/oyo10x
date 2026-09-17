# External intelligence API (for Sigar Vote)

> You asked for an API the Sigar Vote team can consume: how many people are
> registered, where (LGA/ward/polling unit and GPS), survey answers and where
> they came from, and membership counts rolled up by polling unit, ward, LGA
> and senatorial region. This is that API.

Base URL: `https://<your-deployed-server>/api/external/v1`
Local dev: `http://localhost:4000/api/external/v1`

## Authentication

Every request needs an API key in an `X-API-Key` header:

```bash
curl https://your-server/api/external/v1/summary \
  -H "X-API-Key: oyo10x_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Keys are created and revoked from **Platform accounts → External API keys**
in the app (superadmin/admin only). The full key is shown **once**, at
creation — only a prefix is stored, so if it's lost the only fix is revoking
it and creating a new one.

| Situation | Response |
|---|---|
| No key sent | `401 { "error": "Missing API key..." }` |
| Invalid or revoked key | `401 { "error": "Invalid or revoked API key." }` |
| More than 120 requests/minute on one key | `429 { "error": "Rate limit exceeded..." }` |

120 req/min is generous for a dashboard polling on a schedule; if Sigar Vote
needs more, raise the limit in `server/external.js` (`rateLimited`) rather
than working around it.

## What's deliberately left out

This API hands real people's names and locations to a system outside this
one, so the fields are scoped on purpose: **name, level (Unit Promoter /
Grassroot), status, LGA/ward/polling unit, and GPS location** for
registrations; **question/answer pairs and location** for surveys.

**Phone number, NIN, PVC number, and bank details are never returned by
this API**, regardless of query params. Those are the most sensitive fields
on file and weren't part of the request — if Sigar Vote genuinely needs one
of them, that's a separate conversation, not a query parameter.

---

## `GET /summary`

Headline numbers — good for a landing dashboard tile.

```bash
curl .../summary -H "X-API-Key: ..."
```

```json
{
  "generated_at": "2026-09-17T11:10:29.569Z",
  "totals": {
    "registered": 7, "verified": 0, "pending": 0,
    "flagged": 7, "rejected": 0,
    "unit_promoters": 7, "grassroots": 0
  },
  "coverage": { "lgas": 2, "wards": 2, "polling_units": 3 },
  "surveys": { "count": 0, "responses": 0 }
}
```

## `GET /registrations`

Every registered person: who, what level, where, and their GPS location at
registration.

**Query params** (all optional): `lga`, `ward`, `polling_unit`, `level`
(`mobiliser` = Unit Promoter, `grassroot` = Grassroot), `status`
(`pending`/`verified`/`flagged`/`rejected`), `since` (ISO date, registered
on/after), `limit` (default 200, max 1000), `offset`.

```bash
curl ".../registrations?lga=Ibadan%20North&level=mobiliser&limit=50" \
  -H "X-API-Key: ..."
```

```json
{
  "total": 7, "limit": 50, "offset": 0, "next_offset": null,
  "rows": [{
    "id": 1, "code": "OYO-RP5FRG", "name": "Kunle Adewale",
    "level": "mobiliser", "status": "flagged",
    "lga": "Ibadan North", "ward": "Ibadan North Ward 01",
    "polling_unit": "Ibadan North Ward 01 / PU 001",
    "location": { "lat": 7.3775, "lng": 3.947, "accuracy": 12 },
    "registered_at": "2026-09-15T16:50:31.688Z"
  }]
}
```

`location` is `null` if GPS wasn't captured at registration.

## `GET /surveys`

Task/survey submissions, with each answer resolved to its question's label
(not a raw question ID), plus where the respondent was when they answered.

**Query params**: `lga`, `ward`, `polling_unit`, `status`, `task_id`,
`limit`, `offset` — same pagination as `/registrations`.

```bash
curl ".../surveys?ward=Akinyele%20Ward%2003&limit=20" -H "X-API-Key: ..."
```

```json
{
  "total": 1, "limit": 20, "offset": 0, "next_offset": null,
  "rows": [{
    "id": 12, "task_id": 3, "task_title": "Ward needs assessment",
    "answers": [
      { "question": "Biggest concern in your ward", "value": "Water supply" },
      { "question": "Would you attend a town hall?", "value": "Yes" }
    ],
    "status": "reviewed",
    "lga": "Akinyele", "ward": "Akinyele Ward 03",
    "polling_unit": "Akinyele Ward 03 / PU 002",
    "location": { "lat": 7.41, "lng": 3.91, "accuracy": 20 },
    "submitted_at": "2026-09-16T09:12:00.000Z"
  }]
}
```

If the submission itself has no GPS, `location` falls back to the
respondent's own registered location.

## `GET /coverage`

Membership counts (Unit Promoters + Grassroots together — both are "members"
in this app) rolled up at every geographic level: polling unit, ward, LGA,
senatorial district, federal constituency, and state assembly constituency.

Call it with no params to get every level in one response, or narrow it with
`?level=` to get just one:

```bash
curl ".../coverage?level=senatorial_district" -H "X-API-Key: ..."
```

Valid values for `level`: `polling_unit`, `ward`, `lga`,
`senatorial_district`, `federal_constituency`, `state_constituency`.

```json
{
  "generated_at": "2026-09-17T11:10:39.885Z",
  "level": "senatorial_district",
  "rows": [
    { "name": "Oyo South", "lgas": 9, "members": 0, "verified": 0, "wards": 0, "polling_units": 0 },
    { "name": "Oyo Central", "lgas": 11, "members": 7, "verified": 0, "wards": 2, "polling_units": 3 },
    { "name": "Oyo North", "lgas": 13, "members": 0, "verified": 0, "wards": 0, "polling_units": 0 }
  ]
}
```

Without `?level=`, the response has all six as top-level keys:
`by_polling_unit`, `by_ward`, `by_lga`, `by_senatorial_district`,
`by_federal_constituency`, `by_state_constituency`.

---

## Pagination

`/registrations` and `/surveys` use `limit`/`offset`. `next_offset` in the
response is either the offset to fetch next, or `null` when you've reached
the end — loop until it's `null` rather than computing pages yourself.

## Rotating a key

There's no "edit" — revoke the old key from **Platform accounts → External
API keys** and create a new one. Update Sigar Vote's config with the new
key before or right after revoking the old one to avoid a gap.
