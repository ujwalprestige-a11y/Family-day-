import { describe, it, expect } from "vitest";
import { isNonEmptyName, isValidEmployeeId, isCleanEmployeeId } from "@/lib/validation";

describe("isNonEmptyName", () => {
  it("accepts a real name", () => {
    expect(isNonEmptyName("Umesh G K")).toBe(true);
  });

  it("rejects blank, whitespace-only, null and undefined", () => {
    expect(isNonEmptyName("")).toBe(false);
    expect(isNonEmptyName("   ")).toBe(false);
    expect(isNonEmptyName(null)).toBe(false);
    expect(isNonEmptyName(undefined)).toBe(false);
  });
});

describe("isValidEmployeeId", () => {
  it("accepts exactly 6 digits", () => {
    expect(isValidEmployeeId("220477")).toBe(true);
    expect(isValidEmployeeId("000001")).toBe(true);
  });

  it("trims surrounding whitespace before checking", () => {
    expect(isValidEmployeeId("  220477  ")).toBe(true);
  });

  it("rejects the wrong number of digits", () => {
    expect(isValidEmployeeId("12345")).toBe(false);
    expect(isValidEmployeeId("1234567")).toBe(false);
  });

  it("rejects non-numeric IDs that appear in the master sheet", () => {
    for (const id of ["Intern", "F and F", "C10504", "Artist", "Choreographer"]) {
      expect(isValidEmployeeId(id)).toBe(false);
    }
  });

  it("rejects null and undefined", () => {
    expect(isValidEmployeeId(null)).toBe(false);
    expect(isValidEmployeeId(undefined)).toBe(false);
  });
});

describe("isCleanEmployeeId", () => {
  it("matches the 6-digit rule", () => {
    expect(isCleanEmployeeId("103054")).toBe(true);
    expect(isCleanEmployeeId("2530")).toBe(false);
  });
});
