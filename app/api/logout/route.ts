import { NextResponse } from "next/server";
import { APP_SESSION_COOKIE, appSessionCookieOptions } from "@/lib/app-session";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export const dynamic = "force-dynamic";
export const preferredRegion = "bom1"; // run in Mumbai, next to the Supabase DB

// POST /api/logout — clears the app-gate cookie. The admin cookie is cleared
// too, so handing the device to someone else leaves no session behind.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(APP_SESSION_COOKIE, "", { ...appSessionCookieOptions(), maxAge: 0 });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
