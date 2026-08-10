import { buildTodayContext, UnknownRegionError } from "../grounding/context";
import type { PhenomenonSource, WeatherSource } from "../grounding/context";
import { validateAndGround } from "../grounding/validate";
import type { TodayContext, TodayPayload, TodayPick } from "../grounding/types";
import { PROMPT_VERSION } from "../tool-schema/prompt";
import { pickRecommendations, type Model } from "./llm";
import { buildFallbackPayload } from "./fallback";
import {
  cacheKey,
  readCache,
  writeCache,
  type CacheStore,
} from "./cache";
import { getTodaySpendUsd, logLlmCall, type AuditLog } from "./audit";

// ── The pipeline: one constrained model call inside deterministic scaffolding ─
//
//   cache read → context → spend cap → LLM (forced tool use) + grounding
//              → cache write → audit,  with a deterministic fallback on ANY
//                failure, 0-valid-after-grounding, too-few-in-season, or budget
//                cap. Cache and audit are best-effort.
//
// This is the framework-agnostic core of the production Next.js route handler
// (app/api/today/route.ts). It takes its dependencies as ports so it runs
// identically in tests (in-memory adapters + fake model) and in production
// (Postgres adapters + Anthropic).

const ENDPOINT = "/api/today";

export type PipelineDeps = {
  phenomena: PhenomenonSource;
  model: Model;
  cache: CacheStore;
  audit: AuditLog;
  weather?: WeatherSource;
  now?: () => Date;
  /** Soft daily spend cap (USD). Real calls stop past this; fallback serves. */
  dailyCostCapUsd?: number;
  /** Test hook: force "fallback" (skip LLM) or "error" (LLM throws). */
  force?: "fallback" | "error";
};

export type PipelineResult = TodayPayload & { cached: boolean };

export async function getTodayPicks(
  regionSlug: string,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  const now = deps.now?.() ?? new Date();
  const capUsd = deps.dailyCostCapUsd ?? 0.5;

  const ctx = await buildTodayContext(regionSlug, {
    phenomena: deps.phenomena,
    weather: deps.weather,
    now,
  });
  const bucket = ctx.weather?.bucket ?? null;
  const key = cacheKey(ctx.today, bucket, regionSlug);

  const ctxSummary = {
    region: regionSlug,
    doy: ctx.doy,
    weather_bucket: bucket,
    in_season_ids: ctx.inSeason.map((p) => p.id),
  };

  // --- Cache read (skipped when a test hook forces a path) ---
  if (!deps.force) {
    const cached = await readCache(deps.cache, key);
    if (cached) {
      await logLlmCall(deps.audit, {
        created_at: now.toISOString(),
        endpoint: ENDPOINT,
        region_slug: regionSlug,
        cache_hit: true,
        input_context: { region: regionSlug, doy: ctx.doy, weather_bucket: bucket },
      });
      return { ...cached, cached: true };
    }
  }

  // --- Decide whether to attempt a real LLM call ---
  let fallbackReason: string | null =
    ctx.inSeason.length < 3
      ? "too few in season"
      : deps.force === "fallback"
        ? "forced (test hook)"
        : null;

  // Daily spend cap — fail-open: null (query error) means "unknown, allow".
  if (fallbackReason === null) {
    const spend = await getTodaySpendUsd(deps.audit, now);
    if (spend !== null && spend >= capUsd) {
      fallbackReason = `budget_cap: today $${spend.toFixed(4)} >= cap $${capUsd.toFixed(2)}`;
    }
  }

  // --- LLM path ---
  if (fallbackReason === null) {
    try {
      if (deps.force === "error") throw new Error("forced LLM error (test hook)");

      const llm = await pickRecommendations(deps.model, ctx);
      const { valid, dropped } = validateAndGround(llm.recommendations, ctx.inSeason);
      if (valid.length === 0) {
        throw new Error("0 valid recommendations after grounding");
      }

      const byId = new Map(ctx.inSeason.map((p) => [p.id, p]));
      const picks: TodayPick[] = valid.map((r) => {
        const p = byId.get(r.phenomenon_id)!;
        return {
          phenomenon_id: r.phenomenon_id,
          slug: p.slug,
          name: p.name,
          category_slug: p.category_slug,
          category_name: p.category_name ?? p.category_slug,
          status: p.status,
          hero_image_url: p.hero_image_url ?? null,
          why_now: r.why_now,
          confidence: r.confidence,
        };
      });

      const payload: TodayPayload = {
        region: regionSlug,
        today: ctx.today,
        doy: ctx.doy,
        weather: bucket,
        source: "llm",
        picks,
      };

      await writeCache(deps.cache, key, payload);
      await logLlmCall(deps.audit, {
        created_at: now.toISOString(),
        endpoint: ENDPOINT,
        region_slug: regionSlug,
        is_fallback: false,
        model: llm.model,
        prompt_version: PROMPT_VERSION,
        input_context: ctxSummary,
        raw_output: llm.raw,
        validated_output: valid,
        invalid_count: dropped,
        latency_ms: llm.latencyMs,
        input_tokens: llm.usage.input_tokens,
        output_tokens: llm.usage.output_tokens,
        cost_usd: llm.costUsd,
      });

      return { ...payload, cached: false };
    } catch (llmErr) {
      fallbackReason = `llm: ${llmErr instanceof Error ? llmErr.message : "error"}`;
    }
  }

  // --- Deterministic fallback (not cached; cheap to recompute) ---
  const payload = buildFallbackPayload(ctx, bucket);
  await logLlmCall(deps.audit, {
    created_at: now.toISOString(),
    endpoint: ENDPOINT,
    region_slug: regionSlug,
    is_fallback: true,
    prompt_version: PROMPT_VERSION,
    input_context: { ...ctxSummary, fallback_reason: fallbackReason },
    validated_output: payload.picks,
  });
  return { ...payload, cached: false };
}

export { UnknownRegionError };
export type { TodayContext };
