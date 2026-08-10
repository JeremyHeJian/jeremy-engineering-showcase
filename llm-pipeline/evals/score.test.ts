import { describe, it, expect } from "vitest";
import { score } from "./score";
import type { EvalCase } from "./cases";
import type { InSeasonPhenomenon } from "../grounding/types";

const inSeason: InSeasonPhenomenon[] = [
  { id: 3, slug: "cherry-blossom", name: "Cherry Blossom", category_slug: "flowers", status: "peak", peak_doy: 96, typical_start_doy: 82, typical_end_doy: 116, sightings: 210 },
  { id: 14, slug: "cherry-festival", name: "Cherry Festival", category_slug: "festivals", status: "peak", peak_doy: 100, typical_start_doy: 90, typical_end_doy: 110, sightings: 65 },
  { id: 4, slug: "tulip", name: "Tulip", category_slug: "flowers", status: "early", peak_doy: 112, typical_start_doy: 95, typical_end_doy: 130, sightings: 120 },
  { id: 2, slug: "daffodil", name: "Daffodil", category_slug: "flowers", status: "early", peak_doy: 85, typical_start_doy: 60, typical_end_doy: 110, sightings: 44 },
];

const base: EvalCase = {
  id: 1, date: "2026-04-05", doy: 95, weather: "sunny", offset_days: 0,
  expect_categories: ["flowers", "festivals"], expect_must_include: ["cherry-blossom"],
  expect_absent: ["salmon-run"], weather_sensitive: [], allow_monotype: false,
  sparse: false, note: "",
};

describe("rubric score", () => {
  it("passes a clean pick set (variety + must-include, right count)", () => {
    const reasons = score(base, inSeason, [
      { phenomenon_id: 3, confidence: "high" },
      { phenomenon_id: 14, confidence: "high" },
      { phenomenon_id: 4, confidence: "medium" },
    ], 0);
    expect(reasons).toEqual([]);
  });

  it("flags a missing must-include", () => {
    const reasons = score(base, inSeason, [
      { phenomenon_id: 14, confidence: "high" },
      { phenomenon_id: 4, confidence: "medium" },
      { phenomenon_id: 4, confidence: "medium" },
    ], 0);
    expect(reasons.some((r) => r.includes("missing must-include: cherry-blossom"))).toBe(true);
  });

  it("flags a monotype pick set when variety is required", () => {
    const flowersOnly: EvalCase = { ...base, expect_categories: [], expect_must_include: [] };
    const reasons = score(flowersOnly, inSeason, [
      { phenomenon_id: 3, confidence: "high" },
      { phenomenon_id: 4, confidence: "medium" },
      { phenomenon_id: 2, confidence: "medium" },
    ], 0);
    expect(reasons.some((r) => r.startsWith("monotype"))).toBe(true);
  });

  it("flags hallucinations reported by the grounding filter", () => {
    const reasons = score(base, inSeason, [
      { phenomenon_id: 3, confidence: "high" },
      { phenomenon_id: 14, confidence: "high" },
      { phenomenon_id: 4, confidence: "medium" },
    ], 2);
    expect(reasons).toContain("hallucinated=2");
  });
});
