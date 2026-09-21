/**
 * Server-side Excel workbook builder (exceljs). Shared by the export route and
 * the export tests.
 */
import ExcelJS from "exceljs";
import { PRICE_PER_PAID } from "./wristbands";

// The subset of Employee fields the export needs.
export interface ExportEmployee {
  employee_id: string;
  full_name: string;
  email: string;
  mobile: string;
  marital_status: string;
  family_members: string[];
  paid_extended: string[];
  wristbands_total: number;
  status: "not_registered" | "pre_registered" | "walk_in";
  source: "master" | "walk_in";
  edited_fields: unknown;
  registered_at: Date | string | null;
}

const COLUMNS = [
  "Employee ID",
  "Full Name",
  "Email",
  "Mobile",
  "Marital Status",
  "Family Members",
  "Paid Extended Family",
  "Wristbands (incl. self)",
  "Amount to Collect (INR)",
  "Status",
  "Source",
  "Registered At",
  "Fields Edited at Desk",
];

// Column indexes (1-based) that must be stored as text.
const TEXT_COLUMNS = [1, 4]; // Employee ID, Mobile

export function statusLabel(status: ExportEmployee["status"]): string {
  return status === "pre_registered"
    ? "Pre-registered"
    : status === "walk_in"
      ? "Walk-in"
      : "Not yet arrived";
}

export function sourceLabel(source: ExportEmployee["source"]): string {
  return source === "walk_in" ? "Walk-in form" : "Master list";
}

function editedList(edited: unknown): string {
  if (Array.isArray(edited)) return edited.join("; ");
  return "";
}

function formatRegisteredAt(value: Date | string | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN");
}

function rowFor(e: ExportEmployee): (string | number)[] {
  return [
    e.employee_id,
    e.full_name,
    e.email,
    e.mobile,
    e.marital_status,
    e.family_members.join("; "),
    e.paid_extended.join("; "),
    e.wristbands_total,
    e.paid_extended.length * PRICE_PER_PAID,
    statusLabel(e.status),
    sourceLabel(e.source),
    formatRegisteredAt(e.registered_at),
    editedList(e.edited_fields),
  ];
}

function addDataSheet(wb: ExcelJS.Workbook, name: string, rows: ExportEmployee[]) {
  const ws = wb.addWorksheet(name);
  ws.addRow(COLUMNS);

  for (const e of rows) ws.addRow(rowFor(e));

  // Bold header + frozen top row.
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Store Employee ID and Mobile as text.
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
  preRegistered: number;
  walkIns: number;
  notYetArrived: number;
  wristbandsIssued: number;
  amountToCollect: number;
}

export function computeSummary(all: ExportEmployee[]): SummaryCounts {
  const registered = all.filter((e) => e.status !== "not_registered");
  return {
    inMaster: all.filter((e) => e.source === "master").length,
    preRegistered: all.filter((e) => e.status === "pre_registered").length,
    walkIns: all.filter((e) => e.status === "walk_in").length,
    notYetArrived: all.filter((e) => e.source === "master" && e.status === "not_registered").length,
    wristbandsIssued: registered.reduce((a, e) => a + e.wristbands_total, 0),
    amountToCollect: registered.reduce((a, e) => a + e.paid_extended.length * PRICE_PER_PAID, 0),
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

  const registrations = all.filter(
    (e) => e.status === "pre_registered" || e.status === "walk_in"
  );
  const notArrived = all.filter((e) => e.status === "not_registered");

  addDataSheet(wb, "Registrations", registrations);
  addDataSheet(wb, "Not yet arrived", notArrived);

  // Summary sheet.
  const s = computeSummary(all);
  const summary = wb.addWorksheet("Summary");
  summary.addRow(["Prestige Family Day 2026 – Registration Summary"]);
  summary.addRow(["Exported", new Date().toLocaleString("en-IN")]);
  summary.addRow([]);
  summary.addRow(["In master list", s.inMaster]);
  summary.addRow(["Pre-registered", s.preRegistered]);
  summary.addRow(["Walk-ins", s.walkIns]);
  summary.addRow(["Not yet arrived", s.notYetArrived]);
  summary.addRow(["Wristbands issued", s.wristbandsIssued]);
  summary.addRow(["Paid extended to collect (INR)", s.amountToCollect]);
  summary.getRow(1).font = { bold: true, size: 14 };
  summary.getColumn(1).width = 34;
  summary.getColumn(2).width = 22;

  return wb;
}
