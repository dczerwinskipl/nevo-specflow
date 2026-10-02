export const PASSWORD_ACCOUNT_ATTEMPT_LIMIT = 5;
export const PASSWORD_ACCOUNT_WINDOW_MS = 15 * 60 * 1000;
export const PASSWORD_SOURCE_ATTEMPT_LIMIT = 10;
export const PASSWORD_SOURCE_WINDOW_MS = 60 * 1000;

const DEFAULT_MAX_ACCOUNT_KEYS = 2_048;
const DEFAULT_MAX_SOURCE_KEYS = 2_048;

export type PasswordLoginThrottleDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

export interface PasswordLoginThrottle {
  consume(account: string, source: string): PasswordLoginThrottleDecision;
  resetAccount(account: string): void;
}

export interface PasswordLoginThrottleOptions {
  readonly now?: () => number;
  readonly accountLimit?: number;
  readonly accountWindowMs?: number;
  readonly sourceLimit?: number;
  readonly sourceWindowMs?: number;
  readonly maxAccountKeys?: number;
  readonly maxSourceKeys?: number;
}

interface AttemptWindow {
  count: number;
  readonly resetsAt: number;
}

export class InMemoryPasswordLoginThrottle implements PasswordLoginThrottle {
  private readonly now: () => number;
  private readonly accountLimit: number;
  private readonly accountWindowMs: number;
  private readonly sourceLimit: number;
  private readonly sourceWindowMs: number;
  private readonly maxAccountKeys: number;
  private readonly maxSourceKeys: number;
  private readonly accounts = new Map<string, AttemptWindow>();
  private readonly sources = new Map<string, AttemptWindow>();

  constructor(options: PasswordLoginThrottleOptions = {}) {
    this.now = options.now ?? Date.now;
    this.accountLimit = positiveInteger(
      options.accountLimit ?? PASSWORD_ACCOUNT_ATTEMPT_LIMIT,
      'accountLimit',
    );
    this.accountWindowMs = positive(
      options.accountWindowMs ?? PASSWORD_ACCOUNT_WINDOW_MS,
      'accountWindowMs',
    );
    this.sourceLimit = positiveInteger(
      options.sourceLimit ?? PASSWORD_SOURCE_ATTEMPT_LIMIT,
      'sourceLimit',
    );
    this.sourceWindowMs = positive(
      options.sourceWindowMs ?? PASSWORD_SOURCE_WINDOW_MS,
      'sourceWindowMs',
    );
    this.maxAccountKeys = positiveInteger(
      options.maxAccountKeys ?? DEFAULT_MAX_ACCOUNT_KEYS,
      'maxAccountKeys',
    );
    this.maxSourceKeys = positiveInteger(
      options.maxSourceKeys ?? DEFAULT_MAX_SOURCE_KEYS,
      'maxSourceKeys',
    );
  }

  consume(account: string, source: string): PasswordLoginThrottleDecision {
    const now = this.now();
    const accountKey = normalizeAccount(account);
    const sourceKey = normalizeSource(source);
    const accountWindow = currentWindow(
      this.accounts,
      accountKey,
      now,
      this.accountWindowMs,
      this.maxAccountKeys,
    );
    const sourceWindow = currentWindow(
      this.sources,
      sourceKey,
      now,
      this.sourceWindowMs,
      this.maxSourceKeys,
    );

    const retryAt = Math.max(
      accountWindow.count >= this.accountLimit ? accountWindow.resetsAt : 0,
      sourceWindow.count >= this.sourceLimit ? sourceWindow.resetsAt : 0,
    );
    if (retryAt > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now) / 1000)),
      };
    }

    accountWindow.count += 1;
    sourceWindow.count += 1;
    return { allowed: true };
  }

  resetAccount(account: string): void {
    this.accounts.delete(normalizeAccount(account));
  }
}

function currentWindow(
  windows: Map<string, AttemptWindow>,
  key: string,
  now: number,
  windowMs: number,
  maxKeys: number,
): AttemptWindow {
  const existing = windows.get(key);
  if (existing && existing.resetsAt > now) {
    return existing;
  }

  if (existing) {
    windows.delete(key);
  }
  evictOldest(windows, maxKeys);

  const created: AttemptWindow = { count: 0, resetsAt: now + windowMs };
  windows.set(key, created);
  return created;
}

function evictOldest<T>(map: Map<string, T>, maxEntries: number): void {
  while (map.size >= maxEntries) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) {
      return;
    }
    map.delete(oldest);
  }
}

function normalizeAccount(account: string): string {
  return account.trim().toLowerCase();
}

function normalizeSource(source: string): string {
  const normalized = source.trim();
  return normalized || 'unknown';
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
