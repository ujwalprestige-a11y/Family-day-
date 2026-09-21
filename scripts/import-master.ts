/**
 * Import the Microsoft Forms master list into the database.
 *
 *   npm run import
 *
 * - Reads data/Prestige_Family_Day_2026_Sheet1_.csv decoded as latin1/CP1252
 *   (win1252) so the corrupted ₹ symbol and other high-bytes are handled.
 * - Merges the separate "Married" / "Single" answer columns (see lib/mapping).
 * - Keeps EVERY row (no de-duplication). The same employee_id may appear on
 *   several rows; staff pick the correct one at the desk.
 * - Idempotent by the Forms response "Id" (form_id): re-running upserts the same
 *   rows instead of creating duplicates, and never touches walk-ins or anyone
 *   who has already checked in.
 * - Prints an import report.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import { PrismaClient, Status } from "@prisma/client";
import { mapRow, type RawRow, type CanonicalRecord } from "../lib/mapping";

const CSV_PATH = path.resolve(process.cwd(), "data/Prestige_Family_Day_2026_Sheet1_.csv");

const prisma = new PrismaClient();

async function main() {
  const started = Date.now();

  // 1. Read + decode as CP1252 (win1252).
  const buffer = readFileSync(CSV_PATH);
  const text = iconv.decode(buffer, "win1252");

  // 2. Parse with headers.
  const rows = parse(text, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: false,
  }) as RawRow[];

  const rowsRead = rows.length;

  // 3. Map each row → canonical record (NO de-duplication).
  const mapped: CanonicalRecord[] = rows.map(mapRow);

  const uniqueIds = new Set(mapped.filter((r) => r.employee_id).map((r) => r.employee_id)).size;
  const flagged = mapped.filter((r) => r.needs_review).length;

  // Preserve any row that has already checked in (or is a walk-in): load the
  // current status for every existing form_id so re-imports don't reset it.
  const existing = await prisma.employee.findMany({
    where: { form_id: { not: null } },
    select: { form_id: true, status: true },
  });
  const existingStatus = new Map(existing.map((e) => [e.form_id!, e.status]));

  let imported = 0;
  let preserved = 0;
  let missingFormId = 0;

  for (const rec of mapped) {
    const masterFields = {
      employee_id: rec.employee_id,
      full_name: rec.full_name,
      email: rec.email,
      mobile: rec.mobile,
      marital_status: rec.marital_status,
      family_members: rec.family_members,
      paid_extended: rec.paid_extended,
      wristbands_total: rec.wristbands_total,
      needs_review: rec.needs_review,
      source: "master" as const,
    };

    if (!rec.form_id) {
      // No stable key — just insert it so the row is not lost.
      missingFormId++;
      await prisma.employee.create({
        data: { ...masterFields, status: Status.not_registered },
      });
      imported++;
      continue;
    }

    const prior = existingStatus.get(rec.form_id);
    if (prior && prior !== Status.not_registered) {
      preserved++;
      continue;
    }

    await prisma.employee.upsert({
      where: { form_id: rec.form_id },
      create: { form_id: rec.form_id, ...masterFields, status: Status.not_registered },
      update: { ...masterFields },
    });
    imported++;
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log("Prestige Family Day 2026 — import report");
  console.log(`  Rows read:            ${rowsRead}`);
  console.log(`  Rows imported:        ${imported}`);
  console.log(`  Unique employee IDs:  ${uniqueIds}`);
  console.log(`  Rows flagged review:  ${flagged}`);
  if (missingFormId > 0) console.log(`  Rows without form Id: ${missingFormId}`);
  if (preserved > 0) {
    console.log(`  Preserved (checked in / walk-in, left untouched): ${preserved}`);
  }
  console.log(`Done in ${seconds}s`);
}

main()
  .catch((err) => {
    console.error("Import failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
