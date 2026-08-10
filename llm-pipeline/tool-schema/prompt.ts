import type { TodayContext } from "../grounding/types";

// Bump PROMPT_VERSION whenever SYSTEM_PROMPT or buildUserPrompt changes in a
// way that could shift output — it is logged with every invocation (see
// reliability/audit.ts) so each row is replayable against the exact prompt that
// produced it.
export const PROMPT_VERSION = "today_v1";

// Region-agnostic system prompt (the region name is supplied in the user turn)
// so it stays byte-identical across calls.
export const SYSTEM_PROMPT = `You are inseasons' daily recommendation assistant. Given today's date, the current weather, and a list of in-season natural phenomena, pick 3–5 that are worth seeing today.

Rules:
- You may ONLY pick phenomena from the provided list, by their numeric id. Never invent an id.
- For each pick, write a single-sentence "why_now" (max 140 chars) that references the weather or date when relevant.
- confidence:
  - "high"   = at peak AND the weather supports it
  - "medium" = in season but off-peak, or the weather is slightly off
  - "low"    = at the edge of the season, or the weather makes it harder
- Prefer variety: don't pick 5 flowers if a bird, market, or foliage phenomenon is also in season.
- Skip phenomena the current weather is openly hostile to (e.g. bird-watching in heavy rain). Salmon runs are fine in rain.`;

function describeWeather(weather: TodayContext["weather"]): string {
  if (!weather) return "Current weather: unknown.";
  const parts = [`bucket=${weather.bucket}`];
  if (weather.tempC != null) parts.push(`${Math.round(weather.tempC)}°C`);
  if (weather.description) parts.push(weather.description);
  return `Current weather: ${parts.join(", ")}.`;
}

export function buildUserPrompt(ctx: TodayContext): string {
  const lines: string[] = [];
  lines.push(`Region: ${ctx.region.name}.`);
  lines.push(`Date: ${ctx.today} (day-of-year ${ctx.doy}).`);
  if (ctx.region.offsetDays !== 0) {
    const dir = ctx.region.offsetDays < 0 ? "early" : "late";
    lines.push(
      `Season is running ${Math.abs(ctx.region.offsetDays)} days ${dir} this year.`,
    );
  }
  lines.push(describeWeather(ctx.weather));
  lines.push("");
  lines.push("In-season phenomena (id — name [category] · status):");
  for (const p of ctx.inSeason) {
    lines.push(`  ${p.id} — ${p.name} [${p.category_slug}] · ${p.status}`);
  }
  lines.push("");
  lines.push(
    "Call pick_recommendations with 3–5 of these, chosen for someone deciding what to go see today.",
  );
  return lines.join("\n");
}
