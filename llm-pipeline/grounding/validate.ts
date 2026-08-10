import type { Recommendation } from "../tool-schema/schema";
import type { InSeasonPhenomenon } from "./types";

// ── Mechanism 2 (part b): post-generation grounding filter ───────────────────
//
// The model could only *see* the in-season list, but it can still hallucinate
// an id. Defense in depth: drop any recommendation whose `phenomenon_id` isn't
// in THIS request's context. A hallucinated pick is structurally unable to
// render. `dropped` feeds the hallucination-rate metric (llm_calls.invalid_count).

export type GroundResult = {
  valid: Recommendation[];
  dropped: number;
};

export function validateAndGround(
  recommendations: Recommendation[],
  inSeason: InSeasonPhenomenon[],
): GroundResult {
  const allowed = new Set(inSeason.map((p) => p.id));
  const valid = recommendations.filter((r) => allowed.has(r.phenomenon_id));
  return { valid, dropped: recommendations.length - valid.length };
}
