/**
 * Server-side Excel workbook builder (exceljs). Shared by the export route and
 * the export tests.
 */
import ExcelJS from "exceljs";
import { exceedsAllotment } from "./allotment";

// The subset of Employee fields the export needs.
export interface ExportEmployee {
  employee_id: string;
  full_name: string;
  entity: string;
  department: string;
  allotted_adults: number;
  allotted_children: number;
  actual_adults: number;
  actual_children: number;
  status: "not_arrived" | "checked_in";
  source: "master" | "walk_in";
  registered_at: Date | string | null;
  needs_review: boolean;
}

const COLUMNS = [
  "Employee ID",
  "Full Name",
  "Entity",
  "Department",
  "Allotted Adults",
  "Allotted Children",
  "Allotted Total",
  "Actual Adults",
  "Actual Children",
  "Actual Total",
  "Difference",
  "Over Allotment",
  "Status",
  "Source",
  "Checked In At",
  "Needs Review",
];

// Column indexes (1-based) that must be stored as text so Excel does not strip
// leading zeros or reformat them.
const TEXT_COLUMNS = [1];

export function statusLabel(status: ExportEmployee["status"]): string {
  return status === "checked_in" ? "Checked in" : "Not yet arrived";
}

export function sourceLabel(source: ExportEmployee["source"]): string {
  return source === "walk_in" ? "Walk-in (added at desk)" : "Master list";
}

function formatCheckedInAt(value: Date | string | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN");
}

export function allottedTotal(e: ExportEmployee): number {
  return e.allotted_adults + e.allotted_children;
}

export function actualTotal(e: ExportEmployee): number {
  return e.actual_adults + e.actual_children;
}

function rowFor(e: ExportEmployee): (string | number)[] {
  const allotted = allottedTotal(e);
  const actual = actualTotal(e);
  const over = exceedsAllotment(
    { adults: e.actual_adults, children: e.actual_children },
    { adults: e.allotted_adults, children: e.allotted_children }
  );
  return [
    e.employee_id,
    e.full_name,
    e.entity,
    e.department,
    e.allotted_adults,
    e.allotted_children,
    allotted,
    e.actual_adults,
    e.actual_children,
    actual,
    // Only meaningful once they have arrived; blank keeps the column clean.
    e.status === "checked_in" ? actual - allotted : "",
    over ? "YES" : "",
    statusLabel(e.status),
    sourceLabel(e.source),
    formatCheckedInAt(e.registered_at),
    e.needs_review ? "YES" : "",
  ];
}

function addDataSheet(wb: ExcelJS.Workbook, name: string, rows: ExportEmployee[]) {
  const ws = wb.addWorksheet(name);
  ws.addRow(COLUMNS);

  for (const e of rows) ws.addRow(rowFor(e));

  // Bold header + frozen top row.
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Store Employee ID as text.
  for (const col of TEXT_COLUMNS) {
    ws.getColumn(col).numFmt = "@";
    ws.getColumn(col).eachCell((cell) => {
      if (cell.value != null) cell.value = String(cell.value);
    });
  }

  // Auto-fit widths from the longest cell in each column.
  ws.columns.forEach((column) => {
    let max = 10;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const len = cell.value == null ? 0 : String(cell.value).length;
      if (len > max) max = len;
    });
    column.width = Math.min(max + 2, 60);
  });

  return ws;
}

export interface SummaryCounts {
  inMaster: number;
  checkedIn: number;
  walkIns: number;
  notYetArrived: number;
  allottedAdults: number;
  allottedChildren: number;
  allottedTotal: number;
  actualAdults: number;
  actualChildren: number;
  actualTotal: number;
  overAllotment: number;
}

export function computeSummary(all: ExportEmployee[]): SummaryCounts {
  const checkedIn = all.filter((e) => e.status === "checked_in");
  return {
    inMaster: all.filter((e) => e.source === "master").length,
    checkedIn: checkedIn.length,
    walkIns: all.filter((e) => e.source === "walk_in").length,
    notYetArrived: all.filter((e) => e.source === "master" && e.status === "not_arrived").length,

    // Allotment is planned for everyone in the list, arrived or not.
    allottedAdults: all.reduce((a, e) => a + e.allotted_adults, 0),
    allottedChildren: all.reduce((a, e) => a + e.allotted_children, 0),
    allottedTotal: all.reduce((a, e) => a + allottedTotal(e), 0),

    // Actuals only exist for people who checked in.
    actualAdults: checkedIn.reduce((a, e) => a + e.actual_adults, 0),
    actualChildren: checkedIn.reduce((a, e) => a + e.actual_children, 0),
    actualTotal: checkedIn.reduce((a, e) => a + actualTotal(e), 0),

    overAllotment: checkedIn.filter((e) =>
      exceedsAllotment(
        { adults: e.actual_adults, children: e.actual_children },
        { adults: e.allotted_adults, children: e.allotted_children }
      )
    ).length,
  };
}

export function exportFilename(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(
    now.getHours()
  )}${p(now.getMinutes())}`;
  return `Family_Day_2026_Registrations_${stamp}.xlsx`;
}

/** Build the three-sheet workbook. */
export async function buildWorkbook(all: ExportEmployee[]): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Prestige Family Day 2026 Registration Desk";
  wb.created = new Date();

  const checkedIn = all.filter((e) => e.status === "checked_in");
  const notArrived = all.filter((e) => e.status === "not_arrived");

  addDataSheet(wb, "Checked in", checkedIn);
  addDataSheet(wb, "Not yet arrived", notArrived);

  // Summary sheet.
  const s = computeSummary(all);
  const summary = wb.addWorksheet("Summary");
  summary.addRow(["Prestige Family Day 2026 – Registration Summary"]);
  summary.addRow(["Exported", new Date().toLocaleString("en-IN")]);
  summary.addRow([]);
  summary.addRow(["In master list", s.inMaster]);
  summary.addRow(["Checked in", s.checkedIn]);
  summary.addRow(["Not yet arrived", s.notYetArrived]);
  summary.addRow(["Walk-ins added at desk", s.walkIns]);
  summary.addRow([]);
  summary.addRow(["Allotted adults", s.allottedAdults]);
  summary.addRow(["Allotted children", s.allottedChildren]);
  summary.addRow(["Allotted total", s.allottedTotal]);
  summary.addRow([]);
  summary.addRow(["Actual adults issued", s.actualAdults]);
  summary.addRow(["Actual children issued", s.actualChildren]);
  summary.addRow(["Actual total issued", s.actualTotal]);
  summary.addRow([]);
  summary.addRow(["Checked in over their allotment", s.overAllotment]);
  summary.getRow(1).font = { bold: true, size: 14 };
  summary.getColumn(1).width = 34;
  summary.getColumn(2).width = 22;

  return wb;
}
