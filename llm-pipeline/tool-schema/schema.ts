import { z } from "zod";

// ── Mechanism 1: forced tool-use (strict structured output) ──────────────────
//
// `TODAY_TOOL_SCHEMA` is the JSON Schema Claude is *forced* to fill via tool
// use (`tool_choice: { type: "tool" }` in reliability/llm.ts). The model cannot
// reply with free-form prose — every response is a tool_use block whose input
// matches this schema, or the call fails loudly.
//
// `RecommendationsSchema` is the Zod mirror we re-validate the tool input with
// (belt-and-suspenders: the model is constrained by the tool schema, then we
// re-check before grounding). IDs are integers — the production `phenomena.id`
// is a bigserial, NOT a UUID.

export const CONFIDENCE_VALUES = ["high", "medium", "low"] as const;

export const TODAY_TOOL_NAME = "pick_recommendations";

export const TODAY_TOOL_SCHEMA = {
  type: "object",
  properties: {
    recommendations: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          phenomenon_id: { type: "integer" },
          why_now: { type: "string", maxLength: 140 },
          confidence: { type: "string", enum: [...CONFIDENCE_VALUES] },
        },
        required: ["phenomenon_id", "why_now", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["recommendations"],
  additionalProperties: false,
} as const;

export const RecommendationSchema = z.object({
  phenomenon_id: z.number().int(),
  why_now: z.string().max(140),
  confidence: z.enum(CONFIDENCE_VALUES),
});

export const RecommendationsSchema = z.object({
  recommendations: z.array(RecommendationSchema).min(3).max(5),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;
export type Recommendations = z.infer<typeof RecommendationsSchema>;
