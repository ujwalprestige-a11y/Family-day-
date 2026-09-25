import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { buildWorkbook, exportFilename, type ExportEmployee } from "@/lib/export";

export const dynamic = "force-dynamic";

// GET /api/admin/export.xlsx — three-sheet workbook download. Session required.
export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const employees = await prisma.employee.findMany({
    orderBy: [{ status: "asc" }, { entity: "asc" }, { full_name: "asc" }],
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

  const wb = await buildWorkbook(asExport);
  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFilename()}"`,
      "Cache-Control": "no-store",
    },
  });
}
