import { describe, it, expect } from "vitest";
import { reconcile } from "./reconcile";
import { FakeStripeGateway } from "./gateway";
import {
  InMemoryBookingStore,
  InMemoryStripeAccountStore,
  InMemoryAuditLog,
} from "../webhook-handler/stores";
import type { Booking, StripeAccount } from "../webhook-handler/types";

const FIXED_NOW = () => new Date("2026-08-10T00:00:00Z");

describe("reconcile — bookings", () => {
  it("repairs a booking that Stripe reports paid but is unpaid locally (missed webhook)", async () => {
    const booking: Booking = {
      id: "bk_1",
      status: "PENDING",
      totalAmount: 60,
      platformFee: 6,
      stripeCheckoutSessionId: "cs_1",
    };
    const bookings = new InMemoryBookingStore([booking]);
    const audit = new InMemoryAuditLog();
    const gateway = new FakeStripeGateway().setSession({
      id: "cs_1",
      payment_status: "paid",
      payment_intent: "pi_1",
    });

    const summary = await reconcile({
      bookings,
      accounts: new InMemoryStripeAccountStore(),
      gateway,
      audit,
      now: FIXED_NOW,
    });

    expect(summary.bookingsRepaired).toBe(1);
    expect(summary.repairedBookingIds).toEqual(["bk_1"]);
    const b = await bookings.get("bk_1");
    expect(b?.status).toBe("CONFIRMED");
    expect(b?.paidAt).toEqual(FIXED_NOW());
    expect(b?.stripePaymentIntentId).toBe("pi_1");
    expect(audit.entries.some((e) => e.kind === "reconciled" && e.target === "bk_1")).toBe(true);
  });

  it("leaves an already-paid booking untouched (idempotent, safe on a cron)", async () => {
    const paidAt = new Date("2026-08-01T00:00:00Z");
    const bookings = new InMemoryBookingStore([
      { id: "bk_1", status: "CONFIRMED", totalAmount: 60, platformFee: 6, stripeCheckoutSessionId: "cs_1", paidAt },
    ]);
    const gateway = new FakeStripeGateway().setSession({ id: "cs_1", payment_status: "paid", payment_intent: "pi_1" });

    const summary = await reconcile({
      bookings,
      accounts: new InMemoryStripeAccountStore(),
      gateway,
      audit: new InMemoryAuditLog(),
      now: FIXED_NOW,
    });

    expect(summary.bookingsRepaired).toBe(0);
    expect((await bookings.get("bk_1"))?.paidAt).toEqual(paidAt); // unchanged
  });

  it("does not repair a booking Stripe still reports unpaid", async () => {
    const bookings = new InMemoryBookingStore([
      { id: "bk_1", status: "PENDING", totalAmount: 60, platformFee: 6, stripeCheckoutSessionId: "cs_1" },
    ]);
    const gateway = new FakeStripeGateway().setSession({ id: "cs_1", payment_status: "unpaid", payment_intent: null });

    const summary = await reconcile({
      bookings,
      accounts: new InMemoryStripeAccountStore(),
      gateway,
      audit: new InMemoryAuditLog(),
      now: FIXED_NOW,
    });

    expect(summary.bookingsRepaired).toBe(0);
    expect((await bookings.get("bk_1"))?.paidAt).toBeUndefined();
  });
});

describe("reconcile — accounts", () => {
  it("repairs capability flags that drifted from Stripe", async () => {
    const local: StripeAccount = {
      stripeAccountId: "acct_1",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    };
    const accounts = new InMemoryStripeAccountStore([local]);
    const audit = new InMemoryAuditLog();
    const gateway = new FakeStripeGateway().setAccount({
      id: "acct_1",
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    });

    const summary = await reconcile({
      bookings: new InMemoryBookingStore(),
      accounts,
      gateway,
      audit,
      now: FIXED_NOW,
    });

    expect(summary.accountsRepaired).toBe(1);
    expect(await accounts.getByStripeId("acct_1")).toMatchObject({
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
    });
  });

  it("does nothing when local and Stripe agree", async () => {
    const accounts = new InMemoryStripeAccountStore([
      { stripeAccountId: "acct_1", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true },
    ]);
    const gateway = new FakeStripeGateway().setAccount({
      id: "acct_1", charges_enabled: true, payouts_enabled: true, details_submitted: true,
    });

    const summary = await reconcile({
      bookings: new InMemoryBookingStore(),
      accounts,
      gateway,
      audit: new InMemoryAuditLog(),
      now: FIXED_NOW,
    });

    expect(summary.accountsRepaired).toBe(0);
  });
});
