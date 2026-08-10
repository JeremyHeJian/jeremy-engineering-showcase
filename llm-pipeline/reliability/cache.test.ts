import { describe, it, expect } from "vitest";
import { InMemoryCache, cacheKey, CACHE_TTL_HOURS } from "./cache";
import type { TodayPayload } from "../grounding/types";

const payload: TodayPayload = {
  region: "vancouver",
  today: "2026-07-20",
  doy: 201,
  weather: "sunny",
  source: "llm",
  picks: [],
};

describe("InMemoryCache", () => {
  it("builds a stable, human-readable key", () => {
    expect(cacheKey("2026-07-20", "sunny", "vancouver")).toBe("today:2026-07-20:sunny:vancouver");
    expect(cacheKey("2026-07-20", null, "vancouver")).toBe("today:2026-07-20:unknown:vancouver");
  });

  it("returns a stored payload before expiry and null after", async () => {
    let clock = 1_000_000;
    const cache = new InMemoryCache(() => clock);
    const key = cacheKey(payload.today, payload.weather, payload.region);

    await cache.set(key, payload, CACHE_TTL_HOURS * 3600 * 1000);
    expect(await cache.get(key)).toEqual(payload);

    clock += (CACHE_TTL_HOURS + 1) * 3600 * 1000; // advance past TTL
    expect(await cache.get(key)).toBeNull();
  });
});
