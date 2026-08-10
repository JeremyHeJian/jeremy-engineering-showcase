# Payments Reliability — Stripe webhooks on sitterlinks.com

The webhook layer of a two-sided marketplace's Stripe Connect integration — engineered so that payment state stays correct when events arrive **late, duplicated, or out of order**.

## The problem

SitterLinks moves money between parents, sitters, and the platform via Stripe Connect (checkout, split payouts). Stripe reports state changes through webhooks — and webhooks come with no delivery guarantees that matter: they can arrive out of order, more than once, or (rarely) not at all. Naively applying each event as it arrives corrupts booking and payout state in ways that pass every test and then break intermittently in production. That intermittent corruption is exactly what happened in early versions — and what this design eliminated.

## Design

### 1. Signature verification
Every incoming webhook is verified against Stripe's signing secret before anything else touches it. Unverified payloads are rejected (the route maps the error to a `400`). Multiple signing secrets are supported — Connect with destination charges needs one for "Your account" and one for "Connected accounts".

→ [`webhook-handler/verify.ts`](./webhook-handler/verify.ts)

### 2. Idempotent event handling
Handlers dedupe on Stripe's stable event ID: an event already processed is acknowledged and skipped. Retried and duplicate deliveries become no-ops instead of double-applied state changes. There's a second, state-level guard too — an already-paid booking is never re-paid even by a *different* event id.

→ [`webhook-handler/stores.ts`](./webhook-handler/stores.ts) (`ProcessedEventStore`) · [`handler.ts`](./webhook-handler/handler.ts)

### 3. Event-time ordering
State transitions are ordered by the **event's own `created` timestamp**, not arrival time. Each aggregate carries a watermark of the last event applied; a stale event arriving after a newer one is dropped and cannot regress state.

→ [`webhook-handler/handler.ts`](./webhook-handler/handler.ts) (`isStale`)

### 4. Reconciliation — Stripe as the source of truth
A scheduled reconciliation job compares locally recorded payment state against Stripe and repairs any drift. Missed deliveries and edge-case races are bounded: the system converges to correct state instead of silently diverging. It's idempotent — safe to run on a cron.

→ [`reconciliation/reconcile.ts`](./reconciliation/reconcile.ts)

### 5. Append-only audit trail
Every event received and every state transition (and every reconciliation repair) is recorded append-only, so any balance or booking state is traceable to the sequence that produced it.

→ [`webhook-handler/stores.ts`](./webhook-handler/stores.ts) (`AuditLog`)

## Running it

```bash
npm install
npm test        # 18 tests: signature reject, duplicate no-op, claim-release on
                # failure, stale-event guard, unknown-booking no-op,
                # reconciliation repair, audit ordering
npm run typecheck
```

This is the shipped design, sanitized. The reliability logic — signature verification, the claim-first event-ID ledger, the event-time ordering guard, reconciliation, the audit trail — is the same as production. The difference is structural: here the boundaries (database, Stripe) sit behind ports with in-memory adapters so the whole thing runs and is tested **offline with no Stripe keys**, whereas production writes directly to Prisma/Postgres and calls the Stripe SDK. The webhook tests sign payloads with Stripe's own `generateTestHeaderString`, so signature verification is exercised end to end.

```
webhook-handler/
  verify.ts    signature verification (multi-secret)
  stores.ts    ports + in-memory: bookings, accounts, processed-events, audit
  handler.ts   verify → dedupe → order → apply → audit
reconciliation/
  gateway.ts   the read side of Stripe, as a port (+ fake)
  reconcile.ts pull Stripe truth, repair local drift, audit every repair
```

## Why it matters

"Done" for a payment system isn't "works in the happy path" — it's *provable convergence to correct state under out-of-order, duplicated, and missing deliveries, with an audit trail*. The full application (auth, booking workflow, payouts) runs live at sitterlinks.com.
