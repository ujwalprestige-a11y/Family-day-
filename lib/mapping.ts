/**
 * Maps rows of the master allotment spreadsheet ("Updated List.xlsx") into
 * records ready for the database.
 *
 * Sheet columns: EMP ID | EMP NAME | COUNT | CHILDREN | ADULT | ENTITY | DEPARTMENT
 *
 * Kept separate from the importer so the business rules are unit-testable
 * without touching Excel or Postgres.
 */

import { MAX_ADULTS, MAX_CHILDREN, clampCount } from "./allotment";
import { isCleanEmployeeId, isNonEmptyName } from "./validation";

/** A raw row, already pulled out of the sheet but not yet interpreted. */
export interface RawSheetRow {
  emp_id: unknown;
  emp_name: unknown;
  count: unknown;
  children: unknown;
  entity: unknown;
  department: unknown;
}

export interface AllotmentRecord {
  employee_id: string;
  full_name: string;
  entity: string;
  department: string;
  allotted_adults: number;
  allotted_children: number;
  needs_review: boolean;
  /** Why the row was flagged. Printed by the importer, not persisted. */
  review_reasons: string[];
}

/* -------------------------------------------------------------------------- */
/* Cell reading                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Strip characters that are invisible but break exact matching.
 *
 * The sheet contains employee IDs with a leading U+200E LEFT-TO-RIGHT MARK
 * (e.g. "\u200e103054"), almost certainly from a copy-paste. Left alone they
 * look like valid 6-digit IDs to a human but fail every digit check, so those
 * people could not be found by ID at the desk.
 *
 * Also normalises non-breaking spaces to ordinary ones.
 */
export function stripInvisible(value: string): string {
  return value
    // zero-width space/non-joiner/joiner, LRM, RLM, BOM, word joiner
    .replace(/[\u200b\u200c\u200d\u200e\u200f\ufeff\u2060]/g, "")
    // non-breaking and narrow no-break spaces
    .replace(/[\u00a0\u202f]/g, " ")
    .trim();
}

/**
 * Flatten an ExcelJS cell value to trimmed text.
 *
 * Cells are not always primitives: formulas arrive as { formula, result },
 * shared formulas as { sharedFormula, result } and sometimes with NO cached
 * result at all (21 rows of the ADULT column are like this), rich text as
 * { richText: [...] }, and hyperlinks as { text, hyperlink }.
 */
export function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return stripInvisible(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if ("result" in o && o.result != null) return cellText(o.result);
    if ("richText" in o && Array.isArray(o.richText)) {
      return stripInvisible(
        (o.richText as { text?: string }[]).map((t) => t.text ?? "").join("")
      );
    }
    if ("text" in o && o.text != null) return cellText(o.text);
    // A formula with no cached result: nothing usable.
    if ("formula" in o || "sharedFormula" in o) return "";
  }
  return stripInvisible(String(value));
}

/** Parse a cell to a non-negative integer. Blank/garbage becomes null. */
export function cellInt(value: unknown): number | null {
  const text = cellText(value);
  if (text === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

/* -------------------------------------------------------------------------- */
/* Entity aliases                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Entity spellings that mean the same thing but are not just a case difference.
 * Case-only variants (SUBLIME/Sublime, PEPL Bangalore/PEPL bangalore) are
 * folded automatically by `canonicaliseEntities`, so they do not belong here.
 *
 * Keys are lowercased. Adjust if the business disagrees with any of these.
 */
export const ENTITY_ALIASES: Record<string, string> = {
  fashions: "Prestige Fashions",
  k2k: "K2K Infra Bangalore",
  "prestige mall management pvtld": "Prestige Mall Management",
  pmmpl: "Prestige Mall Management",
  fpms: "Falcon Property Management",
};

/* -------------------------------------------------------------------------- */
/* Row mapping                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Interpret one sheet row.
 *
 * Adults are derived as COUNT - CHILDREN rather than read from the ADULT
 * column, because ADULT is a formula whose cached result is missing on some
 * rows and inconsistent on others (4 rows where CHILDREN + ADULT != COUNT).
 * COUNT and CHILDREN are the typed source values, so they win.
 */
export function mapRow(row: RawSheetRow): AllotmentRecord {
  const employee_id = cellText(row.emp_id);
  const full_name = cellText(row.emp_name);
  const rawEntity = cellText(row.entity);
  const department = cellText(row.department);

  const entityKey = rawEntity.toLowerCase();
  const entity = ENTITY_ALIASES[entityKey] ?? rawEntity;

  const count = cellInt(row.count);
  const children = cellInt(row.children) ?? 0;

  const review_reasons: string[] = [];

  if (!isNonEmptyName(full_name)) review_reasons.push("blank name");
  if (employee_id === "") review_reasons.push("blank employee id");
  else if (!isCleanEmployeeId(employee_id)) review_reasons.push("employee id is not 6 digits");

  if (count == null) review_reasons.push("blank COUNT");
  else if (count <= 0) review_reasons.push(`COUNT is ${count}`);

  const safeChildren = clampCount(children, MAX_CHILDREN);
  if (children !== safeChildren) review_reasons.push(`CHILDREN out of range (${children})`);

  // Adults = whatever is left after children. Negative means the sheet
  // disagrees with itself, so clamp to zero and flag it.
  const rawAdults = (count ?? 0) - safeChildren;
  if (count != null && rawAdults < 0) {
    review_reasons.push(`CHILDREN (${safeChildren}) exceeds COUNT (${count})`);
  }
  const allotted_adults = clampCount(rawAdults, MAX_ADULTS);
  const allotted_children = safeChildren;

  return {
    employee_id,
    full_name,
    entity,
    department,
    allotted_adults,
    allotted_children,
    needs_review: review_reasons.length > 0,
    review_reasons,
  };
}

/* -------------------------------------------------------------------------- */
/* Entity canonicalisation (second pass)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Fold entity spellings that differ only by case onto the most common variant,
 * so "SUBLIME" (19 rows) and "Sublime" (16 rows) stop splitting reports.
 *
 * Returns the records with `entity` rewritten, plus the mapping applied so the
 * importer can show what it changed.
 */
export function canonicaliseEntities(records: AllotmentRecord[]): {
  records: AllotmentRecord[];
  changes: { from: string; to: string; rows: number }[];
} {
  // Count each exact spelling, grouped by its lowercase form.
  const groups = new Map<string, Map<string, number>>();
  for (const r of records) {
    if (r.entity === "") continue;
    const key = r.entity.toLowerCase();
    const variants = groups.get(key) ?? new Map<string, number>();
    variants.set(r.entity, (variants.get(r.entity) ?? 0) + 1);
    groups.set(key, variants);
  }

  // Winner per group, in priority order:
  //   1. prefer a mixed-case spelling over a SHOUTED one ("Sublime" over
  //      "SUBLIME"), since all-caps is usually a data-entry artefact. Genuine
  //      acronyms like "PMMPL" have no mixed-case sibling, so are unaffected.
  //   2. then the most common spelling.
  //   3. then alphabetical, purely so the result is deterministic.
  const isShouted = (s: string) => s === s.toUpperCase() && /[A-Z]/.test(s);

  const canonical = new Map<string, string>();
  for (const [key, variants] of groups) {
    const winner = [...variants.entries()].sort((a, b) => {
      const shout = Number(isShouted(a[0])) - Number(isShouted(b[0]));
      if (shout !== 0) return shout;
      return b[1] - a[1] || a[0].localeCompare(b[0]);
    })[0][0];
    canonical.set(key, winner);
  }

  const changeCounts = new Map<string, { from: string; to: string; rows: number }>();
  const out = records.map((r) => {
    if (r.entity === "") return r;
    const to = canonical.get(r.entity.toLowerCase()) ?? r.entity;
    if (to !== r.entity) {
      const k = `${r.entity}->${to}`;
      const existing = changeCounts.get(k);
      if (existing) existing.rows++;
      else changeCounts.set(k, { from: r.entity, to, rows: 1 });
      return { ...r, entity: to };
    }
    return r;
  });

  return {
    records: out,
    changes: [...changeCounts.values()].sort((a, b) => b.rows - a.rows),
  };
}
