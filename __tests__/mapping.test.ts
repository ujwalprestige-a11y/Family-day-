import { describe, it, expect } from "vitest";
import {
  mapRow,
  splitList,
  firstNonEmpty,
  dedupeByEmployeeId,
  parseCompletionTime,
  type RawRow,
  type CanonicalRecord,
} from "@/lib/mapping";

// Real header strings from the Microsoft Forms export.
const H = {
  id: "Id",
  start: "Start time",
  completion: "Completion time",
  email: "Email",
  name: "Name",
  fullName: "Full Name",
  empId: "Employee ID",
  marital: "Marital Status",
  marriedFamily:
    "Married Team Members: Self + Immediate family, up to 4 members (Spouse + 2 Children).In case of more than 2 children, additional wristbands can be requested. ",
  marriedPaid:
    "Paid Wristband \u2013 Extended Family of Team Members: Parents & siblings are more than welcome; however, a charge of ?2500 per person will be applicable.",
  marriedContact: "Contact Number",
  marriedEmail: "Employee Email ID",
  marriedTotal: "Total Number of Wristbands Requested (Complimentary + Paid)",
  marriedAck: "Acknowledgement of Guidelines",
  singleFamily:
    "Single Team Members: 1 for self.Up to 2 additional complimentary wristbands for parents only.",
  singlePaid:
    "Paid Wristband \u2013 Extended Family of Team Members: Parents & siblings are more than welcome; however, a charge of ?2500 per person will be applicable.1",
  singleTotal: "Total Number of Wristbands Requested (Complimentary + Paid)1",
  singleContact: "Contact Number1",
  singleEmail: "Email Address",
  singleAck: "Acknowledgement of Guidelines1",
};

function makeRow(overrides: Partial<Record<keyof typeof H, string>>): RawRow {
  const base: Record<string, string> = {};
  for (const key of Object.values(H)) base[key] = "";
  const row: RawRow = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    row[H[k as keyof typeof H]] = v as string;
  }
  return row;
}

describe("splitList", () => {
  it("trims, drops empties and de-dupes", () => {
    expect(splitList("Spouse; Child 1 ;;Child 1")).toEqual(["Spouse", "Child 1"]);
    expect(splitList("")).toEqual([]);
    expect(splitList(null)).toEqual([]);
  });
});

describe("firstNonEmpty", () => {
  it("returns the first trimmed non-empty value", () => {
    expect(firstNonEmpty("", "  ", "x")).toBe("x");
    expect(firstNonEmpty(null, undefined, "")).toBe("");
  });
});

describe("parseCompletionTime", () => {
  it("parses M/D/YYYY H:mm", () => {
    const d = parseCompletionTime("8/13/2026 11:30");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(7); // August
    expect(d?.getDate()).toBe(13);
  });
  it("returns null for blanks", () => {
    expect(parseCompletionTime("")).toBeNull();
  });
});

describe("mapRow – Married", () => {
  const row = makeRow({
    completion: "8/13/2026 11:30",
    email: "umesh.s@prestigeconstructions.com",
    name: "Umesh S",
    fullName: "Umesh",
    empId: "102314",
    marital: "Married",
    marriedFamily: "Spouse;Child 1;Child 2",
    marriedPaid: "Parent 1",
    marriedContact: "7760979449",
    marriedEmail: "umesh.s@prestigeconstructions.com",
  });
  const rec = mapRow(row);

  it("takes family from the Married column", () => {
    expect(rec.family_members).toEqual(["Spouse", "Child 1", "Child 2"]);
  });
  it("takes paid from the Married paid column", () => {
    expect(rec.paid_extended).toEqual(["Parent 1"]);
  });
  it("prefers Employee Email ID and Contact Number", () => {
    expect(rec.email).toBe("umesh.s@prestigeconstructions.com");
    expect(rec.mobile).toBe("7760979449");
  });
  it("uses Full Name over Name", () => {
    expect(rec.full_name).toBe("Umesh");
  });
  it("recomputes wristbands (1 self + 3 family + 1 paid = 5) ignoring sheet total", () => {
    expect(rec.wristbands_total).toBe(5);
  });
  it("is not flagged for review", () => {
    expect(rec.needs_review).toBe(false);
  });
});

describe("mapRow – Single", () => {
  const row = makeRow({
    completion: "8/14/2026 12:57",
    email: "vinodh.g@prestigeconstructions.com",
    name: "Vinodh G",
    fullName: "Vinodh G",
    empId: "105399",
    marital: "Single",
    singleFamily: "Parent 1;Parent 2",
    singleContact: "9036539752",
    singleEmail: "vinodhg@gmail.com",
  });
  const rec = mapRow(row);

  it("takes family from the Single column", () => {
    expect(rec.family_members).toEqual(["Parent 1", "Parent 2"]);
  });
  it("email falls back to Email Address (Single) when no Married email", () => {
    expect(rec.email).toBe("vinodhg@gmail.com");
  });
  it("mobile comes from Contact Number1", () => {
    expect(rec.mobile).toBe("9036539752");
  });
  it("wristbands = 1 self + 2 parents = 3", () => {
    expect(rec.wristbands_total).toBe(3);
  });
});

describe("mapRow – email fallback to plain Email", () => {
  it("uses Email when neither Married nor Single email present", () => {
    const rec = mapRow(
      makeRow({ empId: "1", fullName: "X Y", email: "x@y.com", singleContact: "9876543210" })
    );
    expect(rec.email).toBe("x@y.com");
  });
});

describe("mapRow – misaligned / incomplete rows are flagged", () => {
  it("flags an all-whitespace Employee ID", () => {
    const rec = mapRow(
      makeRow({ empId: "     ", fullName: "Ajit", singleEmail: "a@b.com", singleContact: "8296473767" })
    );
    expect(rec.needs_review).toBe(true);
  });
  it("flags a short mobile", () => {
    const rec = mapRow(
      makeRow({ empId: "101561", fullName: "Fatima", singleEmail: "f@s.in", singleContact: "99001" })
    );
    expect(rec.needs_review).toBe(true);
  });
  it("flags a bad email", () => {
    const rec = mapRow(
      makeRow({ empId: "101561", fullName: "Fatima", singleContact: "9876543210" })
    );
    expect(rec.needs_review).toBe(true);
  });
  it("normalises a +91 mobile and does not flag it", () => {
    const rec = mapRow(
      makeRow({ empId: "1", fullName: "Ajit", singleEmail: "a@b.com", singleContact: "+91 8296473767" })
    );
    expect(rec.mobile).toBe("8296473767");
    expect(rec.needs_review).toBe(false);
  });
});

describe("dedupeByEmployeeId", () => {
  const base: CanonicalRecord = {
    form_id: "1",
    employee_id: "500",
    full_name: "Old Name",
    email: "old@x.com",
    mobile: "9000000000",
    marital_status: "Single",
    family_members: [],
    paid_extended: [],
    wristbands_total: 1,
    needs_review: false,
    completion_time: parseCompletionTime("8/10/2026 09:00"),
  };

  it("keeps the most recent submission and records the alternates", () => {
    const older = { ...base };
    const newer = {
      ...base,
      full_name: "New Name",
      completion_time: parseCompletionTime("8/20/2026 09:00"),
    };
    const { deduped, duplicatesDropped } = dedupeByEmployeeId([older, newer]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].full_name).toBe("New Name");
    expect(duplicatesDropped).toBe(1);
    expect(deduped[0].duplicate_of).toEqual([{ employee_id: "500", full_name: "Old Name" }]);
  });

  it("never groups empty-id rows together", () => {
    const a = { ...base, employee_id: "", full_name: "A" };
    const b = { ...base, employee_id: "", full_name: "B" };
    const { deduped, duplicatesDropped } = dedupeByEmployeeId([a, b]);
    expect(deduped).toHaveLength(2);
    expect(duplicatesDropped).toBe(0);
  });
});
