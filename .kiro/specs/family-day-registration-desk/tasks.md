# Implementation Plan — Prestige Family Day 2026, Registration Desk

- [ ] 1. Scaffold the Next.js app and tooling
  - Initialise Next.js (App Router) + TypeScript + Tailwind in the workspace root.
  - Add dependencies: `prisma`, `@prisma/client`, `exceljs`, `csv-parse`, `iconv-lite`, `tsx`, and dev deps `vitest`, `@types/node`.
  - Add npm scripts: `dev`, `build`, `start`, `import` (`tsx scripts/import-master.ts`), `test`, `prisma:migrate`, `prisma:generate`.
  - Create `.gitignore` (ignore `data/*.csv`, `.env*`, `/node_modules`, `/.next`, local db artifacts) and `.env.example` (`DATABASE_URL`, `ADMIN_PIN`, `SESSION_SECRET`).
  - _Requirements: 16.2, 16.3, 16.5_

- [ ] 2. Define the Prisma schema and database layer
  - Write `prisma/schema.prisma` with the Postgres datasource, `Status`/`Source` enums, and the `Employee` model (arrays, `Json` `edited_fields`/`duplicate_of`, indexes on `full_name`).
  - Create `lib/db.ts` Prisma client singleton.
  - Generate the client and create the initial migration.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 3. Build shared domain libs with unit tests
  - [ ] 3.1 `lib/validation.ts`: `isValidEmail`, `isValidMobile`, `normaliseMobile`, `isNonEmptyName`.
    - _Requirements: 5.2, 6.2, 3.4_
  - [ ] 3.2 `lib/mask.ts`: `maskMobile` → `XXXXXX1234`.
    - _Requirements: 3.4, 16.1_
  - [ ] 3.3 `lib/wristbands.ts`: chip option sets (Married/Single free, paid extended), `wristbandTotal`, `amountToCollect` with Indian digit grouping.
    - _Requirements: 1.5, 8.3, 8.4, 8.5_
  - [ ] 3.4 `lib/mapping.ts`: `splitList`, `firstNonEmpty`, `mapRow(raw)` → canonical record + `needs_review`, and `dedupeByEmployeeId(records)` (keep latest `Completion time`, record `duplicate_of`, count drops).
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.10_
  - [ ] 3.5 Vitest tests for 3.1–3.4: Married/Single merge, email/mobile fallback precedence, split/trim/merge paid columns, mobile normalisation (`+91`, spaces, short), wristband recompute, dedupe-by-latest, misaligned rows → `needs_review`.
    - _Requirements: 16.4_

- [ ] 4. Implement the CSV import script
  - Relocate the provided CSV to `data/Prestige_Family_Day_2026_Sheet1_.csv`.
  - `scripts/import-master.ts`: read as Buffer → `iconv-lite` win1252 decode → `csv-parse` (columns, relax_quotes, bom) → normalised-header lookup (positional fallback logged) → `mapRow` → `dedupeByEmployeeId` → idempotent `upsert` (never clobber `walk_in`, never reset `pre_registered`).
  - Print the import report (rows read, unique IDs, duplicates dropped, rows flagged, upserted).
  - _Requirements: 1.1, 1.2, 1.9, 1.11, 1.12_

- [ ] 5. Session, rate limiting, and admin guard
  - [ ] 5.1 `lib/session.ts`: sign/verify HMAC session token with `exp`, cookie helpers (httpOnly, SameSite=Lax, Secure in prod, 8h), and `requireAdmin(req)`.
    - _Requirements: 12.2, 12.4_
  - [ ] 5.2 `lib/rate-limit.ts`: in-memory sliding-window limiter keyed by IP.
    - _Requirements: 3.6, 12.3_

- [ ] 6. Guest API routes
  - [ ] 6.1 `GET /api/search`: rate-limited, min 2 chars, prefix-OR-contains (insensitive), take 8, return masked public shape only.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 16.1_
  - [ ] 6.2 `GET /api/employee/[id]`: full record or 404.
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ] 6.3 `POST /api/register/[id]`: validate, idempotent `already_registered`, edited-fields diff, recompute totals, set `pre_registered` + `registered_at`, 404 unknown.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [ ] 6.4 `POST /api/walkin`: validate required fields, 409 on existing id, create `walk_in`/`walk_in` source with computed wristbands.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 7. Admin API routes
  - [ ] 7.1 `POST /api/admin/login` (constant-time PIN compare, rate-limited, sets cookie) and `POST /api/admin/logout`.
    - _Requirements: 12.1, 12.2, 12.3, 12.6_
  - [ ] 7.2 `GET /api/admin/stats` (requireAdmin → 401): six tile counts + full row data.
    - _Requirements: 13.1, 13.3, 13.6, 12.4_
  - [ ] 7.3 `GET /api/admin/export.xlsx` (requireAdmin → 401): `exceljs` workbook, three sheets, exact columns, bold+frozen header, auto-fit widths, ID/Mobile as text, timestamped filename, streamed download.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [ ] 8. Port the global theme and layout
  - `app/layout.tsx`: load Josefin Sans + Manrope via `next/font`, render `.sky`/`.veil`, wire font CSS variables.
  - `app/globals.css`: port the prototype `:root` tokens, cards, fields, chips, buttons, welcome/animation, admin table, and the `prefers-reduced-motion` block. Copy the poster to `public/theme.png`.
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ] 9. Build the guest kiosk screens
  - [ ] 9.1 `Brand` header component (full + compact) with exact copy.
    - _Requirements: 7.1_
  - [ ] 9.2 Guest screen-machine in `app/page.tsx` (screen state, current employee, chip selections) + footer "Staff sign-in" link to `/admin`.
    - _Requirements: 12.5_
  - [ ] 9.3 `Search`: debounced live results, Registered tag, no-match message, walk-in link, ambiguous-duplicate id+name pick.
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_
  - [ ] 9.4 `Confirm`: read-only id/marital, editable name/email/mobile with inline errors, free + paid chips, live tally, review banner, confirm/back; route already-registered result to Already screen.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_
  - [ ] 9.5 `Welcome`: animated tick, first name, wristband + amount pills, 8s auto-return + Next guest, reduced-motion aware.
    - _Requirements: 9.1, 9.2, 9.3_
  - [ ] 9.6 `Already`: message, time, wristbands, Next guest + Update my details.
    - _Requirements: 10.1, 10.2_
  - [ ] 9.7 `WalkIn`: four required fields with inline errors, optional marital (single-select) + family chips, duplicate-id message on the id field, success → Welcome.
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [ ] 10. Build the admin UI (`app/admin/page.tsx`)
  - PIN gate posting to `/api/admin/login`; on success show dashboard.
  - Stat tiles, filter tabs (Registered / Pre-registered / Walk-ins / Not yet arrived / All), text filter, sticky-header table with all columns, 10s auto-refresh, Download Excel + Sign out.
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ] 11. API integration tests
  - Register API (422 validation, edited-fields diff, idempotent no-op, 404), walk-in API (validation, 409 duplicate, success), export (three sheets, Summary counts, ID/Mobile as text, bold+frozen header). Document the test `DATABASE_URL` and reset fixture.
  - _Requirements: 16.4_

- [ ] 12. Documentation, gitignore verification, and perf check
  - Write `README.md`: prerequisites, local Postgres (Docker/Supabase CLI) setup, `.env`, migrate, import, run, test, and Vercel + Supabase deployment (migrate deploy, env vars, one-time import). Include the < 200 ms search timing check.
  - Verify `.gitignore` keeps CSV/db/.env out of git; confirm `.env.example` documents `ADMIN_PIN` and `DATABASE_URL` (+ `SESSION_SECRET`).
  - _Requirements: 16.1, 16.2, 16.3, 16.5_
