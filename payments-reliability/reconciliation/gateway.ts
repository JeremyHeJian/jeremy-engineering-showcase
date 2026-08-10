// The read side of Stripe, as a narrow port. Reconciliation treats Stripe as
// the source of truth and pulls the minimum it needs to compare against local
// state. The production adapter wraps the Stripe SDK; the fake below drives the
// tests without network access.

export type RemoteCheckoutSession = {
  id: string;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  payment_intent: string | null;
};

export type RemoteAccount = {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
};

export interface StripeGateway {
  getCheckoutSession(id: string): Promise<RemoteCheckoutSession | null>;
  getAccount(id: string): Promise<RemoteAccount | null>;
}

// In-memory fake. Seed it with the "truth" Stripe would report, then assert the
// reconciliation job converges local state to it.
export class FakeStripeGateway implements StripeGateway {
  constructor(
    private readonly sessions: Map<string, RemoteCheckoutSession> = new Map(),
    private readonly accounts: Map<string, RemoteAccount> = new Map(),
  ) {}

  setSession(s: RemoteCheckoutSession): this {
    this.sessions.set(s.id, s);
    return this;
  }

  setAccount(a: RemoteAccount): this {
    this.accounts.set(a.id, a);
    return this;
  }

  async getCheckoutSession(id: string): Promise<RemoteCheckoutSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async getAccount(id: string): Promise<RemoteAccount | null> {
    return this.accounts.get(id) ?? null;
  }
}
