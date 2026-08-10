import type Stripe from "stripe";

// ── Mechanism 1: signature verification ──────────────────────────────────────
//
// Every incoming webhook is verified against Stripe's signing secret before
// anything else touches it. Unverified payloads are rejected (the caller maps
// the thrown error to a 400) and never reach a handler.
//
// Multiple signing secrets are supported (comma-separated in one env var).
// Stripe issues a separate signing secret per destination, and Connect with
// destination charges requires two: one scoped to "Your account" (checkout,
// transfer) and one scoped to "Connected accounts" (account.updated on sitter
// accounts). We try each until one verifies.

export class WebhookVerificationError extends Error {}

export function parseSecrets(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function verifyStripeSignature(
  stripe: Pick<Stripe, "webhooks">,
  rawBody: string,
  signature: string | null,
  secrets: string[],
): Stripe.Event {
  if (!signature) {
    throw new WebhookVerificationError("Missing stripe-signature header");
  }
  if (secrets.length === 0) {
    throw new WebhookVerificationError("No webhook signing secret configured");
  }

  let lastErr: unknown = null;
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new WebhookVerificationError(
    `Signature verification failed: ${lastErr instanceof Error ? lastErr.message : "unknown"}`,
  );
}
