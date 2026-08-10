import type { Model, LlmUsage } from "./llm";
import type { Confidence } from "../grounding/types";

// A deterministic, offline stand-in for the Anthropic adapter. It parses the
// in-season list back out of the user prompt and returns valid picks, so the
// pipeline and the eval harness run with no API key. Tests also use it to
// inject specific behaviour (a hallucinated id, a thrown error).
//
// This is test/support infrastructure, not part of the production path.

type Pick = { phenomenon_id: number; why_now: string; confidence: Confidence };
type PickStrategy = (
  ids: { id: number; category: string; status: string }[],
) => Pick[];

// Parse "  3 — Cherry Blossom [flowers] · peak" lines back into structured rows.
function parsePrompt(user: string) {
  const rows: { id: number; category: string; status: string }[] = [];
  for (const line of user.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+—\s+.+\[([^\]]+)\]\s+·\s+(\w+)/);
    if (m) rows.push({ id: Number(m[1]), category: m[2], status: m[3] });
  }
  return rows;
}

// Default strategy: prefer variety (distinct categories), peak before others,
// take 3–5. Good enough to satisfy the rubric on well-formed cases.
const varietyStrategy: PickStrategy = (rows) => {
  const order = { peak: 0, early: 1, late: 2 } as Record<string, number>;
  const sorted = [...rows].sort(
    (a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3),
  );
  const seenCat = new Set<string>();
  const picked: typeof sorted = [];
  for (const r of sorted) {
    if (seenCat.has(r.category)) continue;
    seenCat.add(r.category);
    picked.push(r);
    if (picked.length === 5) break;
  }
  for (const r of sorted) {
    if (picked.length >= 3) break;
    if (!picked.includes(r)) picked.push(r);
  }
  return picked.slice(0, 5).map((r) => ({
    phenomenon_id: r.id,
    why_now: "In season and worth seeing today.",
    confidence: r.status === "peak" ? "high" : "medium",
  }));
};

export function fakeModel(opts?: {
  strategy?: PickStrategy;
  throwError?: boolean;
  usage?: LlmUsage;
}): Model {
  return {
    name: "fake-model",
    async pickRecommendations({ user }) {
      if (opts?.throwError) throw new Error("fake model error");
      const rows = parsePrompt(user);
      const recommendations = (opts?.strategy ?? varietyStrategy)(rows);
      return {
        toolInput: { recommendations },
        model: "fake-model",
        usage: opts?.usage ?? { input_tokens: 400, output_tokens: 80 },
      };
    },
  };
}
