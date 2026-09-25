/**
 * Generate a standalone SQL script that loads the master allotment list.
 *
 *   npm run gen:sql                          # reads data/Updated List.xlsx
 *   npm run gen:sql -- "other.xlsx" "out.sql"
 *
 * The output is meant to be pasted into the Supabase SQL editor AFTER the
 * Prisma migration has created the table. It goes through exactly the same
 * mapping code as `npm run import`, so the two produce identical data.
 *
 * Why this exists: running the importer against production means juggling
 * DATABASE_URL, and getting that wrong silently writes to the wrong database.
 * A SQL script has no such ambiguity — you can see which database you are
 * connected to in the Supabase UI.
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  AllotmentRecord,
  RawSheetRow,
  canonicaliseEntities,
  cellText,
  mapRow,
} from "../lib/mapping";

const DEFAULT_IN = path.join("data", "Updated List.xlsx");
const DEFAULT_OUT = path.join("data", "supabase-load-master-list.sql");

/** Rows per INSERT statement. Keeps each statement a sane size to paste. */
const CHUNK = 200;

/** Escape a string for a single-quoted SQL literal. */
function sql(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

const REQUIRED = ["EMP ID", "EMP NAME", "COUNT", "CHILDREN"] as const;

function normaliseHeader(v: string): string {
  return v.replace(/\s+/g, " ").trim().toUpperCase();
}

function findHeaders(ws: ExcelJS.Worksheet) {
  const maxScan = Math.min(10, ws.rowCount);
  for (let r = 1; r <= maxScan; r++) {
    const found = new Map<string, number>();
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const label = normaliseHeader(cellText(cell.value));
      if (label) found.set(label, col);
    });
    if (REQUIRED.every((h) => found.has(h))) return { headerRow: r, cols: found };
  }
  throw new Error(`Could not find a header row with ${REQUIRED.join(", ")}.`);
}

async function read(file: string): Promise<{ sheet: string; records: AllotmentRecord[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`No worksheets in ${file}`);

  const { headerRow, cols } = findHeaders(ws);
  const c = (k: string) => cols.get(k);

  const records: AllotmentRecord[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const raw: RawSheetRow = {
      emp_id: row.getCell(c("EMP ID")!).value,
      emp_name: row.getCell(c("EMP NAME")!).value,
      count: row.getCell(c("COUNT")!).value,
      children: row.getCell(c("CHILDREN")!).value,
      entity: c("ENTITY") ? row.getCell(c("ENTITY")!).value : "",
      department: c("DEPARTMENT") ? row.getCell(c("DEPARTMENT")!).value : "",
    };
    if (cellText(raw.emp_id) === "" && cellText(raw.emp_name) === "") continue;
    records.push(mapRow(raw));
  }
  return { sheet: ws.name, records };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const inFile = args[0] ?? DEFAULT_IN;
  const outFile = args[1] ?? DEFAULT_OUT;

  const { sheet, records: parsed } = await read(inFile);
  const { records, changes } = canonicaliseEntities(parsed);

  const adults = records.reduce((a, r) => a + r.allotted_adults, 0);
  const children = records.reduce((a, r) => a + r.allotted_children, 0);
  const flagged = records.filter((r) => r.needs_review).length;

  const out: string[] = [];

  out.push(`-- Prestige Family Day 2026 — load the master allotment list`);
  out.push(`--`);
  out.push(`-- Generated from: ${path.basename(inFile)}  (sheet "${sheet}")`);
  out.push(`-- Generated at:   ${new Date().toISOString()}`);
  out.push(`--`);
  out.push(`-- Rows:              ${records.length}`);
  out.push(`-- Allotted adults:   ${adults}`);
  out.push(`-- Allotted children: ${children}`);
  out.push(`-- Allotted total:    ${adults + children}`);
  out.push(`-- Flagged review:    ${flagged}`);
  if (changes.length > 0) {
    out.push(`--`);
    out.push(`-- Entity spellings normalised:`);
    for (const c of changes) out.push(`--   "${c.from}" -> "${c.to}" (${c.rows} rows)`);
  }
  out.push(`--`);
  out.push(`-- HOW TO RUN`);
  out.push(`--   1. Merge the code first. The Vercel build runs \`prisma migrate deploy\`,`);
  out.push(`--      which creates the table this script fills. Running this before the`);
  out.push(`--      migration will fail with "relation \\"Employee\\" does not exist".`);
  out.push(`--   2. Paste the whole file into the Supabase SQL editor and run it.`);
  out.push(`--   3. Check the verification result at the bottom.`);
  out.push(`--`);
  out.push(`-- This REPLACES every row in "Employee". It runs in one transaction, so it`);
  out.push(`-- either fully succeeds or changes nothing. It refuses to run if anyone has`);
  out.push(`-- already checked in.`);
  out.push(``);
  out.push(`BEGIN;`);
  out.push(``);
  out.push(`-- Guard: never silently erase a day's check-ins. Mirrors the importer's`);
  out.push(`-- --force gate. To override deliberately, delete this block.`);
  out.push(`DO $$`);
  out.push(`DECLARE n integer;`);
  out.push(`BEGIN`);
  out.push(`  SELECT count(*) INTO n FROM "Employee" WHERE status = 'checked_in';`);
  out.push(`  IF n > 0 THEN`);
  out.push(`    RAISE EXCEPTION`);
  out.push(`      'Aborting: % employee(s) have already checked in. Export the data first, then remove this guard block if you really mean to replace the list.', n;`);
  out.push(`  END IF;`);
  out.push(`END $$;`);
  out.push(``);
  out.push(`-- Out with the old.`);
  out.push(`DELETE FROM "Employee";`);
  out.push(``);

  const columns =
    `("id", "employee_id", "full_name", "entity", "department", ` +
    `"allotted_adults", "allotted_children", "needs_review", "updated_at")`;

  out.push(`-- In with the new. ${records.length} rows in ${Math.ceil(records.length / CHUNK)} statements.`);
  out.push(`-- "id" and "updated_at" have no database default (Prisma normally supplies`);
  out.push(`-- them), so they are generated here. Everything else uses column defaults:`);
  out.push(`-- actual_adults/actual_children 0, status not_arrived, source master.`);
  out.push(``);

  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    out.push(`INSERT INTO "Employee" ${columns} VALUES`);
    const values = chunk.map((r) => {
      return (
        `  (gen_random_uuid()::text, ${sql(r.employee_id)}, ${sql(r.full_name)}, ` +
        `${sql(r.entity)}, ${sql(r.department)}, ${r.allotted_adults}, ` +
        `${r.allotted_children}, ${r.needs_review}, NOW())`
      );
    });
    out.push(values.join(",\n") + ";");
    out.push(``);
  }

  out.push(`COMMIT;`);
  out.push(``);
  out.push(`-- Verification. Expect exactly:`);
  out.push(`--   rows = ${records.length}`);
  out.push(`--   allotted_adults = ${adults}, allotted_children = ${children}, allotted_total = ${adults + children}`);
  out.push(`--   needs_review = ${flagged}, checked_in = 0`);
  out.push(`SELECT`);
  out.push(`  count(*)                                   AS rows,`);
  out.push(`  sum(allotted_adults)                       AS allotted_adults,`);
  out.push(`  sum(allotted_children)                     AS allotted_children,`);
  out.push(`  sum(allotted_adults + allotted_children)   AS allotted_total,`);
  out.push(`  count(*) FILTER (WHERE needs_review)       AS needs_review,`);
  out.push(`  count(*) FILTER (WHERE status='checked_in') AS checked_in`);
  out.push(`FROM "Employee";`);
  out.push(``);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, out.join("\n"), "utf8");

  const bytes = fs.statSync(outFile).size;
  console.log(`Wrote ${outFile}`);
  console.log(`  ${records.length} rows, ${Math.ceil(records.length / CHUNK)} INSERT statements`);
  console.log(`  allotted ${adults} adults + ${children} children = ${adults + children}`);
  console.log(`  flagged for review: ${flagged}`);
  console.log(`  size: ${(bytes / 1024).toFixed(0)} KB`);

  // Quoting mistakes are the main risk in generated SQL, so surface the rows
  // that exercise the escaping.
  const quoted = records.filter((r) => r.full_name.includes("'") || r.entity.includes("'"));
  console.log(`  names containing an apostrophe (escaped): ${quoted.length}`);
  for (const r of quoted.slice(0, 10)) console.log(`    ${r.employee_id}  ${r.full_name}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
