import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as checkIn } from "@/app/api/register/[id]/route";
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
      employee_id: "220477",
      full_name: "Umesh G K",
      entity: "PPMS Bangalore",
      department: "PPMS",
      allotted_adults: 3,
      allotted_children: 2,
      status: "not_arrived",
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
    const res = await checkIn(
      req("nonexistent", { actual_adults: 1, actual_children: 0 }),
      ctx("nonexistent")
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for a malformed body", async () => {
    const bad = new NextRequest(`http://localhost/api/register/${recId}`, {
      method: "POST",
      body: "{not json",
      headers: { "content-type": "application/json" },
    });
    const res = await checkIn(bad, ctx(recId));
    expect(res.status).toBe(400);
  });

  it("returns 422 when a count is missing", async () => {
    const res = await checkIn(req(recId, { actual_adults: 2 }), ctx(recId));
    expect(res.status).toBe(422);
    const { errors } = await res.json();
    expect(errors.actual_children).toBeTruthy();
  });

  it("returns 422 when nothing would be issued", async () => {
    const res = await checkIn(req(recId, { actual_adults: 0, actual_children: 0 }), ctx(recId));
    expect(res.status).toBe(422);
  });

  it("checks in, stores the actuals and stamps the time", async () => {
    const res = await checkIn(req(recId, { actual_adults: 3, actual_children: 2 }), ctx(recId));
    expect(res.status).toBe(200);

    const { result, employee, over_allotment } = await res.json();
    expect(result).toBe("checked_in");
    expect(employee.status).toBe("checked_in");
    expect(employee.actual_adults).toBe(3);
    expect(employee.actual_children).toBe(2);
    expect(employee.registered_at).toBeTruthy();
    expect(over_allotment).toBe(false);

    // Allotment is untouched by a check-in.
    expect(employee.allotted_adults).toBe(3);
    expect(employee.allotted_children).toBe(2);
  });

  it("allows fewer than allotted", async () => {
    const res = await checkIn(req(recId, { actual_adults: 1, actual_children: 0 }), ctx(recId));
    const { over_allotment, employee } = await res.json();
    expect(employee.actual_adults).toBe(1);
    expect(over_allotment).toBe(false);
  });

  it("reports over_allotment when issuing more than allotted", async () => {
    const res = await checkIn(req(recId, { actual_adults: 4, actual_children: 2 }), ctx(recId));
    const { over_allotment } = await res.json();
    expect(over_allotment).toBe(true);
  });

  it("clamps out-of-range and junk counts instead of failing", async () => {
    const res = await checkIn(
      req(recId, { actual_adults: 9999, actual_children: -5 }),
      ctx(recId)
    );
    expect(res.status).toBe(200);
    const { employee } = await res.json();
    expect(employee.actual_adults).toBe(20); // MAX_ADULTS
    expect(employee.actual_children).toBe(0);
  });

  it("is re-runnable: a correction updates the counts and keeps the first arrival time", async () => {
    const first = await checkIn(req(recId, { actual_adults: 3, actual_children: 2 }), ctx(recId));
    const { employee: firstEmp } = await first.json();
    const firstTime = firstEmp.registered_at;

    const second = await checkIn(req(recId, { actual_adults: 2, actual_children: 1 }), ctx(recId));
    expect(second.status).toBe(200);
    const { result, employee } = await second.json();

    expect(result).toBe("updated");
    expect(employee.actual_adults).toBe(2);
    expect(employee.actual_children).toBe(1);
    expect(employee.registered_at).toBe(firstTime);
  });

  it("is safe against a double tap: same counts twice leaves the same data", async () => {
    await checkIn(req(recId, { actual_adults: 3, actual_children: 2 }), ctx(recId));
    const before = await prisma.employee.findUnique({ where: { id: recId } });

    await checkIn(req(recId, { actual_adults: 3, actual_children: 2 }), ctx(recId));
    const after = await prisma.employee.findUnique({ where: { id: recId } });

    expect(after?.actual_adults).toBe(before?.actual_adults);
    expect(after?.actual_children).toBe(before?.actual_children);
    expect(after?.registered_at?.toISOString()).toBe(before?.registered_at?.toISOString());
  });
});
