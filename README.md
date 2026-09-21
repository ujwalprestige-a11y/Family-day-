# Prestige Family Day 2026 – Registration Desk

A tablet/kiosk web app for the registration desk at **Beyond the Skyline** (26 September 2026).
Guests find their pre-loaded record, confirm their details, pick family / paid extended-family
wristbands, and check in. Staff can register walk-ins and view a live admin dashboard with an Excel
export.

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

# 5. Import the master guest list from the CSV
npm run import

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

## 3. Data import

The importer reads `data/Prestige_Family_Day_2026_Sheet1_.csv` (the Microsoft Forms export) and:

- decodes it as **latin1 / CP1252** (the `₹` symbol is corrupted in the export);
- merges the separate **Married** and **Single** answer columns into one record
  (email, mobile, family members, paid extended family, full name, marital status);
- trims every value and stores `employee_id` as a string;
- **recomputes** `wristbands_total = 1 (self) + family members + paid extended` (the sheet's own total
  column is ignored);
- normalises mobiles (strips `+91`, spaces) and flags misaligned/incomplete rows with `needs_review`;
- **keeps every row** — no de-duplication. The same `employee_id` may appear on several rows (people who
  submitted more than once); the desk search shows each match with the name so staff pick the correct
  one. Each row has a surrogate primary key (`id`); the Forms response `Id` is stored as `form_id`;
- is **idempotent** by `form_id` — re-running upserts the same rows instead of creating duplicates, and
  never overwrites walk-ins or resets anyone who has already checked in.

It prints a report, e.g.:

```
Prestige Family Day 2026 — import report
  Rows read:            1389
  Rows imported:        1389
  Unique employee IDs:  1200
  Rows flagged review:  117
Done in 5.8s
```

> The CSV contains employee PII and is **git-ignored**. Keep it out of version control.

---

## 4. Tests

```bash
npm test
```

Requires the local Postgres to be running (`npm run db:local`). Tests run against an **isolated `test`
schema** so they never touch your imported data. Coverage:

- **Import mapping** — Married/Single merge, email/mobile fallback precedence, `;`-splitting,
  mobile normalisation, wristband recomputation, de-duplication by latest submission, and
  misaligned-row flagging.
- **Register API** — validation (422), edited-fields tracking, idempotent `already_registered`,
  404 for unknown id.
- **Walk-in API** — required-field validation, duplicate-id rejection (409), computed wristbands.
- **Export** — three sheets, Summary counts, Employee ID & Mobile stored as text, bold + frozen
  header, and the session gate (401 without a session).

---

## 5. Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (local embedded Postgres, or Supabase in prod). |
| `DIRECT_URL` | *(prod, optional)* Non-pooled Supabase URL for running migrations. |
| `ADMIN_PIN` | PIN for the `/admin` sign-in screen. |
| `SESSION_SECRET` | Long random string used to sign the admin session cookie. |

See `.env.example` for ready-to-use local values.

---

## 6. Deployment (Vercel + Supabase)

1. **Create a Supabase project.** From *Project Settings → Database*, copy the connection strings:
   - the **pooled** connection (port 6543, `?pgbouncer=true`) → `DATABASE_URL`
   - the **direct** connection (port 5432) → `DIRECT_URL` (used for migrations)

   To use `DIRECT_URL`, add it to the Prisma datasource:
   ```prisma
   datasource db {
     provider  = "postgresql"
     url       = env("DATABASE_URL")
     directUrl = env("DIRECT_URL")
   }
   ```

2. **Apply the schema to Supabase:**
   ```bash
   DATABASE_URL="<direct-url>" npm run prisma:deploy   # prisma migrate deploy
   ```

3. **Import the master list once** against Supabase:
   ```bash
   DATABASE_URL="<direct-url>" npm run import
   ```

4. **Deploy to Vercel.** Import the repo, then set env vars in *Project → Settings → Environment
   Variables*: `DATABASE_URL` (pooled), `DIRECT_URL`, `ADMIN_PIN`, `SESSION_SECRET`. The build runs
   `prisma generate && next build`.

No schema or code changes are needed to switch between local and Supabase — only `DATABASE_URL`.

---

## 7. Performance & security notes

- **Search** responds well under the 200 ms target for ~1,500 records (indexed prefix on `employee_id`
  and an index on `full_name`, capped at 8 results). Measure locally with any query, e.g. time
  `GET /api/search?q=ra`.
- Search results **never expose** full email or mobile — mobiles are masked as `XXXXXX1234`. The full
  record is returned only via `/api/employee/:id` after the guest selects a result.
- Admin routes require a signed, httpOnly session cookie (8h). The PIN is compared in constant time,
  and both search and admin login are rate-limited (in-memory; see below).
- The rate limiter is in-memory, which suits a single kiosk node. If the app is scaled to multiple
  instances, swap `lib/rate-limit.ts` for a shared store (e.g. Upstash Redis).

---

## 8. Project structure

```
app/                     # App Router: guest kiosk (page.tsx), /admin, and /api routes
components/              # Brand, Chip, CheckTick
lib/                     # db, mapping, validation, wristbands, mask, session, rate-limit, export
prisma/schema.prisma     # Employee model (Postgres)
scripts/import-master.ts # CSV → DB importer
scripts/local-db.ts      # local embedded Postgres runner
__tests__/               # Vitest unit + API tests
data/                    # master CSV (git-ignored)
public/theme.png         # event poster (replace the placeholder)
```

---

## 9. Available scripts

| Script | What it does |
|--------|--------------|
| `npm run db:local` | Start the local embedded Postgres (leave running). |
| `npm run prisma:migrate` | Create/apply migrations locally (`migrate dev`). |
| `npm run prisma:deploy` | Apply migrations in production (`migrate deploy`). |
| `npm run import` | Import the master CSV. |
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
| `--paper` / `--soft-gold` | `#FBF8F1` / `#F3ECDB` | Tints for tiles, tally, selected chips |
| `--line` / `--line-2` | `#E4DCC8` / `#CDBF9C` | Card and input borders |
| `--paid-fill` | `#EADBB4` | Selected paid-extended chips |
| `--danger` / `--ok` | `#B3261E` / `#2E7D4F` | Errors / success |

Font stack: `'Grandview', 'Segoe UI', <Source Sans 3>, Arial, sans-serif`. Grandview is the proprietary
brand font (used if installed on the device); **Source Sans 3** is loaded via `next/font` as the
accessible web fallback. To change the brand, edit the two token lists and swap the logo/skyline assets
in `public/`. No component or flow changes are needed.

Accessibility: touch targets are ≥ 56px, focus outlines are a solid dark 3px ring, and all animation
(check tick, countdown, loading spinner) is disabled under `prefers-reduced-motion`.

### Loading feedback

Fetches that can take a moment — loading a guest's details, confirming a registration, and submitting a
walk-in — show a blocking gold spinner overlay (`components/LoadingOverlay.tsx`) with an accessible
`role="alert"` message, so staff always see that something is happening.
