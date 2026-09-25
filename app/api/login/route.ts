import { NextRequest, NextResponse } from "next/server";
import {
  APP_SESSION_COOKIE,
  appSessionCookieOptions,
  checkCredentials,
  createAppSessionToken,
  isAuthConfigured,
} from "@/lib/app-session";
import { rateLimit, resetRateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// POST /api/login { username, password } — checks the static credentials and
// sets the httpOnly app-gate cookie. Rate-limited per IP; success clears the
// counter so a staff member who mistypes a few times is not locked out.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const key = `applogin:${ip}`;

  const rl = rateLimit(key, 10, 5 * 60 * 1000); // 10 attempts / 5 min
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many attempts. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  if (!isAuthConfigured()) {
    console.error("[login] AUTH_USERNAME / AUTH_PASSWORD are not set — sign-in cannot succeed.");
    return NextResponse.json(
      { error: "not_configured", message: "Sign-in is not configured on the server." },
      { status: 503 }
    );
  }

  let username = "";
  let password = "";
  try {
    const body = (await req.json()) as { username?: string; password?: string };
    username = String(body.username ?? "");
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!checkCredentials(username, password)) {
    return NextResponse.json(
      { error: "bad_credentials", message: "Incorrect username or password." },
      { status: 401 }
    );
  }

  let token: string;
  try {
    token = await createAppSessionToken();
  } catch (err) {
    console.error("[login] Could not create a session token:", err);
    return NextResponse.json(
      { error: "not_configured", message: "Sign-in is not configured on the server." },
      { status: 503 }
    );
  }

  resetRateLimit(key);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(APP_SESSION_COOKIE, token, appSessionCookieOptions());
  return res;
}
