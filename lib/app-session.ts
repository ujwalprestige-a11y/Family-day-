/**
 * Device-level app gate.
 *
 * Staff sign in once per device at /login with a static username + password;
 * that issues a signed cookie which `middleware.ts` checks on every request.
 *
 * Deliberately separate from the `fd_admin` admin session in lib/session.ts —
 * unlocking a kiosk must NOT grant access to the admin dashboard. Two cookies,
 * two independent gates.
 *
 * Implemented with Web Crypto (crypto.subtle) rather than node:crypto so the
 * exact same code runs in middleware (Edge runtime) and in route handlers
 * (Node runtime). That is why every function here is async.
 */

export const APP_SESSION_COOKIE = "fd_app";

/** Long enough to cover a full event day on one sign-in. */
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

const encoder = new TextEncoder();

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short (set it in .env).");
  }
  return s;
}

/* ------------------------------ base64url ------------------------------ */
/* btoa/atob are used instead of Buffer because Buffer is not guaranteed in
   the Edge runtime. */

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlEncode(text: string): string {
  return bytesToB64url(encoder.encode(text));
}

function b64urlDecode(text: string): string {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* -------------------------------- signing ------------------------------ */

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function sign(payload: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(payload));
  return bytesToB64url(new Uint8Array(mac));
}

/**
 * Length-independent comparison that does not short-circuit on the first
 * differing byte, so a caller cannot learn the expected value from timing.
 */
export function safeEqual(a: string, b: string): boolean {
  const ea = encoder.encode(a);
  const eb = encoder.encode(b);
  let diff = ea.length ^ eb.length;
  const len = Math.max(ea.length, eb.length);
  for (let i = 0; i < len; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/* -------------------------------- tokens ------------------------------- */

/** Create a signed app-gate token valid for 12 hours. */
export async function createAppSessionToken(now: number = Date.now()): Promise<string> {
  const payload = b64urlEncode(JSON.stringify({ exp: now + TWELVE_HOURS_MS }));
  return `${payload}.${await sign(payload)}`;
}

/** Verify a token: correct signature and not expired. */
export async function verifyAppSessionToken(
  token: string | undefined | null,
  now: number = Date.now()
): Promise<boolean> {
  if (!token) return false;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return false;

  if (!safeEqual(mac, await sign(payload))) return false;

  try {
    const { exp } = JSON.parse(b64urlDecode(payload));
    return typeof exp === "number" && exp > now;
  } catch {
    return false;
  }
}

/** Cookie options for the app gate (httpOnly, Lax, Secure in production). */
export function appSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TWELVE_HOURS_MS / 1000,
  };
}

/* ----------------------------- credentials ----------------------------- */

/** True when both AUTH_USERNAME and AUTH_PASSWORD are set on the server. */
export function isAuthConfigured(): boolean {
  return Boolean(process.env.AUTH_USERNAME && process.env.AUTH_PASSWORD);
}

/**
 * Compare submitted credentials against AUTH_USERNAME / AUTH_PASSWORD.
 *
 * Fails closed when either is unset — an unconfigured server locks everyone
 * out rather than letting everyone in. The username is case-insensitive; the
 * password is compared exactly. Both comparisons always run so the result
 * does not reveal which half was wrong.
 */
export function checkCredentials(username: string, password: string): boolean {
  if (!isAuthConfigured()) return false;
  const expectedUser = (process.env.AUTH_USERNAME ?? "").trim().toLowerCase();
  const expectedPass = process.env.AUTH_PASSWORD ?? "";

  const userOk = safeEqual(username.trim().toLowerCase(), expectedUser);
  const passOk = safeEqual(password, expectedPass);
  return userOk && passOk;
}
