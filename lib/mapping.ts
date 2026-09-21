/**
 * CSV → canonical record mapping for the Microsoft Forms export.
 *
 * Pure functions, no DB — shared by scripts/import-master.ts and the tests.
 * The Forms export keeps "Married" and "Single" answers in separate columns;
 * we merge them into one clean record and recompute wristband totals.
 */
import { isValidEmail, isNonEmptyName, isValidMobile, normaliseMobile } from "./validation";
import { wristbandTotal } from "./wristbands";

/** A raw CSV row as produced by csv-parse with { columns: true }. */
export type RawRow = Record<string, string>;

export interface CanonicalRecord {
  /** Microsoft Forms response "Id" — unique per submission, used for idempotent import. */
  form_id: string;
  employee_id: string;
  full_name: string;
  email: string;
  mobile: string;
  marital_status: string;
  family_members: string[];
  paid_extended: string[];
  wristbands_total: number;
  needs_review: boolean;
  /** Kept only for de-duplication helpers/tests (not persisted). */
  completion_time: Date | null;
}

export interface DedupeResult {
  deduped: Array<CanonicalRecord & { duplicate_of: Array<{ employee_id: string; full_name: string }> }>;
  duplicatesDropped: number;
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Split a ";"-separated list: trim entries, drop empties, de-dupe. */
export function splitList(value: string | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(";")) {
    const t = part.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** First trimmed non-empty string among the arguments (or ""). */
export function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    const t = (v ?? "").trim();
    if (t) return t;
  }
  return "";
}

/**
 * Resolve a raw row into a header-agnostic accessor. Headers are matched by
 * normalised name (trim + collapse whitespace + lowercase) so slight header
 * changes / trailing spaces don't break the import.
 */
function accessor(row: RawRow) {
  const map = new Map<string, string>();
  for (const [key, val] of Object.entries(row)) {
    map.set(norm(key), typeof val === "string" ? val : String(val ?? ""));
  }
  const exact = (header: string) => map.get(norm(header)) ?? "";
  const byPrefix = (prefix: string): string[] => {
    const p = norm(prefix);
    const found: string[] = [];
    for (const [k, v] of map.entries()) {
      if (k.startsWith(p)) found.push(v);
    }
    return found;
  };
  return { exact, byPrefix };
}

/** Parse the Forms "M/D/YYYY H:mm" completion timestamp. Returns null if unparseable. */
export function parseCompletionTime(value: string | null | undefined): Date | null {
  const t = (value ?? "").trim();
  if (!t) return null;
  // e.g. "8/13/2026 11:30"
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, mm, dd, yyyy, hh, min, ss] = m;
    const d = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      ss ? Number(ss) : 0
    );
    return isNaN(d.getTime()) ? null : d;
  }
  const fallback = new Date(t);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/* -------------------------------------------------------------------------- */
/* Row mapping                                                                */
/* -------------------------------------------------------------------------- */

export function mapRow(row: RawRow): CanonicalRecord {
  const { exact, byPrefix } = accessor(row);

  const form_id = exact("Id").trim();
  const employee_id = exact("Employee ID").trim();
  const full_name = firstNonEmpty(exact("Full Name"), exact("Name"));
  const marital_status = exact("Marital Status").trim();

  // email: Employee Email ID (Married) > Email Address (Single) > Email
  const email = firstNonEmpty(
    exact("Employee Email ID"),
    exact("Email Address"),
    exact("Email")
  );

  // mobile: Contact Number (Married) > Contact Number1 (Single), normalised
  const rawMobile = firstNonEmpty(exact("Contact Number"), exact("Contact Number1"));
  const mobile = normaliseMobile(rawMobile);

  // family: Married Team Members… if populated, else Single Team Members…
  const marriedFamily = splitList(byPrefix("Married Team Members").find((v) => v.trim()) ?? "");
  const singleFamily = splitList(byPrefix("Single Team Members").find((v) => v.trim()) ?? "");
  const family_members = marriedFamily.length > 0 ? marriedFamily : singleFamily;

  // paid extended: union of the two "Paid Wristband – Extended Family…" columns
  const paidCols = byPrefix("Paid Wristband");
  const paidSet: string[] = [];
  const seenPaid = new Set<string>();
  for (const col of paidCols) {
    for (const item of splitList(col)) {
      if (!seenPaid.has(item)) {
        seenPaid.add(item);
        paidSet.push(item);
      }
    }
  }
  const paid_extended = paidSet;

  const wristbands_total = wristbandTotal(family_members, paid_extended);

  const needs_review =
    !/^\d+$/.test(employee_id) ||
    !isNonEmptyName(full_name) ||
    !isValidEmail(email) ||
    !isValidMobile(mobile);

  return {
    form_id,
    employee_id,
    full_name,
    email,
    mobile,
    marital_status,
    family_members,
    paid_extended,
    wristbands_total,
    needs_review,
    completion_time: parseCompletionTime(exact("Completion time")),
  };
}

/* -------------------------------------------------------------------------- */
/* De-duplication                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Collapse rows sharing the same non-empty employee_id, keeping the most recent
 * submission by completion_time. Alternate submissions are recorded in
 * `duplicate_of`. Rows with an empty employee_id are never grouped (each is a
 * distinct person that failed to supply an ID) — they are kept individually.
 */
export function dedupeByEmployeeId(records: CanonicalRecord[]): DedupeResult {
  const groups = new Map<string, CanonicalRecord[]>();

  records.forEach((rec, index) => {
    const key = rec.employee_id ? `id:${rec.employee_id}` : `row:${index}`;
    const arr = groups.get(key);
    if (arr) arr.push(rec);
    else groups.set(key, [rec]);
  });

  const deduped: DedupeResult["deduped"] = [];
  let duplicatesDropped = 0;

  for (const group of groups.values()) {
    if (group.length === 1) {
      deduped.push({ ...group[0], duplicate_of: [] });
      continue;
    }
    // newest completion_time first; nulls sort last
    const sorted = [...group].sort((a, b) => {
      const at = a.completion_time?.getTime() ?? -Infinity;
      const bt = b.completion_time?.getTime() ?? -Infinity;
      return bt - at;
    });
    const [winner, ...rest] = sorted;
    duplicatesDropped += rest.length;
    deduped.push({
      ...winner,
      duplicate_of: rest.map((r) => ({ employee_id: r.employee_id, full_name: r.full_name })),
    });
  }

  return { deduped, duplicatesDropped };
}
