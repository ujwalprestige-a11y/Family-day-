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

  it("creates a walk-in with computed wristbands", async () => {
    const res = await walkin(
      req({
        employee_id: "888001",
        full_name: "Walk In",
        email: "w@i.com",
        mobile: "9876543210",
        marital_status: "Single",
        family_members: ["Parent 1", "Parent 2"],
      })
    );
    expect(res.status).toBe(201);
    const { result, employee } = await res.json();
    expect(result).toBe("walkin");
    expect(employee.status).toBe("walk_in");
    expect(employee.source).toBe("walk_in");
    expect(employee.wristbands_total).toBe(3); // 1 + 2 family
    expect(employee.paid_extended).toEqual([]);
  });

  it("rejects an employee_id that already exists (409)", async () => {
    await prisma.employee.create({
      data: {
        employee_id: "700",
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
      req({ employee_id: "700", full_name: "Dup", email: "d@d.com", mobile: "9876543210" })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("exists");
  });
});
