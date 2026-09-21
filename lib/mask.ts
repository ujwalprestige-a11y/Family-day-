/**
 * Mask a mobile number for public search results: show only the last 4 digits.
 * "9845012345" -> "XXXXXX1234". Anything too short returns an em dash.
 */
export function maskMobile(mobile: string | null | undefined): string {
  const value = (mobile ?? "").trim();
  if (value.length >= 4) {
    return "XXXXXX" + value.slice(-4);
  }
  return "\u2014"; // —
}
