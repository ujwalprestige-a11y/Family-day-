# Prestige Family Day 2026 – Registration Desk

A tablet/kiosk web app for the registration desk at **Beyond the Skyline** (26 September 2026).

Staff search for a guest by employee ID or name, see the wristbands that person was **allotted**
(split into adults and children), adjust to the number **actually** turning up, and check them in.
Walk-ins can be added at the desk, and a live admin dashboard compares allotted against issued with
an Excel export.

No contact details are collected or stored — the desk only records counts.

- **Stack:** Next.js (App Router) + TypeScript + Tailwind, Prisma + PostgreSQL, `exceljs`.
- **One deployable app.** Local dev runs on a local Postgres; production runs on Supabase; deploy to
  Vercel. Only `DATABASE_URL` changes between environments.

---

## 1. Prerequisites

- **Node.js 20+** (built and tested on Node 24).
- No Docker or system Postgres needed for local development — a real local Postgres is provided by the
  `embedded-postgres` dev dependency and started with `npm run db:local`.

---

## 2. Setup (local)

```bash
# 1. Install dependencies
npm install

# 2. Create your env file
cp .env.example .env        # (Windows PowerShell: Copy-Item .env.example .env)
#   The defaults already point at the local embedded Postgres (port 5433).
#   Set ADMIN_PIN and a long random SESSION_SECRET.

# 3. Start the local Postgres (leave this terminal running)
npm run db:local
#   First run downloads a Postgres 17 binary and initialises ./.pgdata,
#   then serves postgresql://postgres:postgres@localhost:5433/familyday
```

In a **second terminal**:

```bash
# 4. Create the database schema
npm run prisma:migrate      # applies migrations (prisma migrate dev)

# 5. Import the master allotment list
npm run import -- --dry-run   # parse + report, write nothing
npm run import                # replace the table with the sheet contents

# 6. Run the app
npm run dev                 # http://localhost:3000  (development)
```

> **For the event / kiosk, run the production build** — it is much faster than `npm run dev`, which
> recompiles each route on first use. In production, search, loading a guest, and registering all
> respond in tens of milliseconds:
>
> ```bash
> npm run build
> npm start                   # http://localhost:3000  (production)
> ```

- Guest kiosk: <http://localhost:3000>
- Admin (PIN from `ADMIN_PIN`): <http://localhost:3000/admin> — or use the discreet **Staff sign-in**
  link in the footer.

### Brand assets

- `public/prestige-logo.png` — the header logo. Ships as a **placeholder**; replace it with the real
  logo (PNG or SVG — update the `src` in `components/Brand.tsx` if you switch to SVG).
- `public/skyline.svg` — the faint gold line-art skyline behind the content. Edit or replace to taste.

---

## 3. Data model

One `Employee` table. The master sheet supplies the **allotment**; the desk fills in the **actuals**.

| Field | Meaning |
|---|---|
| `employee_id`, `full_name` | From the sheet. `employee_id` is indexed but **not unique**. |
| `entity`, `department` | Org context, shown at the desk to disambiguate people with the same name. |
| `allotted_adults`, `allotted_children` | What the sheet says they opted for. `allotted_adults` **includes the employee**. |
| `actual_adults`, `actual_children` | What was actually issued at the desk. Zero until check-in. |
| `status` | `not_arrived` → `checked_in`. |
| `source` | `master` (imported) or `walk_in` (added at the desk). |
| `needs_review` | Set by the importer for rows staff should eyeball. |

## 4. Data import

The importer reads an Excel workbook (default `data/Updated List.xlsx`) with the columns
`EMP ID | EMP NAME | COUNT | CHILDREN | ADULT | ENTITY | DEPARTMENT`.

```bash
npm run import                          # default file
npm run import -- "path/to/other.xlsx"  # explicit file
npm run import -- --dry-run             # parse + report, write nothing
npm run import -- --force               # proceed even if people have checked in
```

What it does:

- finds the header row by label (scanning the first 10 rows), so column order can change;
- derives `allotted_adults = COUNT − CHILDREN` and `allotted_children = CHILDREN`. **The `ADULT`
  column is ignored**: it is a formula whose cached result is missing on 21 rows and disagrees with
  `COUNT − CHILDREN` on 4 more, so the typed source values win;
- strips invisible characters (zero-width spaces, and the U+200E left-to-right mark that is glued to
  the front of three otherwise-valid employee IDs);
- folds entity spellings that differ only by case onto one variant, preferring mixed case over
  ALL CAPS, so `SUBLIME` and `Sublime` stop splitting reports. Genuine acronyms such as `PMMPL` are
  untouched. Non-case aliases live in `ENTITY_ALIASES` in `lib/mapping.ts`;
- flags rows with `needs_review` rather than dropping them — an `employee_id` that is not 6 digits,
  a blank name, a `COUNT` of 0, or `CHILDREN` exceeding `COUNT`;
- **replaces the whole table** in a single transaction. There is no merge path: the sheet is the
  source of truth, so a re-import is a full reset.

> **Safety gate.** If anyone has already checked in, the importer refuses to run and tells you to
> export first. `--force` overrides it. Use `--dry-run` freely — it never writes.

It prints a report, e.g.:

```
Sheet:                 "Updated Sheet"
Rows parsed:           1367
Unique employee IDs:   1367
Allotted adults:       2642
Allotted children:     1140
Allotted total:        3782
Flagged for review:    85
```

> The spreadsheet contains employee PII. `/data/`, `*.xlsx` and `*.csv` are **git-ignored**.

---

## 5. Tests

```bash
npm test
```

Requires the local Postgres to be running (`npm run db:local`). Tests run against an **isolated `test`
schema** so they never touch your imported data. 83 tests covering:

- **Import mapping** — Excel cell reading (formulas with and without cached results, rich text),
  invisible-character stripping, `COUNT − CHILDREN` derivation, review flagging, and entity
  canonicalisation.
- **Allotment helpers** — count clamping against junk input, and over-allotment detection.
- **Check-in API** — 404, 400, 422 (missing count, zero wristbands), clamping, over-allotment
  reporting, and that a correction updates counts while preserving the first arrival time.
- **Walk-in API** — required fields, the 6-digit ID rule, duplicate rejection (409), zero-wristband
  rejection, and that walk-ins get no allotment.
- **Export** — three sheets, Summary reconciliation, difference and over-allotment columns,
  Employee ID stored as text, bold + frozen header, and the session gate (401 without a session).

---

## 6. Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (local embedded Postgres, or Supabase in prod). |
| `DIRECT_URL` | *(prod, optional)* Non-pooled Supabase URL for running migrations. |
| `AUTH_USERNAME` | **Required.** Username for the `/login` gate that fronts the whole app. |
| `AUTH_PASSWORD` | **Required.** Password for the `/login` gate. |
| `ADMIN_PIN` | PIN for the `/admin` sign-in screen (a second, separate gate). |
| `SESSION_SECRET` | Long random string used to sign both session cookies. |

`AUTH_USERNAME` and `AUTH_PASSWORD` fail closed: if either is missing, `/login`
returns 503 and **nothing** in the app is reachable. Set them in every
environment, including Vercel.

See `.env.example` for ready-to-use local values.

---

## 7. Deployment (Vercel + Supabase)

1. **Create a Supabase project.** From *Project Settings → Database*, copy the connection strings:
   - the **pooled** connection (port 6543, `?pgbouncer=true`) → `DATABASE_URL`
   - the **direct** connection (port 5432) → `DIRECT_URL` (used for migrations)

   `directUrl` is already wired into the Prisma datasource, so no schema edit is needed.

   Functions are pinned to Mumbai (`bom1`) via `vercel.json` to sit next to the database.

2. **Apply the schema to Supabase:**
   ```bash
   DATABASE_URL="<direct-url>" npm run prisma:deploy   # prisma migrate deploy
   ```

3. **Import the master list** against Supabase. Dry-run first:
   ```bash
   DATABASE_URL="<direct-url>" npm run import -- --dry-run
   DATABASE_URL="<direct-url>" npm run import
   ```
   Remember this **replaces** the table. Mid-event, export before using `--force`.

4. **Deploy to Vercel.** Import the repo, then set env vars in *Project → Settings → Environment
   Variables*: `DATABASE_URL` (pooled), `DIRECT_URL`, `AUTH_USERNAME`, `AUTH_PASSWORD`, `ADMIN_PIN`,
   `SESSION_SECRET`. The build runs `prisma generate && next build`.

   Miss `AUTH_USERNAME` / `AUTH_PASSWORD` and the deployment is locked to everyone — the gate fails
   closed by design. Set them before the first deploy.

No schema or code changes are needed to switch between local and Supabase — only `DATABASE_URL`.

---

## 7. Performance & security notes

- **Search** responds well under the 200 ms target for the 1,367 imported records (indexed prefix on
  `employee_id`, index on `full_name`). It needs 3 characters and returns **all** matches, uncapped.
- **No contact details exist to leak.** Email, mobile and marital status were removed with the
  allotment model, so search and `/api/employee/:id` return only name, org context and counts.
- **Two independent gates.** `/login` (static username + password) fronts the entire app via
  `proxy.ts`; `/admin` additionally requires the PIN. Both use signed, httpOnly cookies, and both
  PIN and password are compared in constant time. Login attempts are rate-limited.
- The rate limiter is in-memory, which suits a single kiosk node. If the app is scaled to multiple
  instances, swap `lib/rate-limit.ts` for a shared store (e.g. Upstash Redis).

---

## 8. Project structure

```
app/                     # App Router: kiosk (page.tsx), /login, /admin, /api routes
proxy.ts                 # app-wide sign-in gate (Next 16 renamed middleware -> proxy)
components/              # Brand, CheckTick, LoadingOverlay, AllotmentCounter
lib/                     # db, allotment, mapping, validation, session, rate-limit, export, types
prisma/schema.prisma     # Employee model (Postgres)
scripts/import-master.ts # xlsx → DB importer (full replace)
scripts/local-db.ts      # local embedded Postgres runner
__tests__/               # Vitest unit + API tests
data/                    # master spreadsheet (git-ignored)
vercel.json              # pins functions to Mumbai (bom1)
```

---

## 9. Available scripts

| Script | What it does |
|--------|--------------|
| `npm run db:local` | Start the local embedded Postgres (leave running). |
| `npm run prisma:migrate` | Create/apply migrations locally (`migrate dev`). |
| `npm run prisma:deploy` | Apply migrations in production (`migrate deploy`). |
| `npm run import` | Replace the table from the master spreadsheet. Supports `-- --dry-run` and `-- --force`. |
| `npm run dev` | Start the Next.js dev server. |
| `npm run build` / `npm start` | Production build / start. |
| `npm test` | Run the test suite. |

---

## 10. Theming

The app uses the **Prestige** brand: white background, gold highlight, and a faint gold line-art
skyline. All brand colours and the font stack live in two mirrored places so the look can be changed
from one spot:

- **`app/globals.css`** — the `:root` CSS variables (`--gold`, `--gold-ink`, `--paper`, `--ink`, …).
- **`tailwind.config.ts`** — the same values as Tailwind theme tokens (`colors`, `fontFamily`).

Key tokens:

| Token | Value | Used for |
|-------|-------|----------|
| `--gold` | `#A88944` | Large text (BEYOND, welcome name), borders, button fills, icons, selected chips |
| `--gold-ink` | `#8A6D2B` | Small gold text (links, IDs, date, required marks) — kept ≥ 4.5:1 on white |
| `--gold-hover` | `#8F7337` | Primary button hover |
| `--ink` / `--ink-2` | `#1F1A12` / `#5B5648` | Primary / secondary text |
| `--paper` / `--soft-gold` | `#FBF8F1` / `#F3ECDB` | Tints for tiles, steppers, over-allotment highlight |
| `--line` / `--line-2` | `#E4DCC8` / `#CDBF9C` | Card and input borders |
| `--danger` / `--ok` | `#B3261E` / `#2E7D4F` | Errors / success |

Font stack: `'Grandview', 'Segoe UI', <Source Sans 3>, Arial, sans-serif`. Grandview is the proprietary
brand font (used if installed on the device); **Source Sans 3** is loaded via `next/font` as the
accessible web fallback. To change the brand, edit the two token lists and swap the logo/skyline assets
in `public/`. No component or flow changes are needed.

Accessibility: touch targets are ≥ 56px, focus outlines are a solid dark 3px ring, and all animation
(check tick, countdown, loading spinner) is disabled under `prefers-reduced-motion`.

### Loading feedback

Fetches that can take a moment — loading a guest's details, confirming a check-in, and submitting a
walk-in — show a blocking gold spinner overlay (`components/LoadingOverlay.tsx`) with an accessible
`role="alert"` message, so staff always see that something is happening.

---

## 11. Desk flow

1. **Search** by employee ID or name (3+ characters). Results show the allotted adult/children split
   plus entity and department, and tag anyone already checked in.
2. **Confirm.** The counters are pre-filled with the allotment, so the common case is one tap. Adjust
   up or down for who actually turned up. Going above the allotment is allowed and shows a notice —
   it is recorded as over allotment rather than blocked.
3. **Welcome** confirms the issued split, then returns to search after 8 seconds.

Re-selecting someone who is already checked in reopens the same screen pre-filled with what was
issued, so **staff can correct a mistake**. The original arrival time is kept.

Guests not in the list go through **Add as a new guest**: a 6-digit employee ID, a name, optional
entity/department, and the counts. They get no allotment, so everything issued shows as extra.
