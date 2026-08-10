import type {
  InSeasonPhenomenon,
  TodayContext,
  WeatherNow,
} from "./types";
import { inSeasonStatus } from "./in-season";
import {
  PHENOMENA,
  REGIONS,
  type PhenomenonRecord,
  type Region,
} from "./sample-data";

// ── Mechanism 2 (part a): SQL-grounded retrieval ─────────────────────────────
//
// Step 1 of the pipeline: assemble everything the LLM needs, grounded in real
// data. The model can ONLY choose from records that are actually in season
// right now — nothing else is ever put in front of it.
//
// Retrieval is behind a port (`PhenomenonSource`) so the pipeline doesn't care
// whether the in-season set comes from Postgres (production) or the in-memory
// dataset (here). Swapping the adapter is the only change needed to run against
// a real database.

export class UnknownRegionError extends Error {}

export interface PhenomenonSource {
  getRegion(slug: string): Promise<Region | null>;
  /** Every phenomenon in season for the region on the given day-of-year. */
  listInSeason(regionSlug: string, doy: number): Promise<InSeasonPhenomenon[]>;
}

const IN_SEASON_ORDER = { peak: 0, early: 1, late: 2 } as const;

// In-memory adapter over the sanitized dataset. Production replaces this with a
// Supabase RPC call (`region_phenomena_list`) whose status column is already
// weather-offset-, wrap-, and peak-window-aware.
export class InMemoryPhenomenonSource implements PhenomenonSource {
  constructor(
    private readonly regions: Region[] = REGIONS,
    private readonly phenomena: PhenomenonRecord[] = PHENOMENA,
  ) {}

  async getRegion(slug: string): Promise<Region | null> {
    return this.regions.find((r) => r.slug === slug) ?? null;
  }

  async listInSeason(
    regionSlug: string,
    doy: number,
  ): Promise<InSeasonPhenomenon[]> {
    const region = await this.getRegion(regionSlug);
    if (!region) return [];
    const offset = region.season_offset_days;

    const rows: InSeasonPhenomenon[] = [];
    for (const p of this.phenomena) {
      const status = inSeasonStatus(p, doy, offset);
      if (!status) continue;
      rows.push({
        id: p.id,
        slug: p.slug,
        name: p.name,
        category_slug: p.category_slug,
        category_name: p.category_name,
        status,
        peak_doy: p.peak_doy,
        typical_start_doy: p.typical_start_doy,
        typical_end_doy: p.typical_end_doy,
        sightings: p.sightings,
        hero_image_url: p.hero_image_url,
      });
    }
    rows.sort(
      (a, b) =>
        IN_SEASON_ORDER[a.status] - IN_SEASON_ORDER[b.status] ||
        b.sightings - a.sightings,
    );
    return rows;
  }
}

// Weather retrieval is a separate port — in production it hits a forecast API;
// in tests it's injected. `null` means "unknown", which the prompt handles.
export interface WeatherSource {
  getCurrent(regionSlug: string): Promise<WeatherNow | null>;
}

export const NO_WEATHER: WeatherSource = {
  async getCurrent() {
    return null;
  },
};

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const diff = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start;
  return Math.floor(diff / 86_400_000);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function buildTodayContext(
  regionSlug: string,
  deps: { phenomena: PhenomenonSource; weather?: WeatherSource; now?: Date },
): Promise<TodayContext> {
  const region = await deps.phenomena.getRegion(regionSlug);
  if (!region) throw new UnknownRegionError(`Unknown region: ${regionSlug}`);

  const now = deps.now ?? new Date();
  const doy = dayOfYear(now);

  const [inSeason, weather] = await Promise.all([
    deps.phenomena.listInSeason(regionSlug, doy),
    (deps.weather ?? NO_WEATHER).getCurrent(regionSlug),
  ]);

  return {
    region: {
      slug: region.slug,
      name: region.name,
      offsetDays: region.season_offset_days,
    },
    today: formatDate(now),
    doy,
    weather,
    inSeason,
  };
}
