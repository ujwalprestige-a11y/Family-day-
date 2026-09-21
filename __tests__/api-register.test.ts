import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as register } from "@/app/api/register/[id]/route";
import { prisma } from "@/lib/db";

function req(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/register/${id}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let recId: string;

async function seed(): Promise<string> {
  const rec = await prisma.employee.create({
    data: {
      form_id: "seed-1",
      employee_id: "500",
      full_name: "Old Name",
      email: "old@x.com",
      mobile: "9000000000",
      marital_status: "Married",
      family_members: ["Spouse"],
      paid_extended: [],
      wristbands_total: 2,
      status: "not_registered",
      source: "master",
    },
  });
  return rec.id;
}

beforeEach(async () => {
  await prisma.employee.deleteMany();
  recId = await seed();
});

describe("POST /api/register/:id", () => {
  it("returns 404 for an unknown id", async () => {
    const res = await register(
      req("nonexistent", { full_name: "X", email: "x@y.com", mobile: "9876543210" }),
      ctx("nonexistent")
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 for invalid payload", async () => {
    const res = await register(req(recId, { full_name: "", email: "bad", mobile: "123" }), ctx(recId));
    expect(res.status).toBe(422);
    const { errors } = await res.json();
    expect(errors.full_name).toBeTruthy();
    expect(errors.email).toBeTruthy();
    expect(errors.mobile).toBeTruthy();
  });

  it("registers, records only the changed fields, and sets pre_registered", async () => {
    const res = await register(
      req(recId, {
        full_name: "New Name", // changed
        email: "old@x.com", // unchanged
        mobile: "9000000000", // unchanged
        family_members: ["Spouse", "Child 1"], // changed
        paid_extended: ["Parent 1"], // changed
      }),
      ctx(recId)
    );
    expect(res.status).toBe(200);
    const { result, employee } = await res.json();
    expect(result).toBe("registered");
    expect(employee.status).toBe("pre_registered");
    expect(employee.registered_at).toBeTruthy();
    expect(employee.wristbands_total).toBe(4); // 1 + 2 family + 1 paid
    expect(new Set(employee.edited_fields)).toEqual(
      new Set(["full_name", "family_members", "paid_extended"])
    );
  });

  it("is idempotent: a second confirm returns already_registered and does not change data", async () => {
    await register(
      req(recId, { full_name: "First", email: "old@x.com", mobile: "9000000000", family_members: ["Spouse"], paid_extended: [] }),
      ctx(recId)
    );
    const before = await prisma.employee.findUnique({ where: { id: recId } });

    const res = await register(
      req(recId, { full_name: "Second Attempt", email: "new@x.com", mobile: "9111111111", family_members: [], paid_extended: ["Parent 1", "Parent 2"] }),
      ctx(recId)
    );
    expect(res.status).toBe(200);
    const { result } = await res.json();
    expect(result).toBe("already_registered");

    const after = await prisma.employee.findUnique({ where: { id: recId } });
    expect(after?.full_name).toBe(before?.full_name);
    expect(after?.email).toBe(before?.email);
    expect(after?.wristbands_total).toBe(before?.wristbands_total);
  });
});
