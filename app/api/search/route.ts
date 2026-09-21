import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Public search: min 2 chars, prefix on ID or contains on name, max 8 results,
// masked mobile only. Rate-limited per client IP.
export async function GET(req: NextRequest) {
  // Generous per-IP limit: a venue may have ~70 devices behind one public IP,
  // each firing debounced searches. This guards against abuse without blocking
  // legitimate desk traffic.
  const ip = clientIp(req);
  const limit = rateLimit(`search:${ip}`, 600, 10_000); // 600 requests / 10s
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } }
    );
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  // Only search once the guest has typed at least 4 characters.
  if (q.length < 4) {
    return NextResponse.json({ results: [] });
  }

  // Match on employee ID prefix OR name (case-insensitive). No result cap — all
  // matches are returned so nothing is dropped.
  const rows = await prisma.employee.findMany({
    where: {
      OR: [
        { employee_id: { startsWith: q } },
        { full_name: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { full_name: "asc" },
    select: {
      id: true,
      employee_id: true,
      full_name: true,
      marital_status: true,
      mobile: true,
      status: true,
    },
  });

  const results = rows.map((r) => ({
    id: r.id,
    employee_id: r.employee_id,
    full_name: r.full_name,
    marital_status: r.marital_status,
    mobile: r.mobile,
    status: r.status,
  }));

  return NextResponse.json({ results });
}
