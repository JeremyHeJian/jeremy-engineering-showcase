// Sanitized, representative phenology dataset for Greater Vancouver.
//
// A subset of the production `phenomena` table, hand-picked to span every
// category and every part of the calendar so the eval cases exercise real
// season boundaries, sparse windows, and wrap-around (bald eagle). Values are
// approximate and for demonstration only.

export type PhenomenonRecord = {
  id: number;
  slug: string;
  name: string;
  category_slug: string;
  category_name: string;
  typical_start_doy: number;
  peak_doy: number | null;
  typical_end_doy: number;
  sightings: number;
  hero_image_url: string | null;
};

export type Region = {
  slug: string;
  name: string;
  season_offset_days: number;
};

export const REGIONS: Region[] = [
  { slug: "vancouver", name: "Greater Vancouver", season_offset_days: 0 },
];

export const DEFAULT_REGION_SLUG = "vancouver";

// doy references (non-leap): Feb 8 ≈ 39, Mar 22 ≈ 81, Apr 5 ≈ 95, May 15 ≈ 135,
// Jun 12 ≈ 163, Jul 20 ≈ 201, Aug 25 ≈ 237, Sep 20 ≈ 263, Oct 22 ≈ 295,
// Nov 18 ≈ 322, Dec 28 ≈ 362.
export const PHENOMENA: PhenomenonRecord[] = [
  // ── flowers ──────────────────────────────────────────────────────────────
  { id: 1, slug: "crocus", name: "Crocus", category_slug: "flowers", category_name: "Flowers", typical_start_doy: 32, peak_doy: 48, typical_end_doy: 74, sightings: 30, hero_image_url: null },
  { id: 2, slug: "daffodil", name: "Daffodil", category_slug: "flowers", category_name: "Flowers", typical_start_doy: 60, peak_doy: 85, typical_end_doy: 110, sightings: 44, hero_image_url: null },
  { id: 3, slug: "cherry-blossom", name: "Cherry Blossom", category_slug: "flowers", category_name: "Flowers", typical_start_doy: 82, peak_doy: 96, typical_end_doy: 116, sightings: 210, hero_image_url: null },
  { id: 4, slug: "tulip", name: "Tulip", category_slug: "flowers", category_name: "Flowers", typical_start_doy: 95, peak_doy: 112, typical_end_doy: 130, sightings: 120, hero_image_url: null },
  { id: 5, slug: "rhododendron", name: "Rhododendron", category_slug: "flowers", category_name: "Flowers", typical_start_doy: 120, peak_doy: 138, typical_end_doy: 160, sightings: 70, hero_image_url: null },
  { id: 6, slug: "iris", name: "Iris", category_slug: "flowers", category_name: "Flowers", typical_start_doy: 135, peak_doy: 150, typical_end_doy: 172, sightings: 40, hero_image_url: null },
  { id: 7, slug: "peony", name: "Peony", category_slug: "flowers", category_name: "Flowers", typical_start_doy: 150, peak_doy: 165, typical_end_doy: 185, sightings: 55, hero_image_url: null },
  { id: 8, slug: "sunflower", name: "Sunflower", category_slug: "flowers", category_name: "Flowers", typical_start_doy: 215, peak_doy: 240, typical_end_doy: 265, sightings: 95, hero_image_url: null },
  // ── foliage ──────────────────────────────────────────────────────────────
  { id: 9, slug: "fall-maple", name: "Maple Foliage", category_slug: "foliage", category_name: "Foliage", typical_start_doy: 275, peak_doy: 295, typical_end_doy: 315, sightings: 130, hero_image_url: null },
  // ── food / u-pick ────────────────────────────────────────────────────────
  { id: 10, slug: "blueberry-upick", name: "Blueberry U-Pick", category_slug: "food", category_name: "Food", typical_start_doy: 185, peak_doy: 205, typical_end_doy: 240, sightings: 88, hero_image_url: null },
  { id: 11, slug: "apple-orchard", name: "Apple Orchard", category_slug: "food", category_name: "Food", typical_start_doy: 250, peak_doy: 275, typical_end_doy: 300, sightings: 60, hero_image_url: null },
  { id: 12, slug: "pumpkin-patch", name: "Pumpkin Patch", category_slug: "food", category_name: "Food", typical_start_doy: 275, peak_doy: 290, typical_end_doy: 305, sightings: 50, hero_image_url: null },
  // ── markets ──────────────────────────────────────────────────────────────
  { id: 13, slug: "farmers-market", name: "Farmers Market", category_slug: "markets", category_name: "Markets", typical_start_doy: 130, peak_doy: 210, typical_end_doy: 290, sightings: 300, hero_image_url: null },
  // ── festivals ────────────────────────────────────────────────────────────
  { id: 14, slug: "cherry-festival", name: "Cherry Blossom Festival", category_slug: "festivals", category_name: "Festivals", typical_start_doy: 90, peak_doy: 100, typical_end_doy: 110, sightings: 65, hero_image_url: null },
  { id: 15, slug: "winter-lights", name: "Winter Lights Festival", category_slug: "festivals", category_name: "Festivals", typical_start_doy: 325, peak_doy: 350, typical_end_doy: 15, sightings: 140, hero_image_url: null },
  // ── wildlife ─────────────────────────────────────────────────────────────
  { id: 16, slug: "orca-humpback", name: "Orca & Humpback", category_slug: "wildlife", category_name: "Wildlife", typical_start_doy: 120, peak_doy: 190, typical_end_doy: 260, sightings: 75, hero_image_url: null },
  { id: 17, slug: "salmon-run", name: "Salmon Run", category_slug: "wildlife", category_name: "Wildlife", typical_start_doy: 275, peak_doy: 300, typical_end_doy: 325, sightings: 160, hero_image_url: null },
  { id: 18, slug: "snow-geese", name: "Snow Geese", category_slug: "wildlife", category_name: "Wildlife", typical_start_doy: 300, peak_doy: 325, typical_end_doy: 355, sightings: 90, hero_image_url: null },
  { id: 19, slug: "bald-eagle", name: "Bald Eagle", category_slug: "wildlife", category_name: "Wildlife", typical_start_doy: 335, peak_doy: 355, typical_end_doy: 30, sightings: 110, hero_image_url: null },
  { id: 20, slug: "herring-spawn", name: "Herring Spawn", category_slug: "wildlife", category_name: "Wildlife", typical_start_doy: 50, peak_doy: 68, typical_end_doy: 88, sightings: 35, hero_image_url: null },
  { id: 21, slug: "cranberry-harvest", name: "Cranberry Harvest", category_slug: "food", category_name: "Food", typical_start_doy: 285, peak_doy: 305, typical_end_doy: 335, sightings: 45, hero_image_url: null },
  { id: 22, slug: "waterfowl-migration", name: "Waterfowl Migration", category_slug: "wildlife", category_name: "Wildlife", typical_start_doy: 350, peak_doy: 5, typical_end_doy: 20, sightings: 55, hero_image_url: null },
  { id: 23, slug: "hellebore", name: "Hellebore", category_slug: "flowers", category_name: "Flowers", typical_start_doy: 38, peak_doy: 68, typical_end_doy: 100, sightings: 25, hero_image_url: null },
];
