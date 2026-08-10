# Payments Reliability — Stripe webhooks on sitterlinks.com

The webhook layer of a two-sided marketplace's Stripe Connect integration — engineered so that payment state stays correct when events arrive **late, duplicated, or out of order**.

## The problem

SitterLinks moves money between parents, sitters, and the platform via Stripe Connect (checkout, split payouts). Stripe reports state changes through webhooks — and webhooks come with no delivery guarantees that matter: they can arrive out of order, more than once, or (rarely) not at all. Naively applying each event as it arrives corrupts booking and payout state in ways that pass every test and then break intermittently in production. That intermittent corruption is exactly what happened in early versions — and what this design eliminated.

## Design

### 1. Signature verification
Every incoming webhook is verified against Stripe's signing secret before anything else. Unverified payloads are rejected and logged.

### 2. Idempotent event handling
Handlers dedupe on Stripe's stable event ID: an event already processed is acknowledged and skipped. Retried and duplicate deliveries become no-ops instead of double-applied state changes.

### 3. Event-time ordering
State transitions are ordered by the **event's own timestamp**, not arrival time. A stale event arriving after a newer one cannot regress state.

→ [`webhook-handler/`](./webhook-handler/)

### 4. Reconciliation — Stripe as the source of truth
A scheduled reconciliation job compares locally recorded payment state against Stripe and repairs any drift. Missed deliveries and edge-case races are bounded: the system converges to correct state instead of silently diverging.

→ [`reconciliation/`](./reconciliation/)

### 5. Append-only audit trail
Every event and every state transition is recorded append-only, so any balance or booking state is traceable to the sequence that produced it.

## Why it matters

"Done" for a payment system isn't "works in the happy path" — it's *provable convergence to correct state under out-of-order, duplicated, and missing deliveries, with an audit trail*. This module is the sanitized core of the production implementation; the full application (auth, booking workflow, payouts) runs live at sitterlinks.com.
