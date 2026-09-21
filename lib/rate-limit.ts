/**
 * In-memory sliding-window rate limiter.
 *
 * Adequate for a single-node kiosk deployment. If the app is ever scaled
 * horizontally, swap this for a shared store (e.g. Upstash Redis) — the
 * call sites only depend on the `rateLimit()` signature.
 */
import type { NextRequest } from "next/server";

type Bucket = number[]; // timestamps (ms) of recent hits
const store = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Record a hit for `key` and report whether it is within `limit` per
 * `windowMs`. Old timestamps outside the window are pruned on each call.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const bucket = (store.get(key) ?? []).filter((t) => t > cutoff);

  if (bucket.length >= limit) {
    const retryAfterMs = Math.max(0, bucket[0] + windowMs - now);
    store.set(key, bucket);
    return { ok: false, remaining: 0, retryAfterMs };
  }

  bucket.push(now);
  store.set(key, bucket);
  return { ok: true, remaining: limit - bucket.length, retryAfterMs: 0 };
}

/** Clear a key's bucket (e.g. after a successful admin login). */
export function resetRateLimit(key: string): void {
  store.delete(key);
}

/** Best-effort client IP from proxy headers, falling back to a constant. */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
