import { NextRequest, NextResponse } from "next/server";
import { checkPin, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { rateLimit, resetRateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const preferredRegion = "bom1"; // run in Mumbai, next to the Supabase DB

// POST /api/admin/login { pin } — sets an httpOnly session cookie on success.
// Rate-limited per IP; a successful login clears the counter.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const key = `login:${ip}`;

  const rl = rateLimit(key, 8, 5 * 60 * 1000); // 8 attempts / 5 min
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many attempts. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  let pin = "";
  try {
    const body = (await req.json()) as { pin?: string };
    pin = String(body.pin ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!checkPin(pin)) {
    return NextResponse.json({ error: "bad_pin", message: "That PIN is not correct." }, { status: 401 });
  }

  resetRateLimit(key);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions());
  return res;
}
