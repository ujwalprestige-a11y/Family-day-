import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as walkin } from "@/app/api/walkin/route";
import { prisma } from "@/lib/db";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/walkin", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(async () => {
  await prisma.employee.deleteMany();
});

describe("POST /api/walkin", () => {
  it("returns 422 when required fields are missing/invalid", async () => {
    const res = await walkin(req({ employee_id: "", full_name: "", email: "bad", mobile: "12" }));
    expect(res.status).toBe(422);
    const { errors } = await res.json();
    expect(errors.employee_id).toBeTruthy();
    expect(errors.full_name).toBeTruthy();
    expect(errors.email).toBeTruthy();
    expect(errors.mobile).toBeTruthy();
  });

  it("creates a walk-in with free family and paid extended, computing wristbands", async () => {
    const res = await walkin(
      req({
        employee_id: "888001",
        full_name: "Walk In",
        email: "w@i.com",
        mobile: "9876543210",
        marital_status: "Single",
        family_members: ["Parent 1", "Parent 2"],
        paid_extended: ["Sibling 1"],
      })
    );
    expect(res.status).toBe(201);
    const { result, employee } = await res.json();
    expect(result).toBe("walkin");
    expect(employee.status).toBe("walk_in");
    expect(employee.source).toBe("walk_in");
    expect(employee.wristbands_total).toBe(4); // 1 self + 2 family + 1 paid
    expect(employee.paid_extended).toEqual(["Sibling 1"]);
  });

  it("rejects an employee_id that is not exactly 6 digits (422)", async () => {
    const short = await walkin(
      req({ employee_id: "700", full_name: "Nope", email: "n@x.com", mobile: "9876543210" })
    );
    expect(short.status).toBe(422);
    expect((await short.json()).errors.employee_id).toBeTruthy();

    const long = await walkin(
      req({ employee_id: "1234567", full_name: "Nope", email: "n@x.com", mobile: "9876543210" })
    );
    expect(long.status).toBe(422);
    expect((await long.json()).errors.employee_id).toBeTruthy();
  });

  it("rejects an employee_id that already exists (409)", async () => {
    await prisma.employee.create({
      data: {
        employee_id: "700000",
        full_name: "Existing",
        email: "e@x.com",
        mobile: "9000000000",
        marital_status: "Single",
        family_members: [],
        paid_extended: [],
        wristbands_total: 1,
        status: "not_registered",
        source: "master",
      },
    });
    const res = await walkin(
      req({ employee_id: "700000", full_name: "Dup", email: "d@d.com", mobile: "9876543210" })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("exists");
  });
});
