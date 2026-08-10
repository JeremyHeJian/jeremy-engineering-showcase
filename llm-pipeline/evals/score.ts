import type { InSeasonPhenomenon } from "../grounding/types";
import type { EvalCase } from "./cases";

// ── The rubric (structured, NOT an LLM judge) ────────────────────────────────
//
// Returns a list of human-readable reasons a case's picks violated the rubric.
// Empty list == PASS. Everything here is a deterministic assertion over the
// model's output — no model is used to grade another model, so the eval is
// stable and cheap to reason about.
//
// Checks:
//   1. category coverage — at least half the expected categories represented
//   2. must-include — required slugs are actually picked
//   3. in-season membership — required slugs are in the grounding set (case 16)
//   4. absent — out-of-season slugs are never picked
//   5. weather-sensitive confidence — no "high" confidence in rain for
//      weather-sensitive phenomena
//   6. variety — no monotype pick set unless the case allows it
//   7. count + hallucination — 3–5 picks, zero dropped by grounding

export type ScoredPick = { phenomenon_id: number; confidence: string };

export function score(
  c: EvalCase,
  inSeason: InSeasonPhenomenon[],
  picks: ScoredPick[],
  dropped: number,
): string[] {
  const reasons: string[] = [];
  const byId = new Map(inSeason.map((p) => [p.id, p]));
  const pickedSlugs = new Set(
    picks.map((p) => byId.get(p.phenomenon_id)?.slug).filter(Boolean) as string[],
  );
  const pickedCats = picks
    .map((p) => byId.get(p.phenomenon_id)?.category_slug)
    .filter(Boolean) as string[];

  // 7. count + hallucination
  if (picks.length < 3 || picks.length > 5) reasons.push(`count=${picks.length}`);
  if (dropped > 0) reasons.push(`hallucinated=${dropped}`);

  // 1. category coverage — at least ceil(expected/2) represented
  if (c.expect_categories.length > 0) {
    const need = Math.ceil(c.expect_categories.length / 2);
    const hit = c.expect_categories.filter((cat) => pickedCats.includes(cat));
    if (hit.length < need) {
      reasons.push(`category coverage ${hit.length}/${need} (${hit.join(",") || "none"})`);
    }
  }

  // 2. must-include (in the picks)
  for (const slug of c.expect_must_include) {
    if (!pickedSlugs.has(slug)) reasons.push(`missing must-include: ${slug}`);
  }

  // 3. in-season membership (regardless of pick)
  if (c.expect_in_season) {
    const inSlugs = new Set(inSeason.map((p) => p.slug));
    for (const slug of c.expect_in_season) {
      if (!inSlugs.has(slug)) reasons.push(`expect-in-season missing: ${slug}`);
    }
  }

  // 4. absent
  for (const slug of c.expect_absent) {
    if (pickedSlugs.has(slug)) reasons.push(`picked absent: ${slug}`);
  }

  // 5. weather-sensitive confidence
  if (c.weather === "rain" || c.weather === "heavy_rain") {
    for (const p of picks) {
      const slug = byId.get(p.phenomenon_id)?.slug;
      if (slug && c.weather_sensitive.includes(slug) && p.confidence === "high") {
        reasons.push(`${slug} high-confidence in ${c.weather}`);
      }
    }
  }

  // 6. variety
  if (!c.allow_monotype && picks.length >= 3 && new Set(pickedCats).size === 1) {
    reasons.push(`monotype (${pickedCats[0]})`);
  }

  return reasons;
}
