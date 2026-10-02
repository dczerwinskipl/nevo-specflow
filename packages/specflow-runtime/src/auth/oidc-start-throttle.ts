export const OIDC_START_SOURCE_ATTEMPT_LIMIT = 10;
export const OIDC_START_SOURCE_WINDOW_MS = 60 * 1000;

const DEFAULT_MAX_SOURCE_KEYS = 2_048;

export type OidcStartThrottleDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

export interface OidcStartThrottle {
  consume(source: string): OidcStartThrottleDecision;
}

export interface OidcStartThrottleOptions {
  readonly now?: () => number;
  readonly sourceLimit?: number;
  readonly sourceWindowMs?: number;
  readonly maxSourceKeys?: number;
}

interface AttemptWindow {
  count: number;
  readonly resetsAt: number;
}

export class InMemoryOidcStartThrottle implements OidcStartThrottle {
  private readonly now: () => number;
  private readonly sourceLimit: number;
  private readonly sourceWindowMs: number;
  private readonly maxSourceKeys: number;
  private readonly sources = new Map<string, AttemptWindow>();

  constructor(options: OidcStartThrottleOptions = {}) {
    this.now = options.now ?? Date.now;
    this.sourceLimit = positiveInteger(
      options.sourceLimit ?? OIDC_START_SOURCE_ATTEMPT_LIMIT,
      'sourceLimit',
    );
    this.sourceWindowMs = positive(
      options.sourceWindowMs ?? OIDC_START_SOURCE_WINDOW_MS,
      'sourceWindowMs',
    );
    this.maxSourceKeys = positiveInteger(
      options.maxSourceKeys ?? DEFAULT_MAX_SOURCE_KEYS,
      'maxSourceKeys',
    );
  }

  consume(source: string): OidcStartThrottleDecision {
    const now = this.now();
    const key = normalizeSource(source);
    const window = currentWindow(this.sources, key, now, this.sourceWindowMs, this.maxSourceKeys);

    if (window.count >= this.sourceLimit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((window.resetsAt - now) / 1000)),
      };
    }

    window.count += 1;
    return { allowed: true };
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
