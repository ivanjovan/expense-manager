import "server-only";

/**
 * A fixed-window counter, held in process memory.
 *
 * Scope and honesty about it: this is per *instance*. Under a serverless
 * deployment that fans out across N warm instances the effective ceiling is
 * N times the configured one, and a cold start forgets everything. That is
 * an acceptable trade for what this actually defends — a household app whose
 * users are all invited by the owner — where the realistic failure is a
 * retry loop or a stuck client burning paid vision-API calls, not a
 * distributed attacker. Moving to a shared store (Upstash Redis via the
 * Marketplace) is a drop-in replacement for `hit()` if that ever changes.
 *
 * Deliberately not a dependency: one Map and a sweep is the whole thing.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Sweep no more than once a minute; the Map is tiny at household scale. */
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Whole seconds until the window resets. 0 when allowed. */
  retryAfterSeconds: number;
  remaining: number;
}

/**
 * Records one attempt against `key` and reports whether it is within budget.
 * Always counts the attempt, including the rejected ones — otherwise a
 * caller that keeps hammering resets nothing and simply waits out the window
 * while still being told "no", which is the intended behaviour.
 */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0, remaining: limit - 1 };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return {
    allowed,
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    remaining: Math.max(0, limit - existing.count),
  };
}

/**
 * Applies several windows to the same subject — a short one to stop a runaway
 * loop and a long one to cap the daily spend. Reports the first rejection.
 */
export function hitAll(
  subject: string,
  windows: { name: string; limit: number; windowMs: number }[],
  now = Date.now()
): RateLimitResult {
  let worst: RateLimitResult = { allowed: true, retryAfterSeconds: 0, remaining: Number.MAX_SAFE_INTEGER };
  for (const window of windows) {
    const result = hit(`${window.name}:${subject}`, window.limit, window.windowMs, now);
    if (!result.allowed && worst.allowed) worst = result;
    else if (result.allowed && worst.allowed) {
      worst = { ...worst, remaining: Math.min(worst.remaining, result.remaining) };
    }
  }
  return worst;
}

/** Test seam — buckets are module state and would leak between cases. */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweep = 0;
}
