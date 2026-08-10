import type { PhenomStatus } from "./types";

// Deterministic in-season computation.
//
// In production this lives in PostgreSQL (a `phenomena_in_season_at(region,
// date, offset)` RPC that is weather-offset-, wrap-, and peak-window-aware).
// This is a sanitized, dependency-free reimplementation of that logic so the
// grounding retrieval — and therefore the whole pipeline and the eval harness —
// runs offline. The rule is intentionally simple and fully documented; the
// point of the showcase is the *reliability scaffolding around* retrieval, not
// the phenology model itself.

export type Phenology = {
  typical_start_doy: number;
  peak_doy: number | null;
  typical_end_doy: number;
};

const DAYS_IN_YEAR = 365;

// Is `doy` inside [start, end], treating start > end as a wrap across the year
// boundary (e.g. bald eagles: start 335 → end 30)?
function withinWindow(doy: number, start: number, end: number): boolean {
  if (start <= end) return doy >= start && doy <= end;
  return doy >= start || doy <= end; // wraps the new year
}

// Circular distance between two days-of-year (0..182).
function circularDistance(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, DAYS_IN_YEAR - raw);
}

function windowLength(start: number, end: number): number {
  return start <= end ? end - start : DAYS_IN_YEAR - start + end;
}

/**
 * Returns the in-season status for a phenomenon on a given day-of-year, or
 * `null` if it is out of season.
 *
 * `offsetDays` models a region whose season is running early (negative) or late
 * (positive) this year — e.g. an unusually warm spring pulls blooms forward. We
 * apply it by shifting the *observation* day, matching the production RPC.
 *
 * Status bands:
 *   - "peak"  when within a peak band around `peak_doy`
 *   - "early" before the peak band, "late" after it
 */
export function inSeasonStatus(
  phenology: Phenology,
  doy: number,
  offsetDays: number,
): PhenomStatus | null {
  const { typical_start_doy: start, typical_end_doy: end, peak_doy } = phenology;

  // A season "running 8 days early" (offset -8) means a phenomenon nominally
  // starting on day 100 is effectively present from day 92. Equivalent to
  // asking whether (doy - offset) falls in the nominal window.
  const adjusted = ((doy - offsetDays) % DAYS_IN_YEAR + DAYS_IN_YEAR) % DAYS_IN_YEAR;

  if (!withinWindow(adjusted, start, end)) return null;

  const peak = peak_doy ?? Math.round((start + windowLength(start, end) / 2) % DAYS_IN_YEAR);
  const len = windowLength(start, end);
  const peakBand = Math.max(3, Math.round(len * 0.15));

  if (circularDistance(adjusted, peak) <= peakBand) return "peak";

  // Before peak (walking forward from start reaches the day before it reaches
  // peak) → early; otherwise late.
  const distFromStart = windowLength(start, adjusted);
  const distStartToPeak = windowLength(start, peak);
  return distFromStart < distStartToPeak ? "early" : "late";
}
