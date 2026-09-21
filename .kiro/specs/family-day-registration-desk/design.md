# Design — Prestige Family Day 2026, Registration Desk

## 1. Overview

A single Next.js (App Router) + TypeScript application, styled with Tailwind, backed by Prisma against
PostgreSQL. It serves the guest kiosk flow (search → confirm → welcome / already / walk-in) and a
PIN-protected admin dashboard with an `exceljs` export. Master data is imported once (re-runnable) from
the Microsoft Forms CSV via a Node script.

The reference prototype (`/reference/family-day-registration-desk.html`) is the visual and behavioural
source of truth. The production app reproduces its markup, CSS, copy, and interactions, replacing the
in-memory sample DB and browser-only XLSX with real API calls and server-side Excel generation.

### 1.1 High-level architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Next.js App (single deployable, Vercel)                            │
│                                                                    │
│  app/(guest)/page.tsx      ── Guest kiosk (client state machine)   │
│  app/admin/page.tsx        ── Admin PIN + dashboard (client)       │
│                                                                    │
│  app/api/search            GET   ── masked, rate-limited           │
│  app/api/employee/[id]     GET   ── full record for one id         │
│  app/api/register/[id]     POST  ── idempotent check-in            │
│  app/api/walkin            POST  ── create walk-in                 │
│  app/api/admin/login       POST  ── PIN → httpOnly session cookie  │
│  app/api/admin/logout      POST  ── clear session                 │
│  app/api/admin/stats       GET   ── tiles + rows (session req.)    │
│  app/api/admin/export.xlsx GET   ── exceljs workbook (session req.)│
│                                                                    │
│  lib/  (db, validation, mapping, wristbands, rate-limit, session)  │
│  prisma/schema.prisma  ── Employee model (Postgres)                │
│  scripts/import-master.ts ── CSV → DB (latin1, dedupe, report)     │
└───────────────────────────────┬────────────────────────────────────┘
                                 │ Prisma
                                 ▼
                    PostgreSQL (local Docker / Supabase prod)
```

### 1.2 Project structure

```
family-day-app/
├─ app/
│  ├─ layout.tsx                # fonts (Josefin Sans, Manrope), global bg (sky + veil)
│  ├─ globals.css               # ported prototype CSS + Tailwind layers
│  ├─ page.tsx                  # guest kiosk screen-machine
│  ├─ admin/page.tsx            # admin (pin gate + dashboard)
│  └─ api/
│     ├─ search/route.ts
│     ├─ employee/[id]/route.ts
│     ├─ register/[id]/route.ts
│     ├─ walkin/route.ts
│     └─ admin/
│        ├─ login/route.ts
│        ├─ logout/route.ts
│        ├─ stats/route.ts
│        └─ export.xlsx/route.ts
├─ components/                  # Search, Confirm, Welcome, Already, WalkIn, admin bits
├─ lib/
│  ├─ db.ts                     # Prisma singleton
│  ├─ mapping.ts                # CSV row → canonical record (shared by import + tests)
│  ├─ wristbands.ts             # total + amount helpers, chip option sets
│  ├─ validation.ts             # email / mobile / name validators + mobile normaliser
│  ├─ mask.ts                   # XXXXXX1234
│  ├─ session.ts                # sign/verify admin session cookie
│  └─ rate-limit.ts             # in-memory sliding-window limiter
├─ prisma/schema.prisma
├─ scripts/import-master.ts
├─ data/Prestige_Family_Day_2026_Sheet1_.csv   # gitignored
├─ public/theme.png             # poster
├─ __tests__/                   # vitest
├─ .env.example
├─ .gitignore
└─ README.md
```

---

## 2. Data model (Prisma / Postgres)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Status {
  not_registered
  pre_registered
  walk_in
}

enum Source {
  master
  walk_in
}

model Employee {
  employee_id      String   @id
  full_name        String
  email            String
  mobile           String
  marital_status   String
  family_members   String[]              // native Postgres text[]
  paid_extended    String[]              // native Postgres text[]
  wristbands_total Int      @default(1)
  status           Status   @default(not_registered)
  source           Source   @default(master)
  edited_fields    Json     @default("[]")
  registered_at    DateTime?
  needs_review     Boolean  @default(false)

  // de-dup bookkeeping: which duplicate submissions existed for this id
  duplicate_of     Json     @default("[]")  // [{ employee_id, full_name }]

  created_at       DateTime @default(now())
  updated_at       DateTime @updatedAt

  @@index([full_name])
}
```

Notes:
- `String[]` and `Json` are native on Postgres — identical locally (Docker) and on Supabase.
- `@@index([full_name])` plus the primary-key index on `employee_id` keeps the "prefix OR contains"
  search fast for ~1,500 rows (well under 200 ms; see §7).
- `duplicate_of` supports Requirement 1.10 / 7.7 — when a guest's id maps to multiple submissions, the
  desk can show id + name candidates. In practice unique-id dedupe collapses to one record; this field
  records the alternates for transparency and admin review.

---

## 3. CSV import (`scripts/import-master.ts`)

### 3.1 Column index map (validated against the real file)

| Idx | Header | Use |
|-----|--------|-----|
| 0 | Id | ignore |
| 1 | Start time | ignore |
| 2 | Completion time | de-dup only |
| 3 | Email | email fallback (3rd) |
| 4 | Name | name fallback |
| 5 | Full Name | name (primary) |
| 6 | Employee ID | id (string) |
| 7 | Marital Status | marital_status |
| 8 | Married Team Members… | family (Married) |
| 9 | Paid Wristband – Extended Family… | paid (Married) |
| 10 | Contact Number | mobile (Married) |
| 11 | Employee Email ID | email (Married, primary) |
| 12 | Total…Wristbands | ignore |
| 13 | Acknowledgement… | ignore |
| 14 | Single Team Members… | family (Single) |
| 15 | Paid Wristband – Extended Family…1 | paid (Single) |
| 16 | Total…Wristbands1 | ignore |
| 17 | Contact Number1 | mobile (Single) |
| 18 | Email Address | email (Single, 2nd) |
| 19 | Acknowledgement…1 | ignore |

Headers are matched by **normalised name** (trimmed, collapsed whitespace), not by fixed position, so
the script is resilient if column order shifts. A fallback to positional mapping is used only if a
header can't be found, and any such fallback is logged.

### 3.2 Parsing & pipeline

1. Read file as a Buffer, decode with `iconv-lite` using `win1252` (latin1/CP1252).
2. Parse with `csv-parse` (`columns: true`, `relax_quotes`, `skip_empty_lines`, `bom: true`).
3. For each raw row, `mapRow(raw)` (in `lib/mapping.ts`) produces a canonical record:
   - `employee_id = trim(Employee ID)`
   - `full_name = trim(Full Name) || trim(Name)`
   - `marital_status = trim(Marital Status)`
   - `email = firstNonEmpty(Employee Email ID, Email Address, Email)`
   - `mobile = normaliseMobile(firstNonEmpty(Contact Number, Contact Number1))`
   - `family_members = splitList(Married Team Members… || Single Team Members…)`
   - `paid_extended = splitList(Paid Married) ∪ splitList(Paid Single)`
   - `wristbands_total = 1 + family_members.length + paid_extended.length`
   - `completion_time = parseDate(Completion time)` (kept only for dedupe)
4. **needs_review** is set true when any of:
   - `employee_id` empty/whitespace-only or non-numeric-looking,
   - `email` empty or fails the email regex,
   - normalised `mobile` is not exactly 10 digits,
   - `full_name` empty.
5. **De-duplication:** group by `employee_id` (empty ids grouped under a synthetic key and each kept but
   flagged). Within a group, sort by `completion_time` desc; keep the newest as the stored record, push
   `{employee_id, full_name}` of the rest into `duplicate_of`. Count dropped duplicates.
6. **Upsert** each surviving record by `employee_id` (`prisma.employee.upsert`), setting
   `source = master`, `status = not_registered`. Upsert only overwrites master-owned fields; it never
   deletes or clobbers `walk_in` rows and never resets a record that is already `pre_registered`
   (import updates master profile fields but leaves check-in state intact on re-run).
7. **normaliseMobile:** strip spaces, dashes, parentheses; drop a leading `+91`/`91`/`0`; keep digits;
   if the result is 10 digits return it, otherwise return the digits as-is and let needs_review catch it.
8. **splitList:** `split(";")`, trim each, drop empties, de-dupe within the row.

### 3.3 Import report (stdout)

```
Prestige Family Day 2026 — import report
  Rows read:            1389
  Unique employee IDs:  1203
  Duplicates dropped:   184
  Rows flagged review:  27
  Upserted (master):    1203
Done in 1.9s
```

Exact numbers are computed at runtime; the format above is fixed.

---

## 4. API design

All routes are App Router route handlers returning JSON (except the export). Shared helpers live in
`lib/`. Validation errors return `422` with `{ errors: { field: message } }`.

### 4.1 `GET /api/search?q=`
- Rate-limited (see §6.3). `q = (searchParams.q ?? '').trim()`.
- If `q.length < 2` → `{ results: [] }`.
- Query: `where: { OR: [{ employee_id: { startsWith: q } }, { full_name: { contains: q, mode: 'insensitive' } }] }`,
  `take: 8`, ordered by name.
- Map each row to the **public shape** only:
  `{ employee_id, full_name, marital_status, mobile_masked: mask(mobile), status }`.
- Never returns email or raw mobile.

### 4.2 `GET /api/employee/[id]`
- Returns the full record for one id, or `404 { error: 'not_found' }`.
- This is the only endpoint that returns full email + mobile, and only for a single explicitly chosen id.

### 4.3 `POST /api/register/[id]`
- Body: `{ full_name, email, mobile, family_members: string[], paid_extended: string[] }`.
- Load record → `404` if missing.
- If `status !== 'not_registered'` → return `200 { result: 'already_registered', employee }` with **no
  writes** (idempotent).
- Validate (name non-empty, email regex, mobile 10 digits) → `422` on failure.
- Compute `edited_fields` = names of fields differing from stored values (compares the 5 editable fields;
  arrays compared as sets).
- Update: editable fields, `edited_fields`, `wristbands_total = 1 + fam + paid`,
  `status = 'pre_registered'`, `registered_at = now()`, `needs_review = false`.
- Return `200 { result: 'registered', employee }`.

### 4.4 `POST /api/walkin`
- Body: `{ employee_id, full_name, email, mobile, marital_status?, family_members?: string[] }`.
- Validate all four required fields → `422` on failure.
- If an Employee with that id exists → `409 { error: 'exists', message: 'This ID is already in the
  list. Please search for it instead.' }`.
- Create with `status = 'walk_in'`, `source = 'walk_in'`, `paid_extended = []`,
  `wristbands_total = 1 + family_members.length`, `registered_at = now()`.
- Return `201 { result: 'walkin', employee }`.

### 4.5 Admin auth
- `POST /api/admin/login` body `{ pin }`. Rate-limited per IP. Compare against `process.env.ADMIN_PIN`
  using a constant-time comparison. On success `Set-Cookie` an httpOnly, `SameSite=Lax`,
  `Secure` (in prod), signed session token, `Max-Age = 8h`. On failure `401`.
- `POST /api/admin/logout` clears the cookie.
- Session token = `base64(payload).hmacSHA256(SESSION_SECRET)` with `exp`. Verified in a small
  `requireAdmin(req)` guard used by all `/api/admin/*` handlers; missing/invalid/expired → `401`.

### 4.6 `GET /api/admin/stats`
- `requireAdmin`; returns `{ tiles, rows }` where `tiles` = the six counts and `rows` = full table data
  (this endpoint is behind the session, so returning full email/mobile is acceptable for staff).

### 4.7 `GET /api/admin/export.xlsx`
- `requireAdmin`; builds workbook with `exceljs` (§5); streams with
  `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and
  `Content-Disposition: attachment; filename="Family_Day_2026_Registrations_<stamp>.xlsx"`.

---

## 5. Excel export (`exceljs`)

- Sheet **Registrations**: employees where `status ∈ {pre_registered, walk_in}`.
- Sheet **Not yet arrived**: `status = not_registered` (source master).
- Sheet **Summary**: title, exported timestamp, in-master count, pre-registered, walk-ins, not yet
  arrived, wristbands issued, ₹ to collect.
- Shared columns (first two sheets): Employee ID, Full Name, Email, Mobile, Marital Status,
  Family Members, Paid Extended Family, Wristbands (incl. self), Amount to Collect (INR), Status,
  Source, Registered At, Fields Edited at Desk.
- Formatting: header row bold; `views: [{ state:'frozen', ySplit:1 }]`; column widths auto-fit from the
  max cell length per column; **Employee ID and Mobile cells set to text** (`numFmt = '@'` and string
  values) so leading zeros/long numbers are preserved; `Amount to Collect` as number.
- `Family Members` / `Paid Extended Family` joined with `; `.
- Filename stamp: `YYYY-MM-DD_HHmm` from server local time.

---

## 6. Cross-cutting concerns

### 6.1 Fonts & theme
- `next/font/google` loads Josefin Sans (200–600) and Manrope (400–700), exposed as CSS variables that
  the ported `--display` / `--body` tokens use.
- `globals.css` ports the prototype's `:root` tokens, `.sky` / `.veil`, cards, chips, buttons, admin
  table, and the reduced-motion block verbatim. Poster referenced at `/theme.png`.

### 6.2 Client state machine (guest)
- One client component holds `screen ∈ {search, confirm, welcome, already, walkin}` plus the current
  employee and chip selections, mirroring the prototype's `show()` function. Screen transitions and the
  8-second welcome countdown/auto-return match the prototype. Admin lives at its own `/admin` route
  (rather than an in-page screen) so the session cookie flow and URL are clean; the footer "Staff
  sign-in" link navigates there.

### 6.3 Rate limiting
- `lib/rate-limit.ts`: in-memory sliding-window keyed by IP (from `x-forwarded-for`), used by
  `/api/search` (e.g. 30 req / 10s) and `/api/admin/login` (e.g. 5 failed / 5 min → temporary block).
  In-memory is adequate for a single-node kiosk deployment; a note in the README explains swapping to a
  shared store (e.g. Upstash) if scaled horizontally.

### 6.4 Validation (`lib/validation.ts`)
- `isValidEmail`: `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$` (same intent as prototype).
- `isValidMobile`: `^\d{10}$` after normalisation.
- `normaliseMobile`: shared with import.
- Server-side validation is authoritative; client mirrors it for instant inline errors.

### 6.5 Security notes
- Search never returns email/full mobile. Full record only via explicit `/api/employee/[id]`.
- Admin endpoints all gated by `requireAdmin`. PIN compared in constant time; `ADMIN_PIN` and
  `SESSION_SECRET` come from env. No admin data on any public endpoint.
- `.gitignore` excludes `data/*.csv`, `.env*`, and any local db artifacts.

---

## 7. Performance

- ~1,500 rows in Postgres with a PK index on `employee_id` (prefix search) and an index on `full_name`.
  `take: 8` caps result size. Query + serialization is comfortably < 200 ms; the README documents a
  simple timing check. If needed, a `pg_trgm` GIN index is noted as an optional enhancement for
  `contains` search, but is not required at this scale.

---

## 8. Testing strategy (Vitest)

- **Mapping / import (`lib/mapping.ts`)** — pure functions, no DB:
  - Married row merges from Married columns; Single row from Single columns.
  - `email`/`mobile` fallback precedence.
  - `splitList` trims, drops empties, merges the two paid columns.
  - `normaliseMobile` handles `+91 `, spaces, short numbers.
  - `wristbands_total` recomputed, sheet total ignored.
  - De-dup keeps the latest `Completion time`, records alternates in `duplicate_of`, counts drops.
  - Misaligned rows (whitespace id, bad email, short mobile) → `needs_review = true`.
- **Register API** — validation failures (422), edited-fields diff, idempotent `already_registered`
  leaves data unchanged, 404 for unknown id.
- **Walk-in API** — required-field validation, duplicate-id → 409, success shape + computed wristbands.
- **Export** — builds three sheets, correct counts on Summary, Employee ID & Mobile stored as text,
  header row present/bold, frozen top row.
- API tests run handlers against a test Postgres schema (or a transactional/reset fixture); a
  `README`-documented `DATABASE_URL` for tests. Mapping tests need no DB and run everywhere.

---

## 9. Environment & deployment

- `.env.example`:
  ```
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/familyday?schema=public"
  ADMIN_PIN="2026"
  SESSION_SECRET="change-me-long-random"
  ```
- **Local:** run Postgres via Docker (`docker run ... postgres`) or Supabase CLI local stack →
  `npx prisma migrate dev` → `npx tsx scripts/import-master.ts` → `npm run dev`.
- **Production (Supabase + Vercel):** create a Supabase project, set `DATABASE_URL` (Supabase pooled
  connection string) + `ADMIN_PIN` + `SESSION_SECRET` in Vercel env, run `prisma migrate deploy`, import
  the master CSV once against the Supabase DB. No code/schema changes between environments.
- README documents each step, the import command, and the timing/perf check.

---

## 10. Mapping to the prototype (fidelity checklist)

| Prototype element | Production implementation |
|---|---|
| Brand header + compact variant | `components/Brand.tsx`, same classes/copy |
| Search box + debounced live results + Registered tag + no-match | `Search` component → `/api/search` (debounce ~200ms) |
| Ambiguous duplicate pick | results list shows id + name candidates (R7.7) |
| Confirm: read-only id/marital, editable fields, chips, live tally, review banner | `Confirm` component → `/api/register/[id]` |
| Welcome: animated tick, first name, pills, 8s countdown, Next guest | `Welcome` component, reduced-motion aware |
| Already registered | `Already` component from register `already_registered` |
| Walk-in form | `WalkIn` component → `/api/walkin` |
| Admin PIN + dashboard + tabs + 10s refresh + Excel + sign out | `/admin` route → `/api/admin/*` |
| Colours, fonts, glass, focus, reduced-motion | ported `globals.css` + `next/font` |
