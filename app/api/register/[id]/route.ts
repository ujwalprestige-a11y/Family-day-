import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Status } from "@prisma/client";
import { MAX_ADULTS, MAX_CHILDREN, clampCount, exceedsAllotment } from "@/lib/allotment";

export const dynamic = "force-dynamic";

interface CheckInBody {
  actual_adults?: unknown;
  actual_children?: unknown;
}

/**
 * POST /api/register/:id — check an employee in, recording how many adults and
 * children actually turned up.
 *
 * Unlike the previous Forms-era flow, this is re-runnable: staff can correct the
 * numbers after the fact and the record is updated rather than rejected. Safe
 * for double-taps too, because the body carries absolute counts, not deltas.
 * The original arrival time is preserved across corrections.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: CheckInBody;
  try {
    body = (await req.json()) as CheckInBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Both counts must be present; everything else is clamped into range rather
  // than rejected, since the kiosk only ever sends stepper values.
  if (body.actual_adults == null || body.actual_children == null) {
    return NextResponse.json(
      {
        errors: {
          actual_adults: body.actual_adults == null ? "Required." : undefined,
          actual_children: body.actual_children == null ? "Required." : undefined,
        },
      },
      { status: 422 }
    );
  }

  const actual_adults = clampCount(body.actual_adults, MAX_ADULTS);
  const actual_children = clampCount(body.actual_children, MAX_CHILDREN);

  if (actual_adults + actual_children === 0) {
    return NextResponse.json(
      { errors: { actual_adults: "At least one wristband must be issued." } },
      { status: 422 }
    );
  }

  const alreadyCheckedIn = existing.status === Status.checked_in;

  const employee = await prisma.employee.update({
    where: { id },
    data: {
      actual_adults,
      actual_children,
      status: Status.checked_in,
      // Keep the first arrival time when correcting an existing check-in.
      registered_at: existing.registered_at ?? new Date(),
    },
  });

  return NextResponse.json({
    result: alreadyCheckedIn ? "updated" : "checked_in",
    over_allotment: exceedsAllotment(
      { adults: employee.actual_adults, children: employee.actual_children },
      { adults: employee.allotted_adults, children: employee.allotted_children }
    ),
    employee,
  });
}
