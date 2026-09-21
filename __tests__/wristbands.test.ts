import { describe, it, expect } from "vitest";
import {
  freeFamilyOptions,
  wristbandTotal,
  amountToCollect,
  formatINR,
  FREE_FAMILY_MARRIED,
  FREE_FAMILY_SINGLE,
} from "@/lib/wristbands";
import { maskMobile } from "@/lib/mask";

describe("freeFamilyOptions", () => {
  it("returns married set for Married", () => {
    expect(freeFamilyOptions("Married")).toEqual([...FREE_FAMILY_MARRIED]);
  });
  it("returns single set for anything else", () => {
    expect(freeFamilyOptions("Single")).toEqual([...FREE_FAMILY_SINGLE]);
  });
  it("appends already-selected values not in the base set", () => {
    expect(freeFamilyOptions("Single", ["Parent 1", "Child 9"])).toContain("Child 9");
  });
});

describe("wristbandTotal", () => {
  it("counts self + family + paid", () => {
    expect(wristbandTotal([], [])).toBe(1);
    expect(wristbandTotal(["Spouse", "Child 1"], [])).toBe(3);
    expect(wristbandTotal(["Spouse"], ["Parent 1", "Parent 2"])).toBe(4);
  });
});

describe("amountToCollect / formatINR", () => {
  it("charges ₹2,500 per paid wristband", () => {
    expect(amountToCollect([])).toBe(0);
    expect(amountToCollect(["Parent 1", "Sibling 1"])).toBe(5000);
  });
  it("formats with Indian digit grouping", () => {
    expect(formatINR(0)).toBe("\u20B90");
    expect(formatINR(2500)).toBe("\u20B92,500");
    expect(formatINR(1250000)).toBe("\u20B912,50,000");
  });
});

describe("maskMobile", () => {
  it("shows only the last four digits", () => {
    expect(maskMobile("9845012345")).toBe("XXXXXX2345");
  });
  it("returns an em dash for too-short values", () => {
    expect(maskMobile("12")).toBe("\u2014");
    expect(maskMobile("")).toBe("\u2014");
  });
});
