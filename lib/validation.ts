/**
 * Shared validation helpers, used by both the client (instant inline errors)
 * and the server (authoritative).
 *
 * Email and mobile validation was removed with the allotment model — the desk
 * no longer collects contact details.
 */

export function isNonEmptyName(value: string | null | undefined): boolean {
  return (value ?? "").trim().length > 0;
}

/**
 * A walk-in employee ID must be exactly 6 digits.
 *
 * Note this is stricter than the imported master list, which contains 87 rows
 * that are not 6 digits (and 9 that are not numeric at all, e.g. "Intern").
 * Those are flagged with `needs_review` rather than rejected, because they are
 * real people; the rule here only governs IDs typed fresh at the desk.
 */
export function isValidEmployeeId(value: string | null | undefined): boolean {
  return /^\d{6}$/.test((value ?? "").trim());
}

/** Looks like a master-list ID we can trust without a staff second look. */
export function isCleanEmployeeId(value: string | null | undefined): boolean {
  return isValidEmployeeId(value);
}
