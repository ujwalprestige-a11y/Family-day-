# Requirements — Prestige Family Day 2026, Registration Desk

## Introduction

"Prestige Family Day 2026 – Registration Desk" is a single, self-contained web app that runs on a
tablet/kiosk at the door of the event **"Beyond the Skyline" on 26 September 2026**. Desk staff (and
guests, under staff supervision) use it to find a pre-loaded employee record, confirm or correct their
details, choose family/extended-family wristbands, and check in. Staff can also register walk-in guests
who are not on the master list, and view a live admin dashboard with an Excel export.

The master guest list is imported from a Microsoft Forms CSV export (~1,389 rows, ~1,200 unique
employee IDs, with duplicate submissions and some misaligned rows). The app must de-duplicate that
data, merge the separate "Married" and "Single" answer columns into one clean record, and store it.

The UI, copy, colours, layout, screens, and interaction behaviour must match the working prototype at
`/reference/family-day-registration-desk.html` exactly. The prototype's sample data and in-memory logic
are replaced by a real backend.

### Technical framing (non-negotiable stack)

- **Framework:** Next.js (App Router) + TypeScript + Tailwind CSS, one single deployable app.
- **Data layer:** Prisma ORM with **PostgreSQL** as the single provider everywhere. Local development
  runs against a **local Postgres** instance (Docker container or the Supabase CLI local stack);
  production points `DATABASE_URL` at a hosted **Supabase** project. The schema is identical in both —
  only `DATABASE_URL` changes. Deployment target is **Vercel**.
- **Excel export:** `exceljs`, generated server-side.
- **Master data source:** `data/Prestige_Family_Day_2026_Sheet1_.csv` (the provided
  `Prestige Family Day_2026(Sheet1).csv`, relocated into `data/`), read as **latin1/CP1252**.

### Glossary

- **Master record** — an employee imported from the CSV (`source = master`).
- **Walk-in** — a guest created at the desk who was not in the master list (`source = walk_in`).
- **Pre-registered** — a master record that has checked in at the desk (`status = pre_registered`).
- **Wristband total** — `1 (self) + free family members + paid extended family members`.
- **Paid extended family** — extended relatives at ₹2,500 each, collected at the desk.
- **needs_review** — a record flagged at import time because its data looked misaligned/incomplete.

---

## Requirement 1 — Data import from the Microsoft Forms CSV

**User story:** As a desk administrator, I want to import the Forms export into a clean, de-duplicated
database, so that guests can be found reliably at the desk.

#### Acceptance criteria

1. THE SYSTEM SHALL provide a script `scripts/import-master.ts` that reads
   `data/Prestige_Family_Day_2026_Sheet1_.csv`.
2. WHEN the script reads the file THEN THE SYSTEM SHALL decode it as latin1/CP1252 so corrupted
   symbols (e.g. the `₹` sign appearing as `?`) are handled, and SHALL trim every field value.
3. THE SYSTEM SHALL map each row into a canonical record using these rules:
   - `email` = `Employee Email ID` (Married) if present, else `Email Address` (Single) if present,
     else `Email`.
   - `mobile` = `Contact Number` (Married) if present, else `Contact Number1` (Single).
   - `family_members` = `split(";")` of the `Married Team Members…` column OR the
     `Single Team Members…` column (whichever is populated), trimmed, empty entries removed.
   - `paid_extended` = `split(";")` of the two `Paid Wristband – Extended Family…` columns
     (Married column and Single `…1` column), trimmed, empty entries removed.
   - `full_name` = `Full Name` if present, else `Name`.
   - `marital_status` = `Marital Status`.
4. THE SYSTEM SHALL store `employee_id` as a string.
5. THE SYSTEM SHALL recompute `wristbands_total = 1 + family_members.length + paid_extended.length`
   and SHALL ignore the CSV's own "Total Number of Wristbands Requested" columns.
6. WHEN a mobile value contains a country prefix or spaces (e.g. `+91 8296473767`) THEN THE SYSTEM
   SHALL normalise it toward a 10-digit number where possible (strip spaces and a leading `+91`/`91`).
7. WHEN the same `employee_id` appears in more than one row THEN THE SYSTEM SHALL keep a single record
   per unique `employee_id`, choosing the most recent submission by `Completion time`, and SHALL treat
   `Completion time` as used only for de-duplication (not stored as a business field beyond that need).
8. WHEN a row is misaligned or incomplete (e.g. email/ID in the wrong column, an all-whitespace
   Employee ID, or a mobile with fewer than 10 digits) THEN THE SYSTEM SHALL still import it and SHALL
   set `needs_review = true`.
9. THE SYSTEM SHALL ignore the `Id`, `Start time`, and both `Acknowledgement of Guidelines` columns.
10. WHEN more than one unique row shares the same non-empty `employee_id` (a genuine duplicate submission
    by the same person) THEN THE SYSTEM SHALL, in addition to keeping the most recent, retain enough
    information (id + name of the conflicting submissions) so the desk UI can let a guest pick the
    correct one where the choice is ambiguous.
11. WHEN import completes THEN THE SYSTEM SHALL print an import report to stdout showing: rows read,
    unique employee IDs, duplicate rows dropped, and rows flagged `needs_review`.
12. THE SYSTEM SHALL make the import re-runnable (idempotent for master data): re-running SHALL upsert
    master records without creating duplicates and without discarding walk-ins.

---

## Requirement 2 — Data model

**User story:** As a developer, I want a single Employee model that captures both master and walk-in
guests, so that search, registration, admin, and export all read from one consistent source.

#### Acceptance criteria

1. THE SYSTEM SHALL define an `Employee` model with:
   `employee_id` (primary key, string), `full_name`, `email`, `mobile`, `marital_status`,
   `family_members` (list of strings), `paid_extended` (list of strings), `wristbands_total` (int),
   `status` (`not_registered | pre_registered | walk_in`), `source` (`master | walk_in`),
   `edited_fields` (JSON), `registered_at` (nullable timestamp), `needs_review` (boolean).
2. THE SYSTEM SHALL default `status` to `not_registered` and `source` to `master` for imported records.
3. THE SYSTEM SHALL use PostgreSQL for both local and production, so native `String[]` array columns
   and `Json` columns behave identically in development (local Postgres) and production (Supabase);
   only `DATABASE_URL` differs between environments.
4. THE SYSTEM SHALL keep the CSV, the database file(s), and `.env` out of version control.

---

## Requirement 3 — Search API

**User story:** As a guest at the desk, I want to type my employee ID or name and see matching results
quickly, without exposing anyone's full contact details.

#### Acceptance criteria

1. THE SYSTEM SHALL expose `GET /api/search?q=` that matches on `employee_id` **prefix** OR `full_name`
   **contains**, case-insensitive.
2. WHEN `q` has fewer than 2 characters THEN THE SYSTEM SHALL return no results.
3. THE SYSTEM SHALL return at most 8 results.
4. THE SYSTEM SHALL return only: `employee_id`, `full_name`, `marital_status`, masked mobile in the form
   `XXXXXX1234` (last 4 digits only), and `status`. It SHALL NOT return full mobile or email.
5. THE SYSTEM SHALL respond in under 200 ms for a dataset of ~1,500 records.
6. THE SYSTEM SHALL rate-limit this endpoint per client to protect against abuse.

---

## Requirement 4 — Employee detail API

**User story:** As a guest who selected my result, I want the desk to load my full record so I can check
and correct it.

#### Acceptance criteria

1. THE SYSTEM SHALL expose `GET /api/employee/:id` that returns the full record for one employee.
2. THE SYSTEM SHALL expect this to be called only after the guest selects a search result (the full
   record, including full email and mobile, is returned only for the selected id — never in bulk).
3. WHEN no employee matches `:id` THEN THE SYSTEM SHALL return a 404.

---

## Requirement 5 — Registration API (pre-registration / check-in)

**User story:** As a guest, I want to confirm my details and check in, and I want a second confirmation
to safely do nothing if I'm already checked in.

#### Acceptance criteria

1. THE SYSTEM SHALL expose `POST /api/register/:id`.
2. THE SYSTEM SHALL validate the payload: `full_name` not empty, `email` in valid format, `mobile`
   exactly 10 digits; and SHALL reject invalid payloads with field-level errors.
3. WHEN validation passes THEN THE SYSTEM SHALL save edited values, compute which of
   `full_name/email/mobile/family_members/paid_extended` changed relative to the stored record, record
   those in `edited_fields`, recompute `wristbands_total`, set `status = pre_registered`, and set
   `registered_at` to the current time.
4. THE SYSTEM SHALL be idempotent: WHEN the record is already `pre_registered` or `walk_in` THEN THE
   SYSTEM SHALL return an `already_registered` result and SHALL NOT change any stored data.
5. WHEN no employee matches `:id` THEN THE SYSTEM SHALL return a 404.

---

## Requirement 6 — Walk-in API

**User story:** As desk staff, I want to register a guest who isn't on the master list, so nobody is
turned away.

#### Acceptance criteria

1. THE SYSTEM SHALL expose `POST /api/walkin`.
2. THE SYSTEM SHALL require: `employee_id`, `full_name`, `email` (valid format), `mobile` (10 digits),
   and SHALL reject the request with field-level errors if any are missing/invalid.
3. THE SYSTEM SHALL accept optional `marital_status` and `family_members`.
4. WHEN the submitted `employee_id` already exists THEN THE SYSTEM SHALL reject the request and instruct
   the guest to search instead (no overwrite).
5. WHEN a walk-in is created THEN THE SYSTEM SHALL set `status = walk_in`, `source = walk_in`,
   `registered_at` = now, and compute `wristbands_total`.

---

## Requirement 7 — Guest screen: Search

**User story:** As a guest, I want a clear branded search screen so I can find myself quickly.

#### Acceptance criteria

1. THE SYSTEM SHALL show the header exactly as the prototype:
   `PRESTIGE / BEYOND / THE SKYLINE / Building tomorrow, together. / 26 SEPTEMBER 2026`.
2. THE SYSTEM SHALL show one large search box labelled/placeholdered for "Employee ID or name".
3. THE SYSTEM SHALL show live suggestions as the guest types, debounced, calling `/api/search`.
4. THE SYSTEM SHALL show a "Registered" tag beside any result that is already `pre_registered`/`walk_in`.
5. WHEN there are no matches THEN THE SYSTEM SHALL show the prototype's no-match message.
6. THE SYSTEM SHALL show a link "Not on the list? Register as a new guest" that opens the walk-in form.
7. WHEN more than one master record shares the guest's typed employee ID (ambiguous duplicate) THEN THE
   SYSTEM SHALL let the guest pick the correct one by showing employee ID + name for each candidate.

---

## Requirement 8 — Guest screen: Check your details (confirm)

**User story:** As a guest, I want to review and fix my details and pick my wristbands before confirming.

#### Acceptance criteria

1. THE SYSTEM SHALL pre-fill the record and show `employee_id` and `marital_status` as read-only.
2. THE SYSTEM SHALL allow editing `full_name`, `email`, `mobile`, with inline validation errors.
3. THE SYSTEM SHALL show free family wristbands as toggle chips: Married → Spouse, Child 1, Child 2,
   Child 3; Single → Parent 1, Parent 2. Any pre-selected value not in the standard set SHALL still be
   shown as a selectable chip.
4. THE SYSTEM SHALL show paid extended-family chips (Parent 1, Parent 2, Sibling 1, Sibling 2, Others 1)
   at ₹2,500 each, styled with the gold "paid" accent, with a note that payment is collected at the desk.
5. THE SYSTEM SHALL show a live tally of total wristbands (incl. self) and amount to pay
   (`paid count × ₹2,500`), formatted in Indian digit grouping.
6. WHEN the record has `needs_review = true` (or the mobile is not 10 digits) THEN THE SYSTEM SHALL show
   the warning banner.
7. THE SYSTEM SHALL provide "Confirm registration" (calls `/api/register/:id`) and "Back to search".
8. WHEN the guest confirms and the record is already registered THEN THE SYSTEM SHALL route to the
   "Already registered" screen rather than overwriting.

---

## Requirement 9 — Guest screen: Welcome

**User story:** As a guest, I want a warm confirmation that I'm checked in.

#### Acceptance criteria

1. WHEN registration succeeds THEN THE SYSTEM SHALL show the animated check, "WELCOME TO FAMILY DAY",
   the guest's **first name**, the wristband count, and the amount to pay if any.
2. THE SYSTEM SHALL auto-return to Search after 8 seconds and SHALL provide a "Next guest" button.
3. THE SYSTEM SHALL respect `prefers-reduced-motion` (no animation / no countdown motion).

---

## Requirement 10 — Guest screen: Already registered

**User story:** As a guest who already checked in, I want to be told so, with the option to update.

#### Acceptance criteria

1. WHEN a selected/confirmed record is already registered THEN THE SYSTEM SHALL show
   "You're already registered", the check-in time, and the wristband count.
2. THE SYSTEM SHALL provide "Next guest" and "Update my details" (which re-opens the confirm screen).

---

## Requirement 11 — Guest screen: New guest (walk-in) form

**User story:** As a guest not on the list, I want a short form to register.

#### Acceptance criteria

1. THE SYSTEM SHALL require Employee ID, Full name, Email, Mobile, each with inline validation.
2. THE SYSTEM SHALL offer optional marital status (single-select) and optional family members
   (chips that reflect the chosen marital status).
3. WHEN submitted THEN THE SYSTEM SHALL call `/api/walkin`, and on the duplicate-ID rejection SHALL show
   the "search instead" message on the Employee ID field.
4. WHEN a walk-in succeeds THEN THE SYSTEM SHALL show the Welcome screen.

---

## Requirement 12 — Admin authentication

**User story:** As desk staff, I want a protected admin area gated by a PIN.

#### Acceptance criteria

1. THE SYSTEM SHALL serve `/admin` behind a PIN screen; the PIN value comes from the `ADMIN_PIN`
   environment variable.
2. WHEN the correct PIN is entered THEN THE SYSTEM SHALL set a short-lived httpOnly session cookie
   valid for 8 hours.
3. THE SYSTEM SHALL rate-limit failed PIN attempts.
4. THE SYSTEM SHALL return 401 from all `/api/admin/*` routes when the session is missing/invalid.
5. THE SYSTEM SHALL show only a discreet "Staff sign-in" link in the footer of the guest screens (no
   other exposure of admin).
6. THE SYSTEM SHALL provide sign-out that clears the session.

---

## Requirement 13 — Admin dashboard

**User story:** As desk staff, I want a live overview and searchable list of everyone.

#### Acceptance criteria

1. THE SYSTEM SHALL show stat tiles: in master list, pre-registered, walk-ins, not yet arrived,
   wristbands issued, and ₹ to collect for paid extended.
2. THE SYSTEM SHALL show filter tabs: Registered / Pre-registered / Walk-ins / Not yet arrived / All,
   plus a text filter by ID or name.
3. THE SYSTEM SHALL show a sticky-header table with columns: Employee ID, Name, Email, Mobile, Marital,
   Family, Paid extended, Wristbands, Status, Time, Edited fields.
4. THE SYSTEM SHALL auto-refresh the data every 10 seconds.
5. THE SYSTEM SHALL provide "Download Excel" and "Sign out" buttons.
6. THE SYSTEM SHALL read all dashboard data from session-protected `/api/admin/*` endpoints.

---

## Requirement 14 — Excel export

**User story:** As desk staff, I want a well-formatted Excel workbook of the current state.

#### Acceptance criteria

1. THE SYSTEM SHALL expose `GET /api/admin/export.xlsx`, requiring a valid admin session (else 401).
2. THE SYSTEM SHALL build the workbook server-side with `exceljs` and three sheets:
   - **Registrations** — everyone with `status` `pre_registered` or `walk_in`.
   - **Not yet arrived** — master records with `status = not_registered`.
   - **Summary** — counts, wristbands issued, ₹ to collect, and an export timestamp.
3. THE SYSTEM SHALL use these columns on the first two sheets: Employee ID, Full Name, Email, Mobile,
   Marital Status, Family Members, Paid Extended Family, Wristbands (incl. self),
   Amount to Collect (INR), Status, Source, Registered At, Fields Edited at Desk.
4. THE SYSTEM SHALL format the sheets with a bold header row, frozen top row, auto-fit column widths,
   and SHALL store Employee ID and Mobile as text (not numbers).
5. THE SYSTEM SHALL name the file `Family_Day_2026_Registrations_YYYY-MM-DD_HHmm.xlsx`.

---

## Requirement 15 — Visual design

**User story:** As an attendee, I want a polished, on-brand, accessible kiosk experience.

#### Acceptance criteria

1. THE SYSTEM SHALL use background `#070516` with the poster (`/public/theme.png`) blurred at low
   opacity behind a dark veil.
2. THE SYSTEM SHALL use the accent gradient purple `#8B5CF6` → magenta `#D946EF` → cyan `#22D3EE`, and a
   gold `#F5B25B` highlight for paid items.
3. THE SYSTEM SHALL set headings in Josefin Sans (light, wide letter-spacing) and body in Manrope.
4. THE SYSTEM SHALL use glass cards with soft glow, touch targets ≥ 56px, tablet-first responsive layout,
   visible keyboard focus, and SHALL respect `prefers-reduced-motion`.
5. THE SYSTEM SHALL match the prototype's layout, screens, copy, and colours.

---

## Requirement 16 — Non-functional & delivery

**User story:** As the project owner, I want the app secure, documented, tested, and deployable.

#### Acceptance criteria

1. THE SYSTEM SHALL keep search under 200 ms for ~1,500 records and never expose full mobile/email in
   search results.
2. THE SYSTEM SHALL keep the CSV, database, and `.env` out of git (via `.gitignore`).
3. THE SYSTEM SHALL include a README covering setup, import, run, and deployment (Vercel + Supabase),
   plus a `.env.example` documenting `ADMIN_PIN` and `DATABASE_URL`.
4. THE SYSTEM SHALL include automated tests for:
   - the import mapping (Married/Single merge, de-duplication by latest `Completion time`, misaligned
     rows flagged `needs_review`, mobile normalisation, wristband recomputation);
   - the register API (validation, edited-fields tracking, idempotent `already_registered`);
   - the walk-in API (validation, duplicate-ID rejection);
   - the export (three sheets, correct counts, ID/Mobile stored as text).
5. THE SYSTEM SHALL be deployable to Vercel as a single app running against a hosted Supabase Postgres
   database, with local development running against a local Postgres instance; switching environments
   requires changing `DATABASE_URL` only (no schema or code changes).
