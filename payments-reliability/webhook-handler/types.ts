// Domain shapes for the marketplace payment layer.
//
// In production (sitterlinks.com) these are Prisma models over PostgreSQL. Here
// they're plain types backed by in-memory stores (see `stores.ts`) so the
// reliability logic — idempotency, event-time ordering, reconciliation, audit —
// runs and is tested without a database.

export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED";

export type Booking = {
  id: string;
  status: BookingStatus;
  totalAmount: number;
  platformFee: number;

  // Set when the checkout session is created (before payment) so a missed
  // webhook can still be reconciled against Stripe later.
  stripeCheckoutSessionId?: string;

  // Payment state, applied by the webhook handler (or repaired by reconciliation).
  stripePaymentIntentId?: string;
  stripeTransferId?: string;
  paidAt?: Date;
  payoutAt?: Date;

  // Event-time ordering guard: the `created` timestamp (unix seconds) of the
  // most recent Stripe event applied to this row. A stale event (older than
  // this) is never applied, so state cannot regress.
  lastEventCreated?: number;
};

export type StripeAccount = {
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  lastEventCreated?: number;
};

// The outcome of handling one webhook delivery. Every branch is a 200 to Stripe
// EXCEPT a signature failure (surfaced as a thrown error the caller maps to 400)
// — acknowledging duplicates/stale/ignored events stops Stripe from retrying
// deliveries that are already handled or intentionally skipped.
export type HandlerOutcome =
  | "applied" // state changed
  | "duplicate" // event id already processed (idempotent no-op)
  | "stale" // an older event arrived after a newer one (ordering guard)
  | "ignored" // event type we don't handle
  | "noop"; // handled type, but nothing to do (missing/unknown target)

export type HandlerResult = {
  outcome: HandlerOutcome;
  eventId: string;
  type: string;
  detail?: string;
};
