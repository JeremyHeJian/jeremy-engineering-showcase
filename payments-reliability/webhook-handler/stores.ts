import type { Booking, StripeAccount } from "./types";

// Ports (interfaces) + in-memory adapters. The handler and the reconciliation
// job depend only on these interfaces, so swapping the in-memory adapters for
// Prisma/Postgres is the only change needed to run against a real database.

// ── Bookings ────────────────────────────────────────────────────────────────
export interface BookingStore {
  get(id: string): Promise<Booking | undefined>;
  update(id: string, patch: Partial<Booking>): Promise<Booking | undefined>;
  all(): Promise<Booking[]>;
}

export class InMemoryBookingStore implements BookingStore {
  private readonly rows = new Map<string, Booking>();

  constructor(seed: Booking[] = []) {
    for (const b of seed) this.rows.set(b.id, { ...b });
  }

  async get(id: string): Promise<Booking | undefined> {
    const b = this.rows.get(id);
    return b ? { ...b } : undefined;
  }

  async update(id: string, patch: Partial<Booking>): Promise<Booking | undefined> {
    const b = this.rows.get(id);
    if (!b) return undefined;
    const next = { ...b, ...patch };
    this.rows.set(id, next);
    return { ...next };
  }

  async all(): Promise<Booking[]> {
    return [...this.rows.values()].map((b) => ({ ...b }));
  }
}

// ── Stripe connected accounts ───────────────────────────────────────────────
export interface StripeAccountStore {
  getByStripeId(stripeAccountId: string): Promise<StripeAccount | undefined>;
  update(stripeAccountId: string, patch: Partial<StripeAccount>): Promise<StripeAccount | undefined>;
  all(): Promise<StripeAccount[]>;
}

export class InMemoryStripeAccountStore implements StripeAccountStore {
  private readonly rows = new Map<string, StripeAccount>();

  constructor(seed: StripeAccount[] = []) {
    for (const a of seed) this.rows.set(a.stripeAccountId, { ...a });
  }

  async getByStripeId(id: string): Promise<StripeAccount | undefined> {
    const a = this.rows.get(id);
    return a ? { ...a } : undefined;
  }

  async update(id: string, patch: Partial<StripeAccount>): Promise<StripeAccount | undefined> {
    const a = this.rows.get(id);
    if (!a) return undefined;
    const next = { ...a, ...patch };
    this.rows.set(id, next);
    return { ...next };
  }

  async all(): Promise<StripeAccount[]> {
    return [...this.rows.values()].map((a) => ({ ...a }));
  }
}

// ── Processed-event ledger (idempotency) ────────────────────────────────────
// Append-only record of every Stripe event id we've fully processed. The first
// delivery of an event applies it and records the id; every later delivery of
// the SAME id is recognised and skipped. In production this is a table with a
// UNIQUE constraint on the event id — the DB itself enforces exactly-once.
export interface ProcessedEventStore {
  has(eventId: string): Promise<boolean>;
  add(eventId: string, meta: { type: string; created: number }): Promise<void>;
}

export class InMemoryProcessedEventStore implements ProcessedEventStore {
  private readonly seen = new Map<string, { type: string; created: number; at: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async has(eventId: string): Promise<boolean> {
    return this.seen.has(eventId);
  }

  async add(eventId: string, meta: { type: string; created: number }): Promise<void> {
    if (this.seen.has(eventId)) return; // append-only, never overwrite
    this.seen.set(eventId, { ...meta, at: this.now() });
  }
}

// ── Append-only audit trail ─────────────────────────────────────────────────
// Every event received and every state transition, in order, so any booking or
// payout state is traceable to the exact sequence that produced it.
export type AuditEntry = {
  at: number;
  kind: "received" | "applied" | "duplicate" | "stale" | "ignored" | "noop" | "reconciled";
  eventId?: string;
  type?: string;
  target?: string; // booking id / stripe account id
  detail?: string;
};

export interface AuditLog {
  record(entry: Omit<AuditEntry, "at">): Promise<void>;
  readonly entries: readonly AuditEntry[];
}

export class InMemoryAuditLog implements AuditLog {
  private readonly _entries: AuditEntry[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  async record(entry: Omit<AuditEntry, "at">): Promise<void> {
    this._entries.push({ ...entry, at: this.now() });
  }

  get entries(): readonly AuditEntry[] {
    return this._entries;
  }
}
