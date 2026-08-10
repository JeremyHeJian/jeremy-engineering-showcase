import { describe, it, expect } from "vitest";
import { validateAndGround } from "./validate";
import type { InSeasonPhenomenon } from "./types";
import type { Recommendation } from "../tool-schema/schema";

const inSeason: InSeasonPhenomenon[] = [
  { id: 3, slug: "cherry-blossom", name: "Cherry Blossom", category_slug: "flowers", status: "peak", peak_doy: 96, typical_start_doy: 82, typical_end_doy: 116, sightings: 210 },
  { id: 4, slug: "tulip", name: "Tulip", category_slug: "flowers", status: "early", peak_doy: 112, typical_start_doy: 95, typical_end_doy: 130, sightings: 120 },
];

const rec = (id: number): Recommendation => ({
  phenomenon_id: id,
  why_now: "x",
  confidence: "medium",
});

describe("validateAndGround", () => {
  it("keeps recommendations whose id is in the grounding set", () => {
    const { valid, dropped } = validateAndGround([rec(3), rec(4)], inSeason);
    expect(valid.map((r) => r.phenomenon_id)).toEqual([3, 4]);
    expect(dropped).toBe(0);
  });

  it("drops a hallucinated id not present in the grounding set", () => {
    const { valid, dropped } = validateAndGround([rec(3), rec(999)], inSeason);
    expect(valid.map((r) => r.phenomenon_id)).toEqual([3]);
    expect(dropped).toBe(1);
  });

  it("drops everything when the model invents all ids", () => {
    const { valid, dropped } = validateAndGround([rec(101), rec(102)], inSeason);
    expect(valid).toHaveLength(0);
    expect(dropped).toBe(2);
  });
});
