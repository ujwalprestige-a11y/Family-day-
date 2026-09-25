/**
 * Allotment helpers.
 *
 * Each employee is allotted a number of adult and child wristbands by the
 * master sheet. At the desk we record how many actually turned up. Both sides
 * are stored so the admin view can compare planned against issued.
 *
 * `allotted_adults` and `actual_adults` INCLUDE the employee themselves.
 */

/** Hard ceilings for the desk counters, to stop a stray keypress. */
export const MAX_ADULTS = 20;
export const MAX_CHILDREN = 20;

export interface AllotmentCounts {
  adults: number;
  children: number;
}

/** Total wristbands across both categories. */
export function total(counts: AllotmentCounts): number {
  return counts.adults + counts.children;
}

/**
 * Coerce untrusted input to a whole number inside [0, max].
 * Non-numeric, negative, NaN and fractional values all collapse to something
 * safe rather than throwing, because this guards a DB write.
 */
export function clampCount(value: unknown, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

/** True when the desk is issuing more wristbands than were allotted. */
export function exceedsAllotment(
  actual: AllotmentCounts,
  allotted: AllotmentCounts
): boolean {
  return actual.adults > allotted.adults || actual.children > allotted.children;
}

/**
 * Human summary of a split, e.g. "3 adults + 2 children". Used on the kiosk
 * and in the Excel export so the two always read the same way.
 */
export function describeSplit(counts: AllotmentCounts): string {
  const a = `${counts.adults} adult${counts.adults === 1 ? "" : "s"}`;
  const c = `${counts.children} child${counts.children === 1 ? "" : "ren"}`;
  return `${a} + ${c}`;
}
