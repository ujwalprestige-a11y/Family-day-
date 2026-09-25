import { describe, it, expect } from "vitest";
import {
  canonicaliseEntities,
  cellInt,
  cellText,
  mapRow,
  stripInvisible,
  type AllotmentRecord,
  type RawSheetRow,
} from "@/lib/mapping";

function row(over: Partial<RawSheetRow> = {}): RawSheetRow {
  return {
    emp_id: "220477",
    emp_name: "Umesh G K",
    count: 5,
    children: 2,
    entity: "PPMS Bangalore",
    department: "PPMS",
    ...over,
  };
}

/* -------------------------------------------------------------------------- */
/* Cell reading                                                               */
/* -------------------------------------------------------------------------- */

describe("stripInvisible", () => {
  it("removes a leading left-to-right mark, which hides valid IDs in the sheet", () => {
    expect(stripInvisible("\u200e103054")).toBe("103054");
  });

  it("removes zero-width characters and the BOM", () => {
    expect(stripInvisible("10\u200b30\u200c54\ufeff")).toBe("103054");
  });

  it("converts non-breaking spaces to ordinary ones", () => {
    expect(stripInvisible("Umesh\u00a0G K")).toBe("Umesh G K");
  });
});

describe("cellText", () => {
  it("reads primitives", () => {
    expect(cellText("  hello  ")).toBe("hello");
    expect(cellText(42)).toBe("42");
    expect(cellText(0)).toBe("0");
    expect(cellText(true)).toBe("true");
  });

  it("returns empty for null and undefined", () => {
    expect(cellText(null)).toBe("");
    expect(cellText(undefined)).toBe("");
  });

  it("reads a formula's cached result", () => {
    expect(cellText({ formula: "+C2-D2", result: 3 })).toBe("3");
  });

  it("reads a shared formula's cached result", () => {
    expect(cellText({ sharedFormula: "E3", result: 1 })).toBe("1");
  });

  it("returns empty for a formula with no cached result", () => {
    // 21 rows of the ADULT column look like this.
    expect(cellText({ sharedFormula: "E3" })).toBe("");
    expect(cellText({ formula: "+C2-D2" })).toBe("");
  });

  it("flattens rich text", () => {
    expect(cellText({ richText: [{ text: "Umesh " }, { text: "G K" }] })).toBe("Umesh G K");
  });

  it("reads hyperlink text", () => {
    expect(cellText({ text: "220477", hyperlink: "http://x" })).toBe("220477");
  });
});

describe("cellInt", () => {
  it("parses integers", () => {
    expect(cellInt(5)).toBe(5);
    expect(cellInt("3")).toBe(3);
    expect(cellInt(0)).toBe(0);
  });

  it("floors fractions", () => {
    expect(cellInt(2.7)).toBe(2);
  });

  it("returns null for blank or non-numeric cells", () => {
    expect(cellInt("")).toBeNull();
    expect(cellInt(null)).toBeNull();
    expect(cellInt("abc")).toBeNull();
    expect(cellInt({ sharedFormula: "E3" })).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* mapRow                                                                     */
/* -------------------------------------------------------------------------- */

describe("mapRow", () => {
  it("maps a clean row and derives adults as COUNT - CHILDREN", () => {
    const r = mapRow(row());
    expect(r.employee_id).toBe("220477");
    expect(r.full_name).toBe("Umesh G K");
    expect(r.entity).toBe("PPMS Bangalore");
    expect(r.department).toBe("PPMS");
    expect(r.allotted_adults).toBe(3);
    expect(r.allotted_children).toBe(2);
    expect(r.needs_review).toBe(false);
    expect(r.review_reasons).toEqual([]);
  });

  it("ignores the ADULT column entirely, trusting COUNT and CHILDREN", () => {
    // Row 596 in the real sheet: count=2, children=0, but ADULT says 3.
    const r = mapRow(row({ count: 2, children: 0 }));
    expect(r.allotted_adults).toBe(2);
    expect(r.allotted_children).toBe(0);
  });

  it("treats a blank CHILDREN cell as zero", () => {
    const r = mapRow(row({ count: 3, children: "" }));
    expect(r.allotted_children).toBe(0);
    expect(r.allotted_adults).toBe(3);
  });

  it("recovers an employee ID hidden behind a left-to-right mark", () => {
    const r = mapRow(row({ emp_id: "\u200e103054" }));
    expect(r.employee_id).toBe("103054");
    expect(r.needs_review).toBe(false);
  });

  it("flags an employee ID that is not 6 digits but still keeps the row", () => {
    const r = mapRow(row({ emp_id: "2530" }));
    expect(r.employee_id).toBe("2530");
    expect(r.needs_review).toBe(true);
    expect(r.review_reasons).toContain("employee id is not 6 digits");
  });

  it("flags non-numeric placeholder IDs", () => {
    const r = mapRow(row({ emp_id: "Choreographer", emp_name: "Choreographer" }));
    expect(r.needs_review).toBe(true);
    expect(r.review_reasons).toContain("employee id is not 6 digits");
  });

  it("flags a blank name", () => {
    const r = mapRow(row({ emp_name: "   " }));
    expect(r.needs_review).toBe(true);
    expect(r.review_reasons).toContain("blank name");
  });

  it("flags COUNT of zero and allots nothing", () => {
    const r = mapRow(row({ count: 0, children: 0 }));
    expect(r.allotted_adults).toBe(0);
    expect(r.allotted_children).toBe(0);
    expect(r.needs_review).toBe(true);
    expect(r.review_reasons).toContain("COUNT is 0");
  });

  it("flags a blank COUNT", () => {
    const r = mapRow(row({ count: "" }));
    expect(r.needs_review).toBe(true);
    expect(r.review_reasons).toContain("blank COUNT");
  });

  it("clamps adults to zero and flags when CHILDREN exceeds COUNT", () => {
    const r = mapRow(row({ count: 1, children: 3 }));
    expect(r.allotted_adults).toBe(0);
    expect(r.allotted_children).toBe(3);
    expect(r.needs_review).toBe(true);
    expect(r.review_reasons.some((x) => x.includes("exceeds COUNT"))).toBe(true);
  });

  it("applies entity aliases", () => {
    expect(mapRow(row({ entity: "Fashions" })).entity).toBe("Prestige Fashions");
    expect(mapRow(row({ entity: "K2K" })).entity).toBe("K2K Infra Bangalore");
    expect(mapRow(row({ entity: "PMMPL" })).entity).toBe("Prestige Mall Management");
  });

  it("leaves an unknown entity untouched", () => {
    expect(mapRow(row({ entity: "Royal China" })).entity).toBe("Royal China");
  });
});

/* -------------------------------------------------------------------------- */
/* canonicaliseEntities                                                       */
/* -------------------------------------------------------------------------- */

function rec(entity: string): AllotmentRecord {
  return {
    employee_id: "100000",
    full_name: "X",
    entity,
    department: "",
    allotted_adults: 1,
    allotted_children: 0,
    needs_review: false,
    review_reasons: [],
  };
}

describe("canonicaliseEntities", () => {
  it("prefers a mixed-case spelling over an all-caps one, even if less common", () => {
    // The real sheet has SUBLIME x19 and Sublime x16.
    const input = [
      ...Array.from({ length: 19 }, () => rec("SUBLIME")),
      ...Array.from({ length: 16 }, () => rec("Sublime")),
    ];
    const { records, changes } = canonicaliseEntities(input);
    expect(records.every((r) => r.entity === "Sublime")).toBe(true);
    expect(changes).toEqual([{ from: "SUBLIME", to: "Sublime", rows: 19 }]);
  });

  it("folds a case variant onto the more common spelling", () => {
    const input = [
      ...Array.from({ length: 493 }, () => rec("PEPL Bangalore")),
      rec("PEPL bangalore"),
    ];
    const { records, changes } = canonicaliseEntities(input);
    expect(records.every((r) => r.entity === "PEPL Bangalore")).toBe(true);
    expect(changes).toEqual([{ from: "PEPL bangalore", to: "PEPL Bangalore", rows: 1 }]);
  });

  it("leaves genuine acronyms alone when they have no mixed-case sibling", () => {
    const { records, changes } = canonicaliseEntities([rec("PMMPL"), rec("PMMPL")]);
    expect(records.every((r) => r.entity === "PMMPL")).toBe(true);
    expect(changes).toEqual([]);
  });

  it("does not touch distinct entities", () => {
    const { records, changes } = canonicaliseEntities([rec("Morph"), rec("Leela")]);
    expect(records.map((r) => r.entity)).toEqual(["Morph", "Leela"]);
    expect(changes).toEqual([]);
  });

  it("ignores blank entities", () => {
    const { records } = canonicaliseEntities([rec(""), rec("Morph")]);
    expect(records[0].entity).toBe("");
    expect(records[1].entity).toBe("Morph");
  });
});
