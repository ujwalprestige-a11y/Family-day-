import { describe, it, expect } from "vitest";
import {
  MAX_ADULTS,
  MAX_CHILDREN,
  clampCount,
  describeSplit,
  exceedsAllotment,
  total,
} from "@/lib/allotment";

describe("total", () => {
  it("adds adults and children", () => {
    expect(total({ adults: 3, children: 2 })).toBe(5);
    expect(total({ adults: 0, children: 0 })).toBe(0);
  });
});

describe("clampCount", () => {
  it("passes through valid whole numbers", () => {
    expect(clampCount(0, MAX_ADULTS)).toBe(0);
    expect(clampCount(4, MAX_ADULTS)).toBe(4);
  });

  it("accepts numeric strings, as arriving from JSON", () => {
    expect(clampCount("3", MAX_ADULTS)).toBe(3);
  });

  it("floors fractions", () => {
    expect(clampCount(2.9, MAX_ADULTS)).toBe(2);
  });

  it("clamps negatives to zero", () => {
    expect(clampCount(-1, MAX_ADULTS)).toBe(0);
    expect(clampCount(-999, MAX_CHILDREN)).toBe(0);
  });

  it("clamps above the maximum", () => {
    expect(clampCount(9999, MAX_ADULTS)).toBe(MAX_ADULTS);
    expect(clampCount(21, MAX_CHILDREN)).toBe(MAX_CHILDREN);
  });

  it("collapses junk to zero rather than throwing", () => {
    expect(clampCount("abc", MAX_ADULTS)).toBe(0);
    expect(clampCount(null, MAX_ADULTS)).toBe(0);
    expect(clampCount(undefined, MAX_ADULTS)).toBe(0);
    expect(clampCount(NaN, MAX_ADULTS)).toBe(0);
    expect(clampCount({}, MAX_ADULTS)).toBe(0);
  });

  it("treats non-finite input as junk, not as 'the maximum'", () => {
    // Deliberate: collapsing to 0 makes the caller fail the "at least one
    // wristband" check, which surfaces an error to staff. Clamping to the
    // maximum would instead silently issue 20 wristbands.
    expect(clampCount(Infinity, MAX_ADULTS)).toBe(0);
    expect(clampCount(-Infinity, MAX_ADULTS)).toBe(0);
  });
});

describe("exceedsAllotment", () => {
  const allotted = { adults: 2, children: 2 };

  it("is false when issuing exactly the allotment", () => {
    expect(exceedsAllotment({ adults: 2, children: 2 }, allotted)).toBe(false);
  });

  it("is false when issuing fewer", () => {
    expect(exceedsAllotment({ adults: 1, children: 0 }, allotted)).toBe(false);
  });

  it("is true when either category is over, even if the total matches", () => {
    expect(exceedsAllotment({ adults: 3, children: 2 }, allotted)).toBe(true);
    expect(exceedsAllotment({ adults: 2, children: 3 }, allotted)).toBe(true);
    // 3 + 1 == 2 + 2, but adults are over.
    expect(exceedsAllotment({ adults: 3, children: 1 }, allotted)).toBe(true);
  });

  it("treats any issue against a zero allotment as over (walk-ins)", () => {
    expect(exceedsAllotment({ adults: 1, children: 0 }, { adults: 0, children: 0 })).toBe(true);
  });
});

describe("describeSplit", () => {
  it("pluralises correctly", () => {
    expect(describeSplit({ adults: 1, children: 1 })).toBe("1 adult + 1 child");
    expect(describeSplit({ adults: 2, children: 0 })).toBe("2 adults + 0 children");
    expect(describeSplit({ adults: 0, children: 3 })).toBe("0 adults + 3 children");
  });
});
