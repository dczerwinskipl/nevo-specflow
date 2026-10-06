import { normalizePasswordUsername } from './username';

export const PASSWORD_ACCOUNT_ATTEMPT_LIMIT = 5;
export const PASSWORD_ACCOUNT_WINDOW_MS = 15 * 60 * 1000;

const DEFAULT_MAX_ACCOUNT_KEYS = 2_048;

interface AttemptWindow {
  count: number;
  readonly resetsAt: number;
}

export type PasswordAccountThrottleDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

export interface PasswordAccountThrottle {
  consume(account: string): PasswordAccountThrottleDecision;
  reset(account: string): void;
}

export interface PasswordAccountThrottleOptions {
  readonly now?: () => number;
  readonly accountLimit?: number;
  readonly accountWindowMs?: number;
  readonly maxAccountKeys?: number;
}

export class InMemoryPasswordAccountThrottle implements PasswordAccountThrottle {
  private readonly now: () => number;
  private readonly accountLimit: number;
  private readonly accountWindowMs: number;
  private readonly maxAccountKeys: number;
  private readonly accounts = new Map<string, AttemptWindow>();

  constructor(options: PasswordAccountThrottleOptions = {}) {
    this.now = options.now ?? Date.now;
    this.accountLimit = positiveInteger(
      options.accountLimit ?? PASSWORD_ACCOUNT_ATTEMPT_LIMIT,
      'accountLimit',
    );
    this.accountWindowMs = positive(
      options.accountWindowMs ?? PASSWORD_ACCOUNT_WINDOW_MS,
      'accountWindowMs',
    );
    this.maxAccountKeys = positiveInteger(
      options.maxAccountKeys ?? DEFAULT_MAX_ACCOUNT_KEYS,
      'maxAccountKeys',
    );
  }

  consume(account: string): PasswordAccountThrottleDecision {
    const now = this.now();
    const key = normalizePasswordUsername(account);
    const existing = this.accounts.get(key);

    if (existing && existing.resetsAt > now) {
      if (existing.count >= this.accountLimit) {
        return {
          allowed: false,
          retryAfterSeconds: retryAfterSeconds(existing.resetsAt, now),
        };
      }

      existing.count += 1;
      return { allowed: true };
    }

    if (existing) this.accounts.delete(key);
    this.pruneExpired(now);

    if (this.accounts.size >= this.maxAccountKeys) {
      const earliestReset = Math.min(
        ...[...this.accounts.values()].map((window) => window.resetsAt),
      );
      return {
        allowed: false,
        retryAfterSeconds: retryAfterSeconds(earliestReset, now),
      };
    }

    this.accounts.set(key, { count: 1, resetsAt: now + this.accountWindowMs });
    return { allowed: true };
  }

  reset(account: string): void {
    this.accounts.delete(normalizePasswordUsername(account));
  }

  private pruneExpired(now: number): void {
    for (const [key, window] of this.accounts) {
      if (window.resetsAt <= now) this.accounts.delete(key);
    }
  }
}

function retryAfterSeconds(resetsAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetsAt - now) / 1000));
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be greater than zero.`);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}
