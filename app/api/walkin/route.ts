import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Status, Source } from "@prisma/client";
import { isNonEmptyName, isValidEmployeeId } from "@/lib/validation";
import { MAX_ADULTS, MAX_CHILDREN, clampCount } from "@/lib/allotment";

export const dynamic = "force-dynamic";

interface WalkinBody {
  employee_id?: string;
  full_name?: string;
  entity?: string;
  department?: string;
  actual_adults?: unknown;
  actual_children?: unknown;
}

/**
 * POST /api/walkin — add someone who is not in the master list and check them
 * in immediately. They have no allotment (allotted_* stays 0), so every
 * wristband issued shows as over-allotment in the export, which is the point:
 * these are the extras the organisers did not plan for.
 */
export async function POST(req: NextRequest) {
  let body: WalkinBody;
  try {
    body = (await req.json()) as WalkinBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const employee_id = (body.employee_id ?? "").trim();
  const full_name = (body.full_name ?? "").trim();
  const entity = (body.entity ?? "").trim();
  const department = (body.department ?? "").trim();

  const errors: Record<string, string> = {};
  if (!employee_id) errors.employee_id = "Enter the employee ID.";
  else if (!isValidEmployeeId(employee_id))
    errors.employee_id = "Employee ID must be exactly 6 digits.";
  if (!isNonEmptyName(full_name)) errors.full_name = "Enter the full name.";

  const actual_adults = clampCount(body.actual_adults, MAX_ADULTS);
  const actual_children = clampCount(body.actual_children, MAX_CHILDREN);
  if (actual_adults + actual_children === 0) {
    errors.actual_adults = "At least one wristband must be issued.";
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 422 });
  }

  const clash = await prisma.employee.findFirst({ where: { employee_id } });
  if (clash) {
    return NextResponse.json(
      {
        error: "exists",
        message: "This ID is already in the list. Please search for it on the first screen.",
      },
      { status: 409 }
    );
  }

  const employee = await prisma.employee.create({
    data: {
      employee_id,
      full_name,
      entity,
      department,
      allotted_adults: 0,
      allotted_children: 0,
      actual_adults,
      actual_children,
      status: Status.checked_in,
      source: Source.walk_in,
      registered_at: new Date(),
      needs_review: false,
    },
  });

  return NextResponse.json({ result: "walkin", employee }, { status: 201 });
}
