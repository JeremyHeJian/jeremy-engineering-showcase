/**
 * Eval harness for the "Today's picks" feature.
 *
 *   npx tsx evals/run.ts            # offline: deterministic fake model, no key
 *   npx tsx evals/run.ts --dry      # print the in-season set per case, no model
 *   npx tsx evals/run.ts --live     # call the real Anthropic API (needs a key)
 *   npx tsx evals/run.ts --case 17  # single case
 *
 * For each case it derives the in-season set the pipeline WOULD see (via the
 * same grounding logic the app uses), runs the real prompt + forced tool call,
 * grounds the output, then scores it against the fixed rubric (see score.ts).
 *
 * In production this runs against the Postgres RPC and the live model on every
 * prompt/tool change. Here it runs offline by default so `npm test` and CI stay
 * hermetic; `--live` exercises the real model end to end.
 */
import { fileURLToPath } from "node:url";
import { CASES, type EvalCase } from "./cases";
import { score } from "./score";
import { inSeasonStatus } from "../grounding/in-season";
import { PHENOMENA } from "../grounding/sample-data";
import type { InSeasonPhenomenon, TodayContext } from "../grounding/types";
import { validateAndGround } from "../grounding/validate";
import { pickRecommendations, type Model } from "../reliability/llm";
import { fakeModel } from "../reliability/fake-model";

const IN_SEASON_ORDER = { peak: 0, early: 1, late: 2 } as const;

export function inSeasonForCase(c: EvalCase): InSeasonPhenomenon[] {
  const rows: InSeasonPhenomenon[] = [];
  for (const p of PHENOMENA) {
    const status = inSeasonStatus(p, c.doy, c.offset_days);
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

function ctxForCase(c: EvalCase, inSeason: InSeasonPhenomenon[]): TodayContext {
  return {
    region: { slug: "vancouver", name: "Greater Vancouver", offsetDays: c.offset_days },
    today: c.date,
    doy: c.doy,
    weather: { bucket: c.weather, tempC: null, description: c.weather },
    inSeason,
  };
}

export type CaseOutcome = "PASS" | "FAIL" | "FALLBACK" | "ERROR";
export type CaseResult = { id: number; outcome: CaseOutcome; reasons: string[] };

export async function runCase(c: EvalCase, model: Model): Promise<CaseResult> {
  const inSeason = inSeasonForCase(c);

  // Sparse: the pipeline would fall back; that's correct behaviour. We still
  // assert the must-include anchor really is in season — it just won't be picked.
  if (inSeason.length < 3) {
    const inSlugs = new Set(inSeason.map((p) => p.slug));
    const missing = c.expect_must_include.filter((s) => !inSlugs.has(s));
    if (!c.sparse) {
      return { id: c.id, outcome: "FAIL", reasons: [`only ${inSeason.length} in-season but not marked sparse`] };
    }
    if (missing.length) {
      return { id: c.id, outcome: "FAIL", reasons: [`must-include not in season: ${missing.join(",")}`] };
    }
    return { id: c.id, outcome: "FALLBACK", reasons: [] };
  }

  try {
    const llm = await pickRecommendations(model, ctxForCase(c, inSeason));
    const { valid, dropped } = validateAndGround(llm.recommendations, inSeason);
    const reasons = score(c, inSeason, valid, dropped);
    return { id: c.id, outcome: reasons.length === 0 ? "PASS" : "FAIL", reasons };
  } catch (e) {
    return { id: c.id, outcome: "ERROR", reasons: [(e as Error).message] };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const live = args.includes("--live");
  const caseArg = args.indexOf("--case");
  const onlyId = caseArg >= 0 ? Number(args[caseArg + 1]) : null;
  const cases = onlyId ? CASES.filter((c) => c.id === onlyId) : CASES;

  if (dry) {
    for (const c of cases) {
      const inSeason = inSeasonForCase(c);
      const summary = inSeason.map((p) => `${p.slug}[${p.category_slug}:${p.status}]`).join(", ");
      console.log(`#${c.id} ${c.date} ${c.weather} off=${c.offset_days} → ${inSeason.length} in-season`);
      console.log(`   ${summary || "(none)"}`);
    }
    return;
  }

  const model = live ? await liveModel() : fakeModel();
  const results: CaseResult[] = [];
  for (const c of cases) {
    const r = await runCase(c, model);
    results.push(r);
    console.log(`#${r.id} ${r.outcome}${r.reasons.length ? "  — " + r.reasons.join("; ") : ""}`);
  }

  const pass = results.filter((r) => r.outcome === "PASS").length;
  const fallback = results.filter((r) => r.outcome === "FALLBACK").length;
  const fail = results.filter((r) => r.outcome === "FAIL").length;
  const err = results.filter((r) => r.outcome === "ERROR").length;
  const scored = pass + fail;
  console.log("\n──────────────────────────────");
  console.log(`PASS ${pass} / ${scored} scored` + (scored ? ` (${Math.round((pass / scored) * 100)}%)` : ""));
  console.log(`FALLBACK ${fallback}  FAIL ${fail}  ERROR ${err}  | model: ${model.name}`);
  if (fail || err) process.exitCode = 1;
}

// Lazily construct the real Anthropic adapter only when --live is passed, so the
// SDK is an optional dependency for offline runs.
async function liveModel(): Promise<Model> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { anthropicModel } = await import("../reliability/llm");
  return anthropicModel(new Anthropic() as never);
}

// Only run as a script, not when imported by tests. Compare resolved filesystem
// paths (not URL strings) so spaces in the path don't break the check.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
