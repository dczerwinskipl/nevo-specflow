export type Row = Record<string, string | number | bigint | null | Uint8Array>;
export class StoreFault extends Error {
  readonly code: string;
  readonly details?: { turnId?: string; reason?: string };
  constructor(code: string, message: string, details?: { turnId?: string; reason?: string }) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
export function fail(code: string, message: string): never {
  throw new StoreFault(code, message);
}
export const decode = <T>(value: Row | undefined, key = 'data'): T => {
  if (!value || typeof value[key] !== 'string')
    return fail('SESSION_RESOURCE_NOT_FOUND', 'Resource is unavailable.');
  return JSON.parse(value[key]) as T;
};
export function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return (
    '{' +
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => JSON.stringify(k) + ':' + stable(v))
      .join(',') +
    '}'
  );
}
export function prefix(bytes: Uint8Array, limit: number): string {
  let end = Math.min(bytes.length, limit);
  while (end > 0) {
    try {
      return new TextDecoder('utf8', { fatal: true }).decode(bytes.subarray(0, end));
    } catch {
      end--;
      if (end < Math.min(bytes.length, limit) - 4) throw new Error('Invalid content encoding');
    }
  }
  return '';
}

/** Keep the newest contiguous membership, including JSON escaping and envelope/cursor bytes. */
export function boundedPage<Item, Page>(
  items: Item[],
  hasOlder: boolean,
  project: (items: Item[], hasOlder: boolean) => Page,
): Page {
  for (;;) {
    const page = project(items, hasOlder);
    // HTTP may replace capability true with false and readiness with unavailable after this read.
    if (Buffer.byteLength(JSON.stringify(page), 'utf8') <= 256 * 1024 - 64) return page;
    if (items.length <= 1)
      fail('SESSION_PAYLOAD_TOO_LARGE', 'Session page metadata exceeds its byte budget.');
    items = items.slice(1);
    hasOlder = true;
  }
}
