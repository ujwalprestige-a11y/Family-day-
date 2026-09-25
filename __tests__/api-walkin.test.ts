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

const valid = {
  employee_id: "700000",
  full_name: "Walk In",
  entity: "Morph",
  department: "Morph",
  actual_adults: 2,
  actual_children: 1,
};

beforeEach(async () => {
  await prisma.employee.deleteMany();
});

describe("POST /api/walkin", () => {
  it("creates a checked-in walk-in with no allotment", async () => {
    const res = await walkin(req(valid));
    expect(res.status).toBe(201);

    const { result, employee } = await res.json();
    expect(result).toBe("walkin");
    expect(employee.status).toBe("checked_in");
    expect(employee.source).toBe("walk_in");
    expect(employee.entity).toBe("Morph");
    expect(employee.department).toBe("Morph");
    expect(employee.actual_adults).toBe(2);
    expect(employee.actual_children).toBe(1);
    // No allotment was planned for this person.
    expect(employee.allotted_adults).toBe(0);
    expect(employee.allotted_children).toBe(0);
    expect(employee.registered_at).toBeTruthy();
  });

  it("treats entity and department as optional", async () => {
    const res = await walkin(
      req({ employee_id: "700001", full_name: "No Org", actual_adults: 1, actual_children: 0 })
    );
    expect(res.status).toBe(201);
    const { employee } = await res.json();
    expect(employee.entity).toBe("");
    expect(employee.department).toBe("");
  });

  it("rejects an employee_id that is not exactly 6 digits (422)", async () => {
    const short = await walkin(req({ ...valid, employee_id: "700" }));
    expect(short.status).toBe(422);
    expect((await short.json()).errors.employee_id).toBeTruthy();

    const long = await walkin(req({ ...valid, employee_id: "1234567" }));
    expect(long.status).toBe(422);
  });

  it("rejects a missing employee_id and a blank name (422)", async () => {
    const res = await walkin(req({ ...valid, employee_id: "", full_name: "  " }));
    expect(res.status).toBe(422);
    const { errors } = await res.json();
    expect(errors.employee_id).toBeTruthy();
    expect(errors.full_name).toBeTruthy();
  });

  it("rejects issuing zero wristbands (422)", async () => {
    const res = await walkin(req({ ...valid, actual_adults: 0, actual_children: 0 }));
    expect(res.status).toBe(422);
    expect((await res.json()).errors.actual_adults).toBeTruthy();
  });

  it("returns 400 for a malformed body", async () => {
    const bad = new NextRequest("http://localhost/api/walkin", {
      method: "POST",
      body: "{not json",
      headers: { "content-type": "application/json" },
    });
    expect((await walkin(bad)).status).toBe(400);
  });

  it("rejects an employee_id already present in the list (409)", async () => {
    await prisma.employee.create({
      data: {
        employee_id: "700000",
        full_name: "Already Here",
        allotted_adults: 1,
        allotted_children: 0,
        status: "not_arrived",
        source: "master",
      },
    });

    const res = await walkin(req(valid));
    expect(res.status).toBe(409);
    const { error, message } = await res.json();
    expect(error).toBe("exists");
    expect(message).toBeTruthy();

    // Nothing extra was created.
    expect(await prisma.employee.count({ where: { employee_id: "700000" } })).toBe(1);
  });

  it("clamps out-of-range counts", async () => {
    const res = await walkin(req({ ...valid, actual_adults: 9999, actual_children: 2.9 }));
    expect(res.status).toBe(201);
    const { employee } = await res.json();
    expect(employee.actual_adults).toBe(20);
    expect(employee.actual_children).toBe(2);
  });
});
