# "Today's Picks" — eval cases & rubric

17 cases (`cases.ts`) spanning the calendar year, weather conditions, and edge
cases. Each runs the **real** pipeline (grounding retrieval → forced tool call →
grounding filter) and is scored by a **fixed, structured rubric** (`score.ts`) —
**not** an LLM judge. A case PASSes only when it accrues zero rubric violations.

## The rubric

| # | Check | Fails when |
|---|-------|-----------|
| 1 | **Category coverage** | Fewer than `ceil(expected/2)` of the expected categories are represented in the picks |
| 2 | **Must-include** | A required slug (e.g. `cherry-blossom` in April) is not picked |
| 3 | **In-season membership** | A slug that must be *retrievable* (e.g. leap-year blueberry) is absent from the grounding set |
| 4 | **Absent** | An out-of-season slug is picked at all |
| 5 | **Weather-sensitive confidence** | A weather-sensitive phenomenon is picked with `high` confidence in rain / heavy rain |
| 6 | **Variety** | All picks share one category, unless the case sets `allow_monotype` |
| 7 | **Count + hallucination** | Not 3–5 picks, or any pick was dropped by the grounding filter |

## Outcomes

- **PASS / FAIL** — the model was called and scored.
- **FALLBACK** — fewer than 3 phenomena in season, so the pipeline serves the
  deterministic fallback (the correct behaviour). The harness still asserts the
  case's must-include anchor really is in season; it just isn't LLM-picked.
- **ERROR** — the model call or validation threw.

Only PASS + FAIL count toward the pass-rate denominator.

## Case map (why each exists)

| # | Date | Weather | Offset | Tests |
|---|------|---------|--------|-------|
| 1 | Apr 5 | sunny | 0 | Cherry peak, clean happy path |
| 2 | Apr 10 | heavy rain | 0 | Weather-sensitive confidence downgrade |
| 3 | Feb 8 | cloudy | 0 | Sparse early spring |
| 4 | May 15 | sunny | 0 | Flower glut → variety enforced |
| 5 | Jun 12 | cloudy | +5 | Early-summer mix, small climate offset |
| 6 | Jul 20 | sunny | 0 | High summer, many options |
| 7 | Aug 25 | sunny | 0 | Late summer |
| 8 | Sep 20 | cloudy | +7 | Autumn transition |
| 9 | Oct 22 | sunny | +7 | Peak foliage + salmon (two must-includes) |
| 10 | Oct 28 | rain | 0 | Salmon is fine in rain; geese are not |
| 11 | Nov 18 | cloudy | 0 | Late autumn |
| 12 | Dec 28 | sunny | 0 | Year-end wrap-around window (bald eagle 335→30) |
| 13 | Mar 22 | heavy rain | −8 | Rainy early spring + offset |
| 14 | Jan 25 | cloudy | 0 | Very sparse → fallback |
| 15 | May 28 | sunny | 0 | Late-spring mix incl. wildlife |
| 16 | **Jul 4, 2028** | sunny | 0 | **Leap year** day-of-year arithmetic |
| 17 | Mar 5 | sunny | **−18** | Strong offset pulls cherry into season early |

> Note: this showcase ships a sanitized in-memory phenology dataset
> (`grounding/sample-data.ts`) in place of the production Postgres RPC, so the
> exact in-season set per case reflects that dataset. The **methodology** —
> corpus, structured rubric, real-pipeline execution, no-LLM-judge — is the
> production one.
