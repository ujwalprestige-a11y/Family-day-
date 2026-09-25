import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Full record for a single employee, fetched after a guest is picked from the
// search results. No contact details are stored any more, so this returns only
// the name, org context and wristband allotment.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const employee = await prisma.employee.findUnique({ where: { id } });

  if (!employee) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ employee });
}
