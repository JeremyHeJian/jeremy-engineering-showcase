import { describe, it, expect, beforeEach } from "vitest";
import Stripe from "stripe";
import { handleStripeWebhook, type HandlerDeps } from "./handler";
import { WebhookVerificationError } from "./verify";
import {
  InMemoryBookingStore,
  InMemoryStripeAccountStore,
  InMemoryProcessedEventStore,
  InMemoryAuditLog,
  type BookingStore,
} from "./stores";
import type { Booking, StripeAccount } from "./types";

// A real Stripe instance, used only for its signing/verifying utilities — no
// API calls are made.
const WEBHOOK_SECRET = "whsec_test_secret";
const stripe = new Stripe("sk_test_dummy", {
  apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion,
});

function signed(eventObj: unknown): { rawBody: string; signature: string } {
  const rawBody = JSON.stringify(eventObj);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret: WEBHOOK_SECRET,
  });
  return { rawBody, signature };
}

function checkoutEvent(opts: {
  id: string;
  created: number;
  bookingId?: string;
  paymentIntent?: string;
}) {
  return {
    id: opts.id,
    object: "event",
    type: "checkout.session.completed",
    created: opts.created,
    data: {
      object: {
        id: `cs_${opts.id}`,
        object: "checkout.session",
        payment_intent: opts.paymentIntent ?? "pi_1",
        metadata: opts.bookingId ? { bookingId: opts.bookingId } : {},
      },
    },
  };
}

function accountEvent(opts: {
  id: string;
  created: number;
  accountId: string;
  charges: boolean;
  payouts: boolean;
  details: boolean;
}) {
  return {
    id: opts.id,
    object: "event",
    type: "account.updated",
    created: opts.created,
    data: {
      object: {
        id: opts.accountId,
        object: "account",
        charges_enabled: opts.charges,
        payouts_enabled: opts.payouts,
        details_submitted: opts.details,
      },
    },
  };
}

let deps: HandlerDeps;
let bookings: InMemoryBookingStore;
let accounts: InMemoryStripeAccountStore;
let audit: InMemoryAuditLog;

const seedBooking: Booking = {
  id: "bk_1",
  status: "PENDING",
  totalAmount: 60,
  platformFee: 6,
};
const seedAccount: StripeAccount = {
  stripeAccountId: "acct_1",
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
};

beforeEach(() => {
  bookings = new InMemoryBookingStore([seedBooking]);
  accounts = new InMemoryStripeAccountStore([seedAccount]);
  audit = new InMemoryAuditLog();
  deps = {
    stripe,
    secrets: [WEBHOOK_SECRET],
    bookings,
    accounts,
    processedEvents: new InMemoryProcessedEventStore(),
    audit,
  };
});

describe("signature verification", () => {
  it("rejects a missing signature", async () => {
    const { rawBody } = signed(checkoutEvent({ id: "evt_1", created: 100, bookingId: "bk_1" }));
    await expect(handleStripeWebhook(rawBody, null, deps)).rejects.toBeInstanceOf(
      WebhookVerificationError,
    );
  });

  it("rejects a payload signed with the wrong secret", async () => {
    const rawBody = JSON.stringify(checkoutEvent({ id: "evt_1", created: 100, bookingId: "bk_1" }));
    const badSig = stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret: "whsec_wrong" });
    await expect(handleStripeWebhook(rawBody, badSig, deps)).rejects.toBeInstanceOf(
      WebhookVerificationError,
    );
  });

  it("accepts one of several configured secrets (Connect dual-secret)", async () => {
    deps.secrets = ["whsec_other", WEBHOOK_SECRET];
    const { rawBody, signature } = signed(checkoutEvent({ id: "evt_1", created: 100, bookingId: "bk_1" }));
    const res = await handleStripeWebhook(rawBody, signature, deps);
    expect(res.outcome).toBe("applied");
  });
});

describe("checkout.session.completed", () => {
  it("marks the booking paid + CONFIRMED", async () => {
    const { rawBody, signature } = signed(checkoutEvent({ id: "evt_1", created: 100, bookingId: "bk_1", paymentIntent: "pi_9" }));
    const res = await handleStripeWebhook(rawBody, signature, deps);
    expect(res.outcome).toBe("applied");

    const b = await bookings.get("bk_1");
    expect(b?.status).toBe("CONFIRMED");
    expect(b?.paidAt).toEqual(new Date(100 * 1000));
    expect(b?.stripePaymentIntentId).toBe("pi_9");
  });

  it("is a no-op when bookingId is missing from metadata", async () => {
    const { rawBody, signature } = signed(checkoutEvent({ id: "evt_1", created: 100 }));
    const res = await handleStripeWebhook(rawBody, signature, deps);
    expect(res.outcome).toBe("noop");
    expect((await bookings.get("bk_1"))?.paidAt).toBeUndefined();
  });

  it("is a no-op for an unknown bookingId (no throw)", async () => {
    const { rawBody, signature } = signed(checkoutEvent({ id: "evt_1", created: 100, bookingId: "does-not-exist" }));
    const res = await handleStripeWebhook(rawBody, signature, deps);
    expect(res.outcome).toBe("noop");
  });
});

describe("idempotency (duplicated delivery)", () => {
  it("re-delivery of the SAME event id is a duplicate no-op", async () => {
    const evt = signed(checkoutEvent({ id: "evt_dup", created: 100, bookingId: "bk_1" }));
    const first = await handleStripeWebhook(evt.rawBody, evt.signature, deps);
    expect(first.outcome).toBe("applied");
    const paidAt = (await bookings.get("bk_1"))?.paidAt;

    const second = await handleStripeWebhook(evt.rawBody, evt.signature, deps);
    expect(second.outcome).toBe("duplicate");
    expect((await bookings.get("bk_1"))?.paidAt).toEqual(paidAt);
  });

  it("a DIFFERENT event id for an already-paid booking does not reset paidAt", async () => {
    const a = signed(checkoutEvent({ id: "evt_a", created: 100, bookingId: "bk_1" }));
    await handleStripeWebhook(a.rawBody, a.signature, deps);
    const paidAt = (await bookings.get("bk_1"))?.paidAt;

    const b = signed(checkoutEvent({ id: "evt_b", created: 150, bookingId: "bk_1" }));
    const res = await handleStripeWebhook(b.rawBody, b.signature, deps);
    expect(res.outcome).toBe("noop");
    expect(res.detail).toContain("already paid");
    expect((await bookings.get("bk_1"))?.paidAt).toEqual(paidAt);
  });
});

describe("claim release on failure (so Stripe's retry can reprocess)", () => {
  it("releases the event-id claim when applying throws, then a retry applies", async () => {
    const evt = signed(checkoutEvent({ id: "evt_boom", created: 100, bookingId: "bk_1" }));
    const processedEvents = new InMemoryProcessedEventStore();

    // First delivery: the booking store fails mid-apply → handler releases the
    // claim and rethrows (the route would surface a 500 and Stripe retries).
    const throwingBookings: BookingStore = {
      get: async () => ({ ...seedBooking }),
      update: async () => undefined,
      markPaidIfUnpaid: async () => {
        throw new Error("db down");
      },
      all: async () => [],
    };
    await expect(
      handleStripeWebhook(evt.rawBody, evt.signature, { ...deps, processedEvents, bookings: throwingBookings }),
    ).rejects.toThrow("db down");

    // Retry of the SAME event id with a healthy store: NOT a duplicate — the
    // claim was released — so it applies.
    const res = await handleStripeWebhook(evt.rawBody, evt.signature, { ...deps, processedEvents });
    expect(res.outcome).toBe("applied");
    expect((await bookings.get("bk_1"))?.paidAt).not.toBeUndefined();
  });
});

describe("event-time ordering (out-of-order delivery)", () => {
  it("a stale account.updated cannot regress newer state", async () => {
    // Newer event enables charges/payouts.
    const newer = signed(accountEvent({ id: "evt_new", created: 200, accountId: "acct_1", charges: true, payouts: true, details: true }));
    await handleStripeWebhook(newer.rawBody, newer.signature, deps);
    expect((await accounts.getByStripeId("acct_1"))?.chargesEnabled).toBe(true);

    // An OLDER event (lower `created`) that would disable them arrives late.
    const older = signed(accountEvent({ id: "evt_old", created: 100, accountId: "acct_1", charges: false, payouts: false, details: false }));
    const res = await handleStripeWebhook(older.rawBody, older.signature, deps);
    expect(res.outcome).toBe("stale");
    // State did NOT regress.
    expect((await accounts.getByStripeId("acct_1"))?.chargesEnabled).toBe(true);
  });
});

describe("account.updated + unknown types", () => {
  it("syncs capability flags", async () => {
    const { rawBody, signature } = signed(accountEvent({ id: "evt_1", created: 100, accountId: "acct_1", charges: true, payouts: true, details: true }));
    const res = await handleStripeWebhook(rawBody, signature, deps);
    expect(res.outcome).toBe("applied");
    const a = await accounts.getByStripeId("acct_1");
    expect(a).toMatchObject({ chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true });
  });

  it("ignores event types we don't handle", async () => {
    const { rawBody, signature } = signed({ id: "evt_x", object: "event", type: "customer.created", created: 100, data: { object: { id: "cus_1" } } });
    const res = await handleStripeWebhook(rawBody, signature, deps);
    expect(res.outcome).toBe("ignored");
  });
});

describe("append-only audit trail", () => {
  it("records every event received and every transition, in order", async () => {
    const { rawBody, signature } = signed(checkoutEvent({ id: "evt_1", created: 100, bookingId: "bk_1" }));
    await handleStripeWebhook(rawBody, signature, deps);
    const kinds = audit.entries.map((e) => e.kind);
    expect(kinds).toEqual(["received", "applied"]);
  });
});
