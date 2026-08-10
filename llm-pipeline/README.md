# LLM Pipeline — "Today's Picks" on inseasons.app

A production LLM feature that auto-generates contextual seasonal recommendations — engineered so that a hallucinated recommendation **cannot reach a user**.

## The problem

inseasons tracks what's in season around Greater Vancouver (blooms, markets, wildlife, festivals) with live status computed from phenology data. "Today's Picks" generates a short daily selection automatically — no user query involved. The hard part isn't calling an LLM; it's that a model can invent items that don't exist, and in a data-grounded product that's unacceptable. The pipeline below treats the model as an untrusted component and constrains it at every step.

## Design: four reliability mechanisms

### 1. Forced tool-use (strict structured output)
The model is pinned to a single tool with a strict schema (`tool_choice: {type: "tool"}`) — it *cannot* reply with free-form text. Every response is valid, parseable, structured data or the call fails loudly.

→ [`tool-schema/`](./tool-schema/)

### 2. Grounding + post-generation filtering
The model can only choose from records that are actually in season *right now*, retrieved from PostgreSQL and injected into the call (SQL-grounded retrieval). Then — because grounding alone isn't a guarantee — a post-generation filter drops any record ID the model invented. Defense in depth: a hallucinated pick is structurally unable to render.

→ [`grounding/`](./grounding/)

### 3. Rubric-scored evaluation harness
17 test cases spanning the calendar year, weather conditions, and edge cases (season boundaries, empty result sets, conflicting signals), each scored against a fixed rubric — deliberately *not* an LLM judge. The harness runs the real pipeline. No prompt or tool change ships without a run.

→ [`evals/`](./evals/)

### 4. Fallbacks, cost controls, audit
A 24-hour cache; a fully deterministic non-LLM fallback when the model errors or times out (the feature degrades, never breaks); a daily spend cap; and an append-only audit log of every invocation — cache hit, live call, or fallback — with tokens, cost, and latency, so any output is traceable to exactly what produced it.

→ [`reliability/`](./reliability/)

## Running it

```bash
npm install
npm test           # 20 tests: grounding filter, season logic, cache TTL,
                   # rubric scoring, and the full pipeline (fallback paths,
                   # hallucination drop, budget cap, cache hit)
npm run evals      # run all 17 eval cases with a deterministic offline model
npm run evals:dry  # print the in-season set per case, no model
npm run evals:live # exercise the real Anthropic API (needs ANTHROPIC_API_KEY)
npm run typecheck
```

The pipeline is real; the boundaries (the model, the database) are behind ports
with in-memory adapters, so the whole thing — including the eval harness — runs
and is tested **offline with no API key**. `anthropicModel()` is the production
adapter; `fakeModel()` is the offline stand-in. Swapping the in-memory
`PhenomenonSource`/`CacheStore`/`AuditLog` for the production Postgres adapters
is the only change needed to run against a real database.

```
tool-schema/   schema.ts (forced-tool JSON Schema + Zod) · prompt.ts (versioned)
grounding/     context.ts (retrieval port) · in-season.ts · validate.ts (filter)
evals/         cases.ts (17 cases) · score.ts (rubric) · run.ts (harness)
reliability/   pipeline.ts (orchestration) · llm.ts · cache.ts · fallback.ts · audit.ts
```

## Notes on scope

- Retrieval here is **SQL-grounded, not vector/RAG** — the data model is structured and small enough that exact retrieval beats similarity search. The guardrail patterns (grounding, filtering, evals, fallbacks) are identical to what a vector-based stack needs.
- It's a **multi-step LLM pipeline**, not an autonomous agent loop — one constrained model call inside deterministic scaffolding.
- Model: Anthropic API (Claude), called with streaming + forced tool-use.
