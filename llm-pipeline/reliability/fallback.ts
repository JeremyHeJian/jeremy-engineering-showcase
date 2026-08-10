import type {
  InSeasonPhenomenon,
  TodayContext,
  TodayPick,
  TodayPayload,
} from "../grounding/types";

// ── Mechanism 4 (part a): deterministic non-LLM fallback ─────────────────────
//
// Used when the LLM times out / errors / 429s, returns 0 valid recs after
// grounding, or there are too few in-season phenomena to ask the model. It runs
// entirely on ctx.inSeason (already in memory from Step 1), so it costs nothing
// extra and never fails. The feature degrades, never breaks.
//
// Ranking: peak before early before late; within a status, nearest to peak_doy;
// ties broken by recent sightings. Take the top 5 (fewer if the season is
// sparse — that's the honest floor, not padded to a minimum).

function statusScore(s: InSeasonPhenomenon["status"]): number {
  if (s === "peak") return 0;
  if (s === "early") return 1;
  return 2; // late
}

export function fallbackPicks(ctx: TodayContext): TodayPick[] {
  const FAR = 1_000;
  return [...ctx.inSeason]
    .sort((a, b) => {
      const ds = statusScore(a.status) - statusScore(b.status);
      if (ds !== 0) return ds;
      const da = a.peak_doy != null ? Math.abs(ctx.doy - a.peak_doy) : FAR;
      const db = b.peak_doy != null ? Math.abs(ctx.doy - b.peak_doy) : FAR;
      if (da !== db) return da - db;
      return b.sightings - a.sightings;
    })
    .slice(0, 5)
    .map((p) => ({
      phenomenon_id: p.id,
      slug: p.slug,
      name: p.name,
      category_slug: p.category_slug,
      category_name: p.category_name ?? p.category_slug,
      status: p.status,
      hero_image_url: p.hero_image_url ?? null,
      why_now: "Currently in season.",
      confidence: "medium" as const,
    }));
}

export function buildFallbackPayload(
  ctx: TodayContext,
  bucket: string | null,
): TodayPayload {
  return {
    region: ctx.region.slug,
    today: ctx.today,
    doy: ctx.doy,
    weather: bucket,
    source: "fallback",
    picks: fallbackPicks(ctx),
  };
}
