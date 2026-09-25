import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import {
  buildWorkbook,
  computeSummary,
  exportFilename,
  statusLabel,
  sourceLabel,
  type ExportEmployee,
} from "@/lib/export";
import { GET as exportRoute } from "@/app/api/admin/export.xlsx/route";

const sample: ExportEmployee[] = [
  {
    // Checked in exactly on allotment.
    employee_id: "220477",
    full_name: "Umesh G K",
    entity: "PPMS Bangalore",
    department: "PPMS",
    allotted_adults: 3,
    allotted_children: 2,
    actual_adults: 3,
    actual_children: 2,
    status: "checked_in",
    source: "master",
    registered_at: new Date("2026-09-26T09:12:00"),
    needs_review: false,
  },
  {
    // Checked in over allotment on children.
    employee_id: "701704",
    full_name: "Rizwan M K",
    entity: "Prestige Fashions",
    department: "Fashions",
    allotted_adults: 1,
    allotted_children: 0,
    actual_adults: 1,
    actual_children: 2,
    status: "checked_in",
    source: "master",
    registered_at: new Date("2026-09-26T09:20:00"),
    needs_review: false,
  },
  {
    // Walk-in: no allotment at all, so anything issued is over.
    employee_id: "999999",
    full_name: "Walk In",
    entity: "",
    department: "",
    allotted_adults: 0,
    allotted_children: 0,
    actual_adults: 2,
    actual_children: 1,
    status: "checked_in",
    source: "walk_in",
    registered_at: new Date("2026-09-26T09:31:00"),
    needs_review: false,
  },
  {
    // Still to arrive.
    employee_id: "752816",
    full_name: "Vinayak Timmanna Nayak",
    entity: "K2K Infra Bangalore",
    department: "K2K",
    allotted_adults: 1,
    allotted_children: 0,
    actual_adults: 0,
    actual_children: 0,
    status: "not_arrived",
    source: "master",
    registered_at: null,
    needs_review: true,
  },
];

describe("labels", () => {
  it("maps status and source to desk-friendly text", () => {
    expect(statusLabel("checked_in")).toBe("Checked in");
    expect(statusLabel("not_arrived")).toBe("Not yet arrived");
    expect(sourceLabel("master")).toBe("Master list");
    expect(sourceLabel("walk_in")).toBe("Walk-in (added at desk)");
  });
});

describe("computeSummary", () => {
  const s = computeSummary(sample);

  it("counts people by source and status", () => {
    expect(s.inMaster).toBe(3);
    expect(s.walkIns).toBe(1);
    expect(s.checkedIn).toBe(3);
    expect(s.notYetArrived).toBe(1);
  });

  it("sums the allotment across everyone, arrived or not", () => {
    expect(s.allottedAdults).toBe(5); // 3 + 1 + 0 + 1
    expect(s.allottedChildren).toBe(2); // 2 + 0 + 0 + 0
    expect(s.allottedTotal).toBe(7);
  });

  it("sums actuals only for people who checked in", () => {
    expect(s.actualAdults).toBe(6); // 3 + 1 + 2
    expect(s.actualChildren).toBe(5); // 2 + 2 + 1
    expect(s.actualTotal).toBe(11);
  });

  it("counts how many checked in over their allotment", () => {
    // Rizwan (children over) and the walk-in (no allotment).
    expect(s.overAllotment).toBe(2);
  });

  it("ignores actuals on rows that have not arrived", () => {
    const withStaleActuals = computeSummary([
      { ...sample[3], actual_adults: 9, actual_children: 9 },
    ]);
    expect(withStaleActuals.actualTotal).toBe(0);
  });
});

describe("exportFilename", () => {
  it("stamps the date and time", () => {
    expect(exportFilename(new Date("2026-09-26T09:05:00"))).toBe(
      "Family_Day_2026_Registrations_2026-09-26_0905.xlsx"
    );
  });
});

describe("buildWorkbook", () => {
  it("creates the three expected sheets, split by arrival", async () => {
    const wb = await buildWorkbook(sample);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Checked in",
      "Not yet arrived",
      "Summary",
    ]);

    // 1 header + 3 checked in, 1 header + 1 not arrived.
    expect(wb.getWorksheet("Checked in")!.rowCount).toBe(4);
    expect(wb.getWorksheet("Not yet arrived")!.rowCount).toBe(2);
  });

  it("bolds and freezes the header row", async () => {
    const wb = await buildWorkbook(sample);
    const ws = wb.getWorksheet("Checked in")!;
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.views?.[0]?.state).toBe("frozen");
    expect(ws.views?.[0]?.ySplit).toBe(1);
  });

  it("stores Employee ID as text so leading zeros survive", async () => {
    const wb = await buildWorkbook(sample);
    const ws = wb.getWorksheet("Checked in")!;
    expect(ws.getColumn(1).numFmt).toBe("@");
    expect(typeof ws.getRow(2).getCell(1).value).toBe("string");
  });

  it("flags over-allotment rows and computes the difference", async () => {
    const wb = await buildWorkbook(sample);
    const ws = wb.getWorksheet("Checked in")!;

    const headers = (ws.getRow(1).values as unknown[]).map((v) => String(v ?? ""));
    const diffCol = headers.indexOf("Difference");
    const overCol = headers.indexOf("Over Allotment");

    // Find Rizwan: allotted 1, issued 3 -> difference +2, over = YES.
    let found = false;
    for (let r = 2; r <= ws.rowCount; r++) {
      if (ws.getRow(r).getCell(1).value === "701704") {
        expect(ws.getRow(r).getCell(diffCol).value).toBe(2);
        expect(ws.getRow(r).getCell(overCol).value).toBe("YES");
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it("leaves the difference blank for people who have not arrived", async () => {
    const wb = await buildWorkbook(sample);
    const ws = wb.getWorksheet("Not yet arrived")!;
    const headers = (ws.getRow(1).values as unknown[]).map((v) => String(v ?? ""));
    const diffCol = headers.indexOf("Difference");
    expect(ws.getRow(2).getCell(diffCol).value ?? "").toBe("");
  });

  it("round-trips via a buffer", async () => {
    const wb = await buildWorkbook(sample);
    const buf = await wb.xlsx.writeBuffer();

    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buf as ArrayBuffer);
    expect(reopened.worksheets.map((w) => w.name)).toEqual([
      "Checked in",
      "Not yet arrived",
      "Summary",
    ]);
  });
});

describe("GET /api/admin/export.xlsx auth", () => {
  it("returns 401 without a session", async () => {
    const res = await exportRoute(new NextRequest("http://localhost/api/admin/export.xlsx"));
    expect(res.status).toBe(401);
  });
});
