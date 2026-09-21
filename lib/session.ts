/**
 * Minimal signed-cookie admin session.
 *
 * Token = base64url(payload).base64url(HMAC-SHA256(payload, SESSION_SECRET)).
 * Payload holds an expiry timestamp. No DB or external store needed.
 */
import crypto from "node:crypto";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "fd_admin";
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short (set it in .env).");
  }
  return s;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Create a signed session token valid for 8 hours. */
export function createSessionToken(now: number = Date.now()): string {
  const payload = b64url(JSON.stringify({ exp: now + EIGHT_HOURS_MS }));
  return `${payload}.${sign(payload)}`;
}

/** Verify a token: correct signature (constant-time) and not expired. */
export function verifySessionToken(token: string | undefined | null, now: number = Date.now()): boolean {
  if (!token) return false;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return false;

  const expectedMac = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expectedMac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof exp === "number" && exp > now;
  } catch {
    return false;
  }
}

/** Cookie options for setting the session (httpOnly, Lax, Secure in prod). */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: EIGHT_HOURS_MS / 1000,
  };
}

/** Constant-time PIN comparison against ADMIN_PIN. */
export function checkPin(candidate: string): boolean {
  const expected = process.env.ADMIN_PIN ?? "";
  if (!expected) return false;
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Guard for /api/admin/* handlers. Returns true when the request is authorised. */
export function requireAdmin(req: NextRequest): boolean {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}
