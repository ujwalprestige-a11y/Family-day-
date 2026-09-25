-- Allotment model.
--
-- The master list moved from a Microsoft Forms export (named relations, email,
-- mobile, marital status, free vs paid wristbands) to an allotment sheet:
-- each employee is allotted N adult and M child wristbands, and the desk
-- records how many actually turned up.
--
-- DESTRUCTIVE: every column carrying Forms-era data is dropped, and the whole
-- table is emptied. This is intentional — the new sheet is the source of truth
-- and is re-imported by `npm run import` immediately after this migration.
-- Export the current data first if you need a record of it.

-- 1. Drop the old table outright. Recreating is far cleaner than mutating two
--    enums from three values down to two while columns still depend on them.
DROP TABLE IF EXISTS "Employee";

DROP TYPE IF EXISTS "Status";
DROP TYPE IF EXISTS "Source";

-- 2. Recreate the enums with the new, orthogonal meanings.
--    Status  = has this person turned up yet?
--    Source  = did this row come from the sheet, or was it created at the desk?
CREATE TYPE "Status" AS ENUM ('not_arrived', 'checked_in');
CREATE TYPE "Source" AS ENUM ('master', 'walk_in');

-- 3. Recreate the table.
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "entity" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT '',
    "allotted_adults" INTEGER NOT NULL DEFAULT 0,
    "allotted_children" INTEGER NOT NULL DEFAULT 0,
    "actual_adults" INTEGER NOT NULL DEFAULT 0,
    "actual_children" INTEGER NOT NULL DEFAULT 0,
    "status" "Status" NOT NULL DEFAULT 'not_arrived',
    "source" "Source" NOT NULL DEFAULT 'master',
    "registered_at" TIMESTAMP(3),
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- 4. Search indexes: prefix match on employee_id, contains match on full_name.
CREATE INDEX "Employee_employee_id_idx" ON "Employee"("employee_id");
CREATE INDEX "Employee_full_name_idx" ON "Employee"("full_name");
