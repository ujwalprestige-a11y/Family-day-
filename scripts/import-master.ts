/**
 * Import the master allotment list from an Excel workbook.
 *
 *   npm run import                          # data/Updated List.xlsx
 *   npm run import -- "path/to/other.xlsx"
 *   npm run import -- --force               # proceed even if people checked in
 *   npm run import -- --dry-run             # parse + report, write nothing
 *
 * This REPLACES every row in the Employee table. Because the sheet is now the
 * single source of truth there is no merge path: a re-import is a full reset.
 * If anyone has already checked in, the script refuses to run without --force
 * so an accidental re-run mid-event cannot erase the day's work.
 */
import path from "node:path";
import ExcelJS from "exceljs";
import { PrismaClient, Status, Source } from "@prisma/client";
import {
  AllotmentRecord,
  RawSheetRow,
  canonicaliseEntities,
  cellText,
  mapRow,
} from "../lib/mapping";

const prisma = new PrismaClient();

const DEFAULT_FILE = path.join("data", "Updated List.xlsx");

/** Header labels we need, normalised for lookup. */
const REQUIRED_HEADERS = ["EMP ID", "EMP NAME", "COUNT", "CHILDREN"] as const;
const OPTIONAL_HEADERS = ["ENTITY", "DEPARTMENT"] as const;

function normaliseHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim().toUpperCase();
}

interface Args {
  file: string;
  force: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const rest = argv.slice(2);
  const flags = rest.filter((a) => a.startsWith("--"));
  const positional = rest.filter((a) => !a.startsWith("--"));
  return {
    file: positional[0] ?? DEFAULT_FILE,
    force: flags.includes("--force"),
    dryRun: flags.includes("--dry-run"),
  };
}

/**
 * Locate the header row and map each required label to its column index.
 * Scans the first few rows rather than assuming row 1, so a title row above the
 * headers would not break the import.
 */
function findHeaders(ws: ExcelJS.Worksheet): { headerRow: number; cols: Map<string, number> } {
  const maxScan = Math.min(10, ws.rowCount);

  for (let r = 1; r <= maxScan; r++) {
    const row = ws.getRow(r);
    const found = new Map<string, number>();

    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const label = normaliseHeader(cellText(cell.value));
      if (label) found.set(label, col);
    });

    const hasAll = REQUIRED_HEADERS.every((h) => found.has(h));
    if (hasAll) return { headerRow: r, cols: found };
  }

  throw new Error(
    `Could not find a header row containing ${REQUIRED_HEADERS.join(", ")} in the first ${maxScan} rows. ` +
      `Check the sheet layout.`
  );
}

async function readSheet(file: string): Promise<{ sheet: string; records: AllotmentRecord[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`No worksheets found in ${file}`);

  const { headerRow, cols } = findHeaders(ws);

  const col = (label: string): number | undefined => cols.get(label);
  const cEmpId = col("EMP ID")!;
  const cName = col("EMP NAME")!;
  const cCount = col("COUNT")!;
  const cChildren = col("CHILDREN")!;
  const cEntity = col("ENTITY");
  const cDept = col("DEPARTMENT");

  for (const h of OPTIONAL_HEADERS) {
    if (!cols.has(h)) console.warn(`  ! Column "${h}" not found — importing it as blank.`);
  }

  const records: AllotmentRecord[] = [];

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);

    const raw: RawSheetRow = {
      emp_id: row.getCell(cEmpId).value,
      emp_name: row.getCell(cName).value,
      count: row.getCell(cCount).value,
      children: row.getCell(cChildren).value,
      entity: cEntity ? row.getCell(cEntity).value : "",
      department: cDept ? row.getCell(cDept).value : "",
    };

    // Skip rows that are entirely blank in the identifying columns.
    if (cellText(raw.emp_id) === "" && cellText(raw.emp_name) === "") continue;

    records.push(mapRow(raw));
  }

  return { sheet: ws.name, records };
}

function report(sheet: string, records: AllotmentRecord[], changes: ReturnType<typeof canonicaliseEntities>["changes"]) {
  const allottedAdults = records.reduce((a, r) => a + r.allotted_adults, 0);
  const allottedChildren = records.reduce((a, r) => a + r.allotted_children, 0);
  const flagged = records.filter((r) => r.needs_review);

  console.log(`\nSheet:                 "${sheet}"`);
  console.log(`Rows parsed:           ${records.length}`);
  console.log(`Unique employee IDs:   ${new Set(records.map((r) => r.employee_id)).size}`);
  console.log(`Allotted adults:       ${allottedAdults}`);
  console.log(`Allotted children:     ${allottedChildren}`);
  console.log(`Allotted total:        ${allottedAdults + allottedChildren}`);
  console.log(`Flagged for review:    ${flagged.length}`);

  // Duplicate IDs would make the desk ambiguous, so call them out explicitly.
  const seen = new Map<string, number>();
  for (const r of records) seen.set(r.employee_id, (seen.get(r.employee_id) ?? 0) + 1);
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  if (dupes.length > 0) {
    console.log(`\nDuplicate employee IDs: ${dupes.length}`);
    for (const [id, n] of dupes.slice(0, 20)) {
      const names = records.filter((r) => r.employee_id === id).map((r) => r.full_name);
      console.log(`  ${id} x${n}: ${names.join(" | ")}`);
    }
  }

  if (changes.length > 0) {
    console.log(`\nEntity spellings normalised:`);
    for (const c of changes) {
      console.log(`  ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)} (${c.rows} row${c.rows === 1 ? "" : "s"})`);
    }
  }

  if (flagged.length > 0) {
    // Group the reasons so the output stays readable at ~90 flagged rows.
    const byReason = new Map<string, number>();
    for (const r of flagged) {
      for (const reason of r.review_reasons) {
        byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
      }
    }
    console.log(`\nReview reasons:`);
    for (const [reason, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${reason}`);
    }

    const nonNumeric = flagged.filter((r) => !/^\d+$/.test(r.employee_id));
    if (nonNumeric.length > 0) {
      console.log(`\nNon-numeric employee IDs (cannot be found by ID search):`);
      for (const r of nonNumeric) {
        console.log(`  ${JSON.stringify(r.employee_id)}  ${r.full_name}`);
      }
    }
  }
}

async function main() {
  const { file, force, dryRun } = parseArgs(process.argv);

  console.log(`Reading ${file} ...`);
  const { sheet, records: parsed } = await readSheet(file);

  const { records, changes } = canonicaliseEntities(parsed);
  report(sheet, records, changes);

  if (records.length === 0) {
    console.error("\nNothing to import — no data rows found. Aborting.");
    process.exitCode = 1;
    return;
  }

  // Safety gate: never silently discard check-ins.
  const existing = await prisma.employee.count();
  const checkedIn = await prisma.employee.count({ where: { status: Status.checked_in } });

  console.log(`\nCurrently in the database: ${existing} row(s), ${checkedIn} checked in.`);

  if (dryRun) {
    console.log("\n--dry-run given: nothing was written.");
    return;
  }

  if (checkedIn > 0 && !force) {
    console.error(
      `\nREFUSING TO IMPORT: ${checkedIn} employee(s) have already checked in and a full ` +
        `re-import would erase that.\n` +
        `Export the current data first (/api/admin/export.xlsx), then re-run with --force ` +
        `if you are certain.`
    );
    process.exitCode = 1;
    return;
  }

  // Replace everything in one transaction so a failure cannot leave the desk
  // with a half-loaded list.
  const rows = records.map((r) => ({
    employee_id: r.employee_id,
    full_name: r.full_name,
    entity: r.entity,
    department: r.department,
    allotted_adults: r.allotted_adults,
    allotted_children: r.allotted_children,
    actual_adults: 0,
    actual_children: 0,
    status: Status.not_arrived,
    source: Source.master,
    needs_review: r.needs_review,
  }));

  const written = await prisma.$transaction(async (tx) => {
    const removed = await tx.employee.deleteMany({});
    console.log(`\nDeleted ${removed.count} existing row(s).`);

    let total = 0;
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const res = await tx.employee.createMany({ data: chunk });
      total += res.count;
      console.log(`  inserted ${total}/${rows.length}`);
    }
    return total;
  });

  const after = await prisma.employee.count();
  console.log(`\nImported ${written} row(s). Table now holds ${after}.`);

  if (after !== records.length) {
    console.error(
      `WARNING: expected ${records.length} rows but the table holds ${after}. Investigate before the event.`
    );
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("\nImport failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
