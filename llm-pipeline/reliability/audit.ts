// ── Mechanism 4 (part c): append-only audit log ──────────────────────────────
//
// One row per invocation, whether it was a cache hit, a real LLM call, or a
// deterministic fallback. This is the replayable record (prompt version, model
// version, input context, raw + validated output, token cost) and the source
// for the monitoring queries (hallucination rate, cache-hit rate, fallback
// rate, latency, cost).
//
// Best-effort: a logging failure must never break the user-facing response, so
// every write is wrapped and swallowed.

export type LlmCallRow = {
  created_at: string;
  endpoint: string;
  region_slug: string;
  cache_hit?: boolean;
  is_fallback?: boolean;
  model?: string | null;
  prompt_version?: string | null;
  input_context?: unknown;
  raw_output?: unknown;
  validated_output?: unknown;
  invalid_count?: number; // recs dropped by grounding — the hallucination metric
  latency_ms?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cost_usd?: number | null;
};

export interface AuditLog {
  insert(row: LlmCallRow): Promise<void>;
  /** Sum of today's (UTC) logged LLM cost — powers the daily spend cap. */
  spendSince(isoStart: string): Promise<number | null>;
}

// In-memory adapter. Production backs this with an append-only Postgres table
// (`llm_calls`) written only by the service-role client.
export class InMemoryAuditLog implements AuditLog {
  readonly rows: LlmCallRow[] = [];

  async insert(row: LlmCallRow): Promise<void> {
    this.rows.push(row);
  }

  async spendSince(isoStart: string): Promise<number | null> {
    return this.rows
      .filter((r) => r.created_at >= isoStart && r.cost_usd != null)
      .reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
  }
}

export async function logLlmCall(log: AuditLog, row: LlmCallRow): Promise<void> {
  try {
    await log.insert(row);
  } catch {
    // best-effort — never let audit failure surface to the user
  }
}

/**
 * Today's logged LLM cost (UTC day). Powers the daily spend cap. Returns null on
 * error — the caller treats null as "unknown, allow" (fail-open): the true hard
 * backstop is the Anthropic Console spend limit, this is a soft app-level guard.
 */
export async function getTodaySpendUsd(
  log: AuditLog,
  now: Date = new Date(),
): Promise<number | null> {
  try {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return await log.spendSince(start.toISOString());
  } catch {
    return null;
  }
}
