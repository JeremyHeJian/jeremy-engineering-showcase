# Engineering Showcase — Jeremy (Jian) He

Two deep-dives from products I built and operate solo, end to end:

| Live product | What it is | Showcased here |
|---|---|---|
| [inseasons.app](https://inseasons.app) | A data-driven seasonal field guide for Greater Vancouver | **[LLM pipeline](./llm-pipeline/)** — a production AI feature engineered so hallucinations *cannot* reach users |
| [sitterlinks.com](https://sitterlinks.com) | A two-sided childcare marketplace with Stripe payments | **[Payments reliability](./payments-reliability/)** — webhook handling that stays correct when events arrive late, twice, or out of order |

Both products: Next.js / TypeScript / React on the front, Node & Python services behind, PostgreSQL underneath, deployed with CI/CD (GitHub Actions, Docker) and monitored in production (Sentry, PostHog).

**Why this repo exists:** my main products' repositories stay private (one of them runs live payments), but the engineering decisions are the interesting part — so the two modules here are sanitized extractions of that work, with write-ups of the problems they solve. The **LLM pipeline** is a direct extraction of the shipped `lib/today/` feature; the **payments** module is the shipped webhook layer plus the hardened form of its reliability design (each module's README says exactly what is shipped vs. hardened).

**Both modules run and are tested standalone** — external boundaries (Anthropic, Stripe, Postgres) sit behind ports with in-memory adapters, so `npm install && npm test` is green with no API keys or database. CI (GitHub Actions) typechecks and tests both on every push.

```bash
cd llm-pipeline        && npm install && npm test   # 20 tests + a 17-case eval harness
cd payments-reliability && npm install && npm test   # 17 tests
```

- Contact: jeremyhejian@gmail.com · Vancouver, BC
- Built with an AI-assisted workflow (Claude Code, Cursor) — every line reviewed, run, and tested by me.
