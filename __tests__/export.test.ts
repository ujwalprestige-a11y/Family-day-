import { describe, it, expect, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { buildWorkbook, computeSummary, exportFilename, type ExportEmployee } from "@/lib/export";
import { GET as exportRoute } from "@/app/api/admin/export.xlsx/route";
import { prisma } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

const sample: ExportEmployee[] = [
  {
    employee_id: "0100",
    full_name: "Pre Reg",
    email: "p@x.com",
    mobile: "9845012345",
    marital_status: "Married",
    family_members: ["Spouse", "Child 1"],
    paid_extended: ["Parent 1"],
    wristbands_total: 4,
    status: "pre_registered",
    source: "master",
    edited_fields: ["email"],
    registered_at: new Date("2026-09-26T09:12:00"),
  },
  {
    employee_id: "0200",
    full_name: "Walk In",
    email: "w@x.com",
    mobile: "9700000000",
    marital_status: "Single",
    family_members: [],
    paid_extended: [],
    wristbands_total: 1,
    status: "walk_in",
    source: "walk_in",
    edited_fields: [],
    registered_at: new Date("2026-09-26T09:31:00"),
  },
  {
    employee_id: "0300",
    full_name: "Not Arrived",
    email: "n@x.com",
    mobile: "9600000000",
    marital_status: "Single",
    family_members: [],
    paid_extended: [],
    wristbands_total: 1,
    status: "not_registered",
    source: "master",
    edited_fields: [],
    registered_at: null,
  },
];

describe("computeSummary", () => {
  it("counts registrations, wristbands and amount to collect", () => {
    const s = computeSummary(sample);
    expect(s.inMaster).toBe(2);
    expect(s.preRegistered).toBe(1);
    expect(s.walkIns).toBe(1);
    expect(s.notYetArrived).toBe(1);
    expect(s.wristbandsIssued).toBe(5); // 4 + 1 (registered only)
    expect(s.amountToCollect).toBe(2500); // one paid wristband
  });
});

describe("exportFilename", () => {
  it("uses the required pattern", () => {
    const name = exportFilename(new Date("2026-09-26T14:05:00"));
    expect(name).toBe("Family_Day_2026_Registrations_2026-09-26_1405.xlsx");
  });
});

describe("buildWorkbook", () => {
  it("has the three required sheets with the right split", async () => {
    const wb = await buildWorkbook(sample);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual(["Registrations", "Not yet arrived", "Summary"]);

    const reg = wb.getWorksheet("Registrations")!;
    // header + 2 registered rows
    expect(reg.rowCount).toBe(3);
    const notArrived = wb.getWorksheet("Not yet arrived")!;
    expect(notArrived.rowCount).toBe(2); // header + 1
  });

  it("bolds the header and freezes the top row", async () => {
    const wb = await buildWorkbook(sample);
    const reg = wb.getWorksheet("Registrations")!;
    expect(reg.getRow(1).font?.bold).toBe(true);
    expect(reg.views[0]?.state).toBe("frozen");
    expect(reg.views[0]?.ySplit).toBe(1);
  });

  it("stores Employee ID and Mobile as text", async () => {
    const wb = await buildWorkbook(sample);
    const reg = wb.getWorksheet("Registrations")!;
    // Column 1 = Employee ID, Column 4 = Mobile
    expect(reg.getColumn(1).numFmt).toBe("@");
    expect(reg.getColumn(4).numFmt).toBe("@");
    const idCell = reg.getCell(2, 1);
    const mobileCell = reg.getCell(2, 4);
    expect(typeof idCell.value).toBe("string");
    expect(typeof mobileCell.value).toBe("string");
  });

  it("round-trips via a buffer", async () => {
    const wb = await buildWorkbook(sample);
    const buf = await wb.xlsx.writeBuffer();
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buf as ArrayBuffer);
    expect(wb2.worksheets.map((w) => w.name)).toContain("Summary");
  });
});

describe("GET /api/admin/export.xlsx auth", () => {
  beforeEach(async () => {
    await prisma.employee.deleteMany();
  });

  it("returns 401 without a session", async () => {
    const res = await exportRoute(new NextRequest("http://localhost/api/admin/export.xlsx"));
    expect(res.status).toBe(401);
  });

  it("returns an xlsx download with a valid session", async () => {
    const token = createSessionToken();
    const res = await exportRoute(
      new NextRequest("http://localhost/api/admin/export.xlsx", {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toContain("Family_Day_2026_Registrations_");
  });
});
