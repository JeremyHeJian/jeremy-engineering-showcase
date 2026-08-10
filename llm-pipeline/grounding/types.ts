// Domain types shared across the pipeline — the LLM path, the deterministic
// fallback, the cache, and the eval harness all speak these shapes.
//
// In production (inseasons.app) these are backed by PostgreSQL rows whose
// in-season `status` is computed in SQL (weather-offset-, wrap-, and
// peak-window-aware). Here the same shapes are populated by an in-memory source
// (see `sample-data.ts` + `in-season.ts`) so the whole pipeline runs offline.

export type PhenomStatus = "early" | "peak" | "late";

export const CONFIDENCE_VALUES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCE_VALUES)[number];

// A natural phenomenon (bloom, market, wildlife run, festival) that is in
// season *right now* for a given region. This is the grounding set: the model
// may only pick from these, by `id`.
export type InSeasonPhenomenon = {
  id: number;
  slug: string;
  name: string;
  category_slug: string;
  status: PhenomStatus;
  peak_doy: number | null;
  typical_start_doy: number;
  typical_end_doy: number;
  sightings: number;
  hero_image_url?: string | null;
  category_name?: string;
};

export type WeatherBucket = "sunny" | "cloudy" | "rain" | "heavy_rain";

export type WeatherNow = {
  bucket: WeatherBucket;
  tempC: number | null;
  description: string | null;
};

// Everything the model needs, assembled and grounded in real data (Step 1).
export type TodayContext = {
  region: { slug: string; name: string; offsetDays: number };
  today: string; // yyyy-MM-dd
  doy: number; // day-of-year
  weather: WeatherNow | null;
  inSeason: InSeasonPhenomenon[];
};

// Client-facing shapes. The cached payload is byte-for-byte what we return, so
// this type is the contract for the LLM path, the fallback path, and the cache.
export type TodayPick = {
  phenomenon_id: number;
  slug: string;
  name: string;
  category_slug: string;
  category_name: string;
  status: PhenomStatus;
  hero_image_url: string | null;
  why_now: string;
  confidence: Confidence;
};

export type TodayPayload = {
  region: string;
  today: string; // yyyy-MM-dd
  doy: number;
  weather: string | null; // weather bucket
  source: "llm" | "fallback";
  picks: TodayPick[];
};
