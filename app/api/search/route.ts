import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Public search by employee ID prefix or name substring. Returns the allotment
// so staff can see the adult/children split straight from the results list.
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
  // Only search once the guest has typed at least 3 characters.
  if (q.length < 3) {
    return NextResponse.json({ results: [] });
  }

  // Match on employee ID prefix OR name (case-insensitive). No result cap — all
  // matches are returned so nothing is dropped.
  const results = await prisma.employee.findMany({
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
      entity: true,
      department: true,
      allotted_adults: true,
      allotted_children: true,
      status: true,
    },
  });

  return NextResponse.json({ results });
}
