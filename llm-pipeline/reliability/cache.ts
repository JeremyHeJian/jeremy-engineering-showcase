import type { TodayPayload } from "../grounding/types";

// ── Mechanism 4 (part b): response cache ─────────────────────────────────────
//
// (date × weather bucket × region) response cache. Both read and write are
// best-effort: if the store errors, we degrade to "no cache" rather than
// failing the request.
//
// Only successful LLM payloads are cached (24h TTL). Fallback payloads are NOT
// cached — they're free to recompute, and caching them would serve a degraded
// result all day after a transient LLM outage instead of retrying the model on
// the next request.

export const CACHE_TTL_HOURS = 24;

export interface CacheStore {
  get(key: string): Promise<TodayPayload | null>;
  set(key: string, payload: TodayPayload, ttlMs: number): Promise<void>;
}

export function cacheKey(
  date: string,
  bucket: string | null,
  regionSlug: string,
): string {
  return `today:${date}:${bucket ?? "unknown"}:${regionSlug}`;
}

// In-memory adapter with expiry. Production backs this with a Postgres table
// (`today_cache`, keyed by the same string, with an `expires_at` column).
export class InMemoryCache implements CacheStore {
  private readonly store = new Map<string, { payload: TodayPayload; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string): Promise<TodayPayload | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= this.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.payload;
  }

  async set(key: string, payload: TodayPayload, ttlMs: number): Promise<void> {
    this.store.set(key, { payload, expiresAt: this.now() + ttlMs });
  }
}

// Wrappers that swallow errors so a cache failure can never break the response.
export async function readCache(
  store: CacheStore,
  key: string,
): Promise<TodayPayload | null> {
  try {
    return await store.get(key);
  } catch {
    return null;
  }
}

export async function writeCache(
  store: CacheStore,
  key: string,
  payload: TodayPayload,
): Promise<void> {
  try {
    await store.set(key, payload, CACHE_TTL_HOURS * 3600 * 1000);
  } catch {
    // best-effort — a cache write failure must not break the response
  }
}
