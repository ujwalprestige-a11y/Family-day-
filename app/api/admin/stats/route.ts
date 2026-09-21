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
    email: e.email,
    mobile: e.mobile,
    marital_status: e.marital_status,
    family_members: e.family_members,
    paid_extended: e.paid_extended,
    wristbands_total: e.wristbands_total,
    status: e.status,
    source: e.source,
    edited_fields: e.edited_fields,
    registered_at: e.registered_at,
  }));

  const s = computeSummary(asExport);

  const rows = employees.map((e) => ({
    id: e.id,
    employee_id: e.employee_id,
    full_name: e.full_name,
    email: e.email,
    mobile: e.mobile,
    marital_status: e.marital_status,
    family_members: e.family_members,
    paid_extended: e.paid_extended,
    wristbands_total: e.wristbands_total,
    status: e.status,
    source: e.source,
    edited_fields: Array.isArray(e.edited_fields) ? e.edited_fields : [],
    needs_review: e.needs_review,
    registered_at: e.registered_at,
  }));

  return NextResponse.json({
    tiles: {
      in_master: s.inMaster,
      pre_registered: s.preRegistered,
      walk_ins: s.walkIns,
      not_yet_arrived: s.notYetArrived,
      wristbands_issued: s.wristbandsIssued,
      amount_to_collect: s.amountToCollect,
    },
    rows,
  });
}
