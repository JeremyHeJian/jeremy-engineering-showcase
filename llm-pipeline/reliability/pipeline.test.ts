import { describe, it, expect } from "vitest";
import { getTodayPicks, type PipelineDeps } from "./pipeline";
import { InMemoryPhenomenonSource } from "../grounding/context";
import { InMemoryCache } from "./cache";
import { InMemoryAuditLog } from "./audit";
import { fakeModel } from "./fake-model";

// A summer date with several phenomena in season (blueberry, farmers-market,
// orca) so the LLM path is exercised; and a deep-winter date with too few.
const SUMMER = () => new Date("2026-07-20T12:00:00Z");
const DEEP_WINTER = () => new Date("2026-01-25T12:00:00Z");

function deps(over: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    phenomena: new InMemoryPhenomenonSource(),
    model: fakeModel(),
    cache: new InMemoryCache(),
    audit: new InMemoryAuditLog(),
    now: SUMMER,
    ...over,
  };
}

describe("getTodayPicks — happy path", () => {
  it("returns an LLM-sourced payload and audits a non-fallback call", async () => {
    const audit = new InMemoryAuditLog();
    const res = await getTodayPicks("vancouver", deps({ audit }));
    expect(res.source).toBe("llm");
    expect(res.cached).toBe(false);
    expect(res.picks.length).toBeGreaterThanOrEqual(3);
    expect(audit.rows.at(-1)?.is_fallback).toBe(false);
  });

  it("serves the cache on the second identical request (idempotent)", async () => {
    const d = deps();
    const first = await getTodayPicks("vancouver", d);
    expect(first.cached).toBe(false);
    const second = await getTodayPicks("vancouver", d);
    expect(second.cached).toBe(true);
    expect(second.picks).toEqual(first.picks);
  });
});

describe("getTodayPicks — degradation is safe", () => {
  it("falls back deterministically when the model throws", async () => {
    const res = await getTodayPicks("vancouver", deps({ model: fakeModel({ throwError: true }) }));
    expect(res.source).toBe("fallback");
    expect(res.picks.length).toBeGreaterThan(0);
  });

  it("drops a hallucinated id and still returns only grounded picks", async () => {
    // Strategy: two real ids from the prompt + one invented id.
    const model = fakeModel({
      strategy: (rows) => [
        { phenomenon_id: rows[0].id, why_now: "x", confidence: "medium" },
        { phenomenon_id: rows[1].id, why_now: "x", confidence: "medium" },
        { phenomenon_id: 999999, why_now: "invented", confidence: "high" },
      ],
    });
    const audit = new InMemoryAuditLog();
    const res = await getTodayPicks("vancouver", deps({ model, audit }));
    expect(res.source).toBe("llm");
    expect(res.picks.map((p) => p.phenomenon_id)).not.toContain(999999);
    expect(audit.rows.at(-1)?.invalid_count).toBe(1);
  });

  it("falls back when fewer than 3 phenomena are in season", async () => {
    const res = await getTodayPicks("vancouver", deps({ now: DEEP_WINTER }));
    expect(res.source).toBe("fallback");
  });

  it("falls back when the daily spend cap is already reached", async () => {
    const audit = new InMemoryAuditLog();
    await audit.insert({
      created_at: SUMMER().toISOString(),
      endpoint: "/api/today",
      region_slug: "vancouver",
      cost_usd: 1.0,
    });
    const res = await getTodayPicks("vancouver", deps({ audit, dailyCostCapUsd: 0.5 }));
    expect(res.source).toBe("fallback");
    expect(audit.rows.at(-1)?.input_context).toMatchObject({
      fallback_reason: expect.stringContaining("budget_cap"),
    });
  });
});
