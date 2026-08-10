import type { WeatherBucket } from "../grounding/types";

// ── Mechanism 3: the eval corpus ─────────────────────────────────────────────
//
// 17 cases spanning the calendar year, weather conditions, and edge cases
// (season boundaries, empty result sets, conflicting signals, a leap year, a
// strong climate offset). Each is scored against a FIXED rubric — deliberately
// NOT an LLM judge (see score.ts). The harness runs the real prompt + forced
// tool call. No prompt or tool change ships without a green run.

export type EvalCase = {
  id: number;
  date: string;
  doy: number;
  weather: WeatherBucket;
  offset_days: number;
  expect_categories: string[];
  expect_must_include: string[]; // must appear in the LLM's picks
  expect_in_season?: string[]; // must be in the in-season set (not necessarily picked)
  expect_absent: string[];
  weather_sensitive: string[];
  allow_monotype: boolean;
  sparse: boolean;
  note: string;
};

export const CASES: EvalCase[] = [
  { id: 1, date: "2026-04-05", doy: 95, weather: "sunny", offset_days: 0, expect_categories: ["flowers", "festivals"], expect_must_include: ["cherry-blossom"], expect_absent: ["fall-maple", "salmon-run", "pumpkin-patch", "sunflower"], weather_sensitive: [], allow_monotype: false, sparse: false, note: "cherry peak, sunny" },
  { id: 2, date: "2026-04-10", doy: 100, weather: "heavy_rain", offset_days: 0, expect_categories: ["flowers"], expect_must_include: ["cherry-blossom"], expect_absent: ["salmon-run"], weather_sensitive: ["orca-humpback"], allow_monotype: true, sparse: false, note: "cherry season, heavy rain" },
  { id: 3, date: "2026-02-08", doy: 39, weather: "cloudy", offset_days: 0, expect_categories: ["flowers"], expect_must_include: ["crocus"], expect_absent: ["cherry-blossom", "salmon-run", "sunflower", "blueberry-upick"], weather_sensitive: [], allow_monotype: true, sparse: true, note: "early spring sparse" },
  { id: 4, date: "2026-05-15", doy: 135, weather: "sunny", offset_days: 0, expect_categories: ["flowers", "markets"], expect_must_include: ["rhododendron"], expect_absent: ["fall-maple", "pumpkin-patch", "salmon-run"], weather_sensitive: [], allow_monotype: false, sparse: false, note: "spring flower glut, variety" },
  { id: 5, date: "2026-06-12", doy: 163, weather: "cloudy", offset_days: 5, expect_categories: ["flowers", "markets", "wildlife"], expect_must_include: ["peony"], expect_absent: ["cherry-blossom", "fall-maple", "pumpkin-patch"], weather_sensitive: ["orca-humpback"], allow_monotype: false, sparse: false, note: "early summer mix" },
  { id: 6, date: "2026-07-20", doy: 201, weather: "sunny", offset_days: 0, expect_categories: ["food", "markets", "wildlife"], expect_must_include: ["blueberry-upick"], expect_absent: ["cherry-blossom", "salmon-run", "snow-geese"], weather_sensitive: [], allow_monotype: false, sparse: false, note: "high summer" },
  { id: 7, date: "2026-08-25", doy: 237, weather: "sunny", offset_days: 0, expect_categories: ["flowers", "markets"], expect_must_include: ["sunflower"], expect_absent: ["cherry-blossom", "crocus", "pumpkin-patch"], weather_sensitive: [], allow_monotype: false, sparse: false, note: "late summer" },
  { id: 8, date: "2026-09-20", doy: 263, weather: "cloudy", offset_days: 7, expect_categories: ["food", "markets"], expect_must_include: ["apple-orchard"], expect_absent: ["cherry-blossom", "tulip", "herring-spawn"], weather_sensitive: [], allow_monotype: false, sparse: false, note: "early autumn transition" },
  { id: 9, date: "2026-10-22", doy: 295, weather: "sunny", offset_days: 7, expect_categories: ["foliage", "wildlife", "food"], expect_must_include: ["fall-maple", "salmon-run"], expect_absent: ["cherry-blossom", "tulip", "sunflower"], weather_sensitive: [], allow_monotype: false, sparse: false, note: "peak fall foliage" },
  { id: 10, date: "2026-10-28", doy: 301, weather: "rain", offset_days: 0, expect_categories: ["wildlife", "foliage"], expect_must_include: ["salmon-run"], expect_absent: ["cherry-blossom", "sunflower"], weather_sensitive: ["snow-geese"], allow_monotype: false, sparse: false, note: "autumn rain; salmon fine in rain" },
  { id: 11, date: "2026-11-18", doy: 322, weather: "cloudy", offset_days: 0, expect_categories: ["wildlife"], expect_must_include: ["snow-geese"], expect_absent: ["cherry-blossom", "tulip", "blueberry-upick"], weather_sensitive: [], allow_monotype: false, sparse: false, note: "late autumn" },
  { id: 12, date: "2026-12-28", doy: 362, weather: "sunny", offset_days: 0, expect_categories: ["wildlife", "festivals"], expect_must_include: ["bald-eagle"], expect_absent: ["cherry-blossom", "salmon-run", "sunflower"], weather_sensitive: [], allow_monotype: false, sparse: false, note: "year-end wrap window (bald eagle 335→30, winter-lights wrap)" },
  { id: 13, date: "2026-03-22", doy: 81, weather: "heavy_rain", offset_days: -8, expect_categories: ["flowers"], expect_must_include: ["daffodil"], expect_absent: ["fall-maple", "salmon-run", "blueberry-upick"], weather_sensitive: [], allow_monotype: true, sparse: false, note: "rainy early spring + small offset" },
  { id: 14, date: "2026-01-25", doy: 25, weather: "cloudy", offset_days: 0, expect_categories: [], expect_must_include: [], expect_absent: ["cherry-blossom", "tulip", "salmon-run", "sunflower"], weather_sensitive: [], allow_monotype: true, sparse: true, note: "very sparse -> fallback" },
  { id: 15, date: "2026-05-28", doy: 148, weather: "sunny", offset_days: 0, expect_categories: ["flowers", "wildlife", "markets"], expect_must_include: ["iris"], expect_absent: ["cherry-blossom", "fall-maple", "pumpkin-patch"], weather_sensitive: [], allow_monotype: false, sparse: false, note: "late spring mix incl wildlife" },
  { id: 16, date: "2028-07-04", doy: 186, weather: "sunny", offset_days: 0, expect_categories: ["food", "markets", "wildlife"], expect_must_include: [], expect_in_season: ["blueberry-upick"], expect_absent: ["cherry-blossom", "fall-maple", "pumpkin-patch", "salmon-run"], weather_sensitive: [], allow_monotype: false, sparse: false, note: "LEAP YEAR — assert blueberry IS in season, not that the model must pick it among many summer options" },
  { id: 17, date: "2026-03-05", doy: 64, weather: "sunny", offset_days: -18, expect_categories: ["flowers"], expect_must_include: ["cherry-blossom"], expect_absent: ["fall-maple", "salmon-run", "sunflower", "blueberry-upick"], weather_sensitive: [], allow_monotype: true, sparse: false, note: "STRONG OFFSET — cherry pulled into season early" },
];
