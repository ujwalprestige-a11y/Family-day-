/**
 * Wristband option sets + tally helpers.
 * Mirrors the prototype: free family chips depend on marital status, paid
 * extended-family chips are a fixed set at ₹2,500 each.
 */

export const PRICE_PER_PAID = 2500;

export const FREE_FAMILY_MARRIED = ["Spouse", "Child 1", "Child 2", "Child 3"] as const;
export const FREE_FAMILY_SINGLE = ["Parent 1", "Parent 2"] as const;
export const PAID_EXTENDED = ["Parent 1", "Parent 2", "Sibling 1", "Sibling 2", "Others 1"] as const;

/**
 * The free-family chip options for a given marital status. Any already-selected
 * values not in the standard set are appended so they remain visible/selectable.
 */
export function freeFamilyOptions(
  maritalStatus: string | null | undefined,
  selected: string[] = []
): string[] {
  const base: string[] =
    (maritalStatus ?? "").trim().toLowerCase() === "married"
      ? [...FREE_FAMILY_MARRIED]
      : [...FREE_FAMILY_SINGLE];
  const extras = selected.filter((s) => !base.includes(s));
  return [...base, ...extras];
}

/** Total wristbands including the employee themselves. */
export function wristbandTotal(familyMembers: string[], paidExtended: string[]): number {
  return 1 + familyMembers.length + paidExtended.length;
}

/** Amount (INR) to collect at the desk for paid extended-family wristbands. */
export function amountToCollect(paidExtended: string[]): number {
  return paidExtended.length * PRICE_PER_PAID;
}

/** Format an integer rupee amount with Indian digit grouping, e.g. "₹2,500". */
export function formatINR(amount: number): string {
  return "\u20B9" + amount.toLocaleString("en-IN");
}
