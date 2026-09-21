/**
 * Shared validation + normalisation helpers.
 * Used by both the client (instant inline errors) and the server (authoritative).
 */

// Same intent as the prototype's regex: something@something.tld (tld >= 2 chars).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string | null | undefined): boolean {
  return EMAIL_RE.test((value ?? "").trim());
}

export function isNonEmptyName(value: string | null | undefined): boolean {
  return (value ?? "").trim().length > 0;
}

/**
 * Normalise a raw mobile string toward a 10-digit Indian number.
 * - strips spaces, dashes, parentheses, dots
 * - drops a leading "+91", "91" or "0" country/trunk prefix
 * Returns the digits after normalisation (may be != 10 chars if the input was
 * malformed — callers decide whether that is acceptable).
 */
export function normaliseMobile(value: string | null | undefined): string {
  let digits = (value ?? "").replace(/[\s\-().]/g, "");
  // Drop a leading + then handle 91 / 0 prefixes.
  digits = digits.replace(/^\+/, "");
  if (digits.length > 10 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length > 10 && digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }
  // Keep digits only.
  digits = digits.replace(/\D/g, "");
  return digits;
}

export function isValidMobile(value: string | null | undefined): boolean {
  return /^\d{10}$/.test(normaliseMobile(value));
}
