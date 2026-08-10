import type { BookingStore, StripeAccountStore, AuditLog } from "../webhook-handler/stores";
import type { StripeGateway } from "./gateway";

// ── Mechanism 4: reconciliation — Stripe as the source of truth ──────────────
//
// Signature verification + idempotency + ordering keep state correct *when
// events arrive*. Reconciliation handles the case they don't: a webhook that
// Stripe never successfully delivered (the "rarely, not at all" failure mode).
//
// A scheduled job compares local payment state against Stripe and repairs any
// drift, so missed deliveries and edge-case races are bounded — the system
// converges to correct state instead of silently diverging. Every repair is
// written to the same append-only audit trail as live events.
//
// This is idempotent and safe to run on a cron: a booking already consistent
// with Stripe is left untouched.

export type ReconcileSummary = {
  bookingsChecked: number;
  bookingsRepaired: number;
  accountsChecked: number;
  accountsRepaired: number;
  repairedBookingIds: string[];
};

export type ReconcileDeps = {
  bookings: BookingStore;
  accounts: StripeAccountStore;
  gateway: StripeGateway;
  audit: AuditLog;
  now?: () => Date;
};

export async function reconcile(deps: ReconcileDeps): Promise<ReconcileSummary> {
  const now = deps.now?.() ?? new Date();
  const summary: ReconcileSummary = {
    bookingsChecked: 0,
    bookingsRepaired: 0,
    accountsChecked: 0,
    accountsRepaired: 0,
    repairedBookingIds: [],
  };

  // --- Bookings: repair unpaid-locally-but-paid-at-Stripe ---
  for (const booking of await deps.bookings.all()) {
    // Only bookings that reached checkout but aren't marked paid can be the
    // victim of a missed delivery. Anything without a session id, or already
    // paid, is either not applicable or already consistent.
    if (booking.paidAt || !booking.stripeCheckoutSessionId) continue;
    summary.bookingsChecked++;

    const session = await deps.gateway.getCheckoutSession(booking.stripeCheckoutSessionId);
    if (!session || session.payment_status !== "paid") continue;

    // Stripe says paid, local says unpaid → drift. Repair from the source of truth.
    await deps.bookings.update(booking.id, {
      status: "CONFIRMED",
      paidAt: now,
      stripePaymentIntentId: session.payment_intent ?? booking.stripePaymentIntentId,
    });
    await deps.audit.record({
      kind: "reconciled",
      target: booking.id,
      detail: `paid at Stripe but not locally (session ${session.id}) → repaired`,
    });
    summary.bookingsRepaired++;
    summary.repairedBookingIds.push(booking.id);
  }

  // --- Accounts: repair capability flags that drifted (e.g. Connect v2 thin
  //     events the webhook never delivered as account.updated) ---
  for (const local of await deps.accounts.all()) {
    summary.accountsChecked++;
    const remote = await deps.gateway.getAccount(local.stripeAccountId);
    if (!remote) continue;

    const drifted =
      remote.charges_enabled !== local.chargesEnabled ||
      remote.payouts_enabled !== local.payoutsEnabled ||
      remote.details_submitted !== local.detailsSubmitted;
    if (!drifted) continue;

    await deps.accounts.update(local.stripeAccountId, {
      chargesEnabled: remote.charges_enabled,
      payoutsEnabled: remote.payouts_enabled,
      detailsSubmitted: remote.details_submitted,
    });
    await deps.audit.record({
      kind: "reconciled",
      target: local.stripeAccountId,
      detail: "account flags drifted from Stripe → repaired",
    });
    summary.accountsRepaired++;
  }

  return summary;
}
