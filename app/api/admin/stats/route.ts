import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { computeSummary, type ExportEmployee } from "@/lib/export";

export const dynamic = "force-dynamic";

// GET /api/admin/stats — tiles + full row data. Session required.
export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const employees = await prisma.employee.findMany({
    orderBy: [{ registered_at: "desc" }, { full_name: "asc" }],
  });

  const asExport: ExportEmployee[] = employees.map((e) => ({
    employee_id: e.employee_id,
    full_name: e.full_name,
    entity: e.entity,
    department: e.department,
    allotted_adults: e.allotted_adults,
    allotted_children: e.allotted_children,
    actual_adults: e.actual_adults,
    actual_children: e.actual_children,
    status: e.status,
    source: e.source,
    registered_at: e.registered_at,
    needs_review: e.needs_review,
  }));

  const s = computeSummary(asExport);

  const rows = employees.map((e) => ({
    id: e.id,
    employee_id: e.employee_id,
    full_name: e.full_name,
    entity: e.entity,
    department: e.department,
    allotted_adults: e.allotted_adults,
    allotted_children: e.allotted_children,
    actual_adults: e.actual_adults,
    actual_children: e.actual_children,
    status: e.status,
    source: e.source,
    registered_at: e.registered_at,
    needs_review: e.needs_review,
  }));

  return NextResponse.json({
    tiles: {
      in_master: s.inMaster,
      checked_in: s.checkedIn,
      not_yet_arrived: s.notYetArrived,
      walk_ins: s.walkIns,
      allotted_adults: s.allottedAdults,
      allotted_children: s.allottedChildren,
      allotted_total: s.allottedTotal,
      actual_adults: s.actualAdults,
      actual_children: s.actualChildren,
      actual_total: s.actualTotal,
      over_allotment: s.overAllotment,
    },
    rows,
  });
}
