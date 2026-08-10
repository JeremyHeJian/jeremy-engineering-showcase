import {
  RecommendationsSchema,
  TODAY_TOOL_NAME,
  TODAY_TOOL_SCHEMA,
  type Recommendation,
} from "../tool-schema/schema";
import { SYSTEM_PROMPT, buildUserPrompt } from "../tool-schema/prompt";
import type { TodayContext } from "../grounding/types";

// ── Mechanism 1 (call site): forced tool use ─────────────────────────────────
//
// Claude picks from the in-season list via FORCED tool use — the canonical way
// to get structured output from Claude (there is no OpenAI-style
// response_format). `tool_choice` pins the one tool, so the response always
// contains a tool_use block whose input matches TODAY_TOOL_SCHEMA; we
// re-validate with Zod anyway (belt-and-suspenders).
//
// The model is treated as an untrusted component behind a `Model` port. The
// real Anthropic adapter is `anthropicModel()`; tests inject a fake so the
// pipeline runs offline with no API key.

export const TODAY_MODEL = "claude-haiku-4-5";

// Haiku 4.5 list price (per 1M tokens). Verify against current Anthropic
// pricing before trusting cost dashboards.
const INPUT_USD_PER_TOKEN = 1.0 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 5.0 / 1_000_000;

export type LlmUsage = {
  input_tokens: number;
  output_tokens: number;
};

export type LlmResult = {
  recommendations: Recommendation[];
  raw: unknown; // the model's tool input, pre-validation (for the audit log)
  model: string;
  latencyMs: number;
  usage: LlmUsage;
  costUsd: number;
};

export function estimateCostUsd(usage: LlmUsage): number {
  const input = usage.input_tokens * INPUT_USD_PER_TOKEN;
  const output = usage.output_tokens * OUTPUT_USD_PER_TOKEN;
  return Number((input + output).toFixed(6));
}

// The narrow surface the pipeline needs from a model: given a system prompt,
// user prompt, and the forced tool, return the tool input + usage. This is the
// seam between "our deterministic scaffolding" and "the untrusted model".
export interface Model {
  readonly name: string;
  pickRecommendations(input: {
    system: string;
    user: string;
    toolName: string;
    toolSchema: unknown;
  }): Promise<{ toolInput: unknown; usage: LlmUsage; model: string }>;
}

/**
 * Real Anthropic adapter. Kept out of the default import graph so the package
 * builds and tests without the SDK installed; pass the constructed client in.
 *
 * @example
 *   import Anthropic from "@anthropic-ai/sdk";
 *   const model = anthropicModel(new Anthropic()); // reads ANTHROPIC_API_KEY
 */
export function anthropicModel(client: AnthropicLike): Model {
  return {
    name: TODAY_MODEL,
    async pickRecommendations({ system, user, toolName, toolSchema }) {
      // 10s timeout; the SDK retries retryable failures (429/5xx/timeout) once
      // with exponential backoff before throwing.
      const message = await client.messages.create(
        {
          model: TODAY_MODEL,
          max_tokens: 1024,
          system,
          tools: [
            {
              name: toolName,
              description:
                "Return 3–5 recommended in-season phenomena to see today.",
              input_schema: toolSchema,
            },
          ],
          tool_choice: { type: "tool", name: toolName },
          messages: [{ role: "user", content: user }],
        },
        { timeout: 10_000, maxRetries: 1 },
      );

      const toolUse = message.content.find(
        (b: { type: string }) => b.type === "tool_use",
      );
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Model did not return a tool_use block");
      }
      return {
        toolInput: toolUse.input,
        model: message.model,
        usage: {
          input_tokens: message.usage.input_tokens,
          output_tokens: message.usage.output_tokens,
        },
      };
    },
  };
}

// Minimal structural type for the Anthropic SDK client, so this file has no
// hard dependency on the package.
export interface AnthropicLike {
  messages: {
    create(
      body: unknown,
      options?: unknown,
    ): Promise<{
      content: Array<{ type: string; input?: unknown }>;
      model: string;
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
}

export async function pickRecommendations(
  model: Model,
  ctx: TodayContext,
): Promise<LlmResult> {
  const start = Date.now();
  const { toolInput, usage, model: modelId } = await model.pickRecommendations({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(ctx),
    toolName: TODAY_TOOL_NAME,
    toolSchema: TODAY_TOOL_SCHEMA,
  });
  const latencyMs = Date.now() - start;

  // Zod re-validation — throws if the (schema-constrained) input is malformed.
  const parsed = RecommendationsSchema.parse(toolInput);

  return {
    recommendations: parsed.recommendations,
    raw: toolInput,
    model: modelId,
    latencyMs,
    usage,
    costUsd: estimateCostUsd(usage),
  };
}
