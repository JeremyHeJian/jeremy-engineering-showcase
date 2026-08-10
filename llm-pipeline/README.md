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

## Notes on scope

- Retrieval here is **SQL-grounded, not vector/RAG** — the data model is structured and small enough that exact retrieval beats similarity search. The guardrail patterns (grounding, filtering, evals, fallbacks) are identical to what a vector-based stack needs.
- It's a **multi-step LLM pipeline**, not an autonomous agent loop — one constrained model call inside deterministic scaffolding.
- Model: Anthropic API (Claude), called with streaming + forced tool-use.
