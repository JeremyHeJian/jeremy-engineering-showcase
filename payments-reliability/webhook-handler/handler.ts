import type Stripe from "stripe";
import type {
  BookingStore,
  StripeAccountStore,
  ProcessedEventStore,
  AuditLog,
} from "./stores";
import type { HandlerResult } from "./types";
import { verifyStripeSignature } from "./verify";

// ── The webhook handler ──────────────────────────────────────────────────────
//
// Correct payment state under LATE, DUPLICATED, and OUT-OF-ORDER delivery. The
// pipeline for every delivery:
//
//   verify signature → dedupe on event id → order by event time → apply → audit
//
// Framework-agnostic core of the production Next.js route (app/api/stripe/
// webhooks/route.ts). The route is a thin adapter: read the raw body + the
// `stripe-signature` header, call this, map the result to a status code.

export type HandlerDeps = {
  stripe: Pick<Stripe, "webhooks">;
  secrets: string[];
  bookings: BookingStore;
  accounts: StripeAccountStore;
  processedEvents: ProcessedEventStore;
  audit: AuditLog;
};

export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
  deps: HandlerDeps,
): Promise<HandlerResult> {
  // 1. Verify — throws WebhookVerificationError on failure (caller → 400).
  const event = verifyStripeSignature(deps.stripe, rawBody, signature, deps.secrets);

  await deps.audit.record({
    kind: "received",
    eventId: event.id,
    type: event.type,
  });

  // 2. Idempotency — a duplicate delivery of an event we've already processed is
  //    acknowledged and skipped. Retries become no-ops, not double-applied state.
  if (await deps.processedEvents.has(event.id)) {
    await deps.audit.record({ kind: "duplicate", eventId: event.id, type: event.type });
    return { outcome: "duplicate", eventId: event.id, type: event.type };
  }

  // 3. Dispatch (each branch applies its own event-time ordering guard).
  let result: HandlerResult;
  switch (event.type) {
    case "checkout.session.completed":
      result = await applyCheckoutCompleted(event, deps);
      break;
    case "account.updated":
      result = await applyAccountUpdated(event, deps);
      break;
    default:
      await deps.audit.record({ kind: "ignored", eventId: event.id, type: event.type });
      result = { outcome: "ignored", eventId: event.id, type: event.type };
  }

  // 4. Record the event id as processed (idempotency ledger). We mark it
  //    processed for every non-error outcome — including "stale"/"noop" — so it
  //    is never reconsidered; reconciliation, not webhook replay, repairs drift.
  await deps.processedEvents.add(event.id, { type: event.type, created: event.created });

  return result;
}

// A stale event (older than the last one applied to this aggregate) must never
// regress state. Returns true if `event` should be skipped as stale.
function isStale(lastEventCreated: number | undefined, created: number): boolean {
  return lastEventCreated != null && created < lastEventCreated;
}

async function applyCheckoutCompleted(
  event: Stripe.Event,
  deps: HandlerDeps,
): Promise<HandlerResult> {
  const session = event.data.object as Stripe.Checkout.Session;
  const bookingId = session.metadata?.bookingId;
  const base = { eventId: event.id, type: event.type };

  if (!bookingId) {
    await deps.audit.record({ kind: "noop", ...base, detail: "no bookingId in metadata" });
    return { outcome: "noop", ...base, detail: "no bookingId in metadata" };
  }

  const booking = await deps.bookings.get(bookingId);
  if (!booking) {
    await deps.audit.record({ kind: "noop", ...base, target: bookingId, detail: "unknown booking" });
    return { outcome: "noop", ...base, detail: "unknown booking" };
  }

  // Ordering guard: a stale delivery cannot regress state.
  if (isStale(booking.lastEventCreated, event.created)) {
    await deps.audit.record({ kind: "stale", ...base, target: bookingId });
    return { outcome: "stale", ...base, detail: "older than last applied event" };
  }

  // State-level idempotency: already paid → advance the ordering watermark but
  // don't re-apply (no duplicate email, no reset paidAt).
  if (booking.paidAt) {
    await deps.bookings.update(bookingId, { lastEventCreated: event.created });
    await deps.audit.record({ kind: "noop", ...base, target: bookingId, detail: "already paid" });
    return { outcome: "noop", ...base, detail: "already paid" };
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? undefined);

  await deps.bookings.update(bookingId, {
    status: "CONFIRMED",
    paidAt: new Date(event.created * 1000),
    stripePaymentIntentId: paymentIntentId,
    lastEventCreated: event.created,
  });

  await deps.audit.record({
    kind: "applied",
    ...base,
    target: bookingId,
    detail: "booking marked paid + CONFIRMED",
  });
  return { outcome: "applied", ...base, detail: "booking marked paid + CONFIRMED" };
}

async function applyAccountUpdated(
  event: Stripe.Event,
  deps: HandlerDeps,
): Promise<HandlerResult> {
  const account = event.data.object as Stripe.Account;
  const base = { eventId: event.id, type: event.type };

  const local = await deps.accounts.getByStripeId(account.id);
  if (!local) {
    await deps.audit.record({ kind: "noop", ...base, target: account.id, detail: "unknown account" });
    return { outcome: "noop", ...base, detail: "unknown account" };
  }

  if (isStale(local.lastEventCreated, event.created)) {
    await deps.audit.record({ kind: "stale", ...base, target: account.id });
    return { outcome: "stale", ...base, detail: "older than last applied event" };
  }

  await deps.accounts.update(account.id, {
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
    lastEventCreated: event.created,
  });

  await deps.audit.record({ kind: "applied", ...base, target: account.id, detail: "account flags synced" });
  return { outcome: "applied", ...base, detail: "account flags synced" };
}
