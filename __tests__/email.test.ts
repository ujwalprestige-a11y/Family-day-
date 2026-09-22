import { describe, it, expect } from "vitest";
import { renderConfirmation } from "@/lib/email";

const base = {
  employee_id: "102314",
  full_name: "Umesh S",
  email: "umesh.s@prestigeconstructions.com",
  mobile: "7760979449",
  family_members: ["Spouse", "Child 1"],
  paid_extended: ["Sibling 1", "Sibling 2"],
  wristbands_total: 5,
};

describe("renderConfirmation", () => {
  it("uses the correct subject", () => {
    expect(renderConfirmation(base).subject).toBe(
      "Registration Confirmed – Prestige Family Day 2026, Beyond the Skyline"
    );
  });

  it("fills all detail placeholders and computes amount", () => {
    const { text } = renderConfirmation(base);
    expect(text).toContain("Dear Umesh S,");
    expect(text).toContain("Employee ID: 102314");
    expect(text).toContain("Mobile: 7760979449");
    expect(text).toContain("Family joining you (free): Spouse, Child 1");
    expect(text).toContain("Extended family (paid, ₹2,500 each): Sibling 1, Sibling 2");
    expect(text).toContain("Total wristbands: 5");
    expect(text).toContain("Amount payable: ₹5,000"); // 2 paid × 2500
  });

  it("shows None when there is no family / paid extended", () => {
    const { text } = renderConfirmation({
      ...base,
      family_members: [],
      paid_extended: [],
      wristbands_total: 1,
    });
    expect(text).toContain("Family joining you (free): None");
    expect(text).toContain("Extended family (paid, ₹2,500 each): None");
    expect(text).toContain("Amount payable: ₹0");
  });
});
