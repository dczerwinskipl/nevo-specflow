/** Small structural guards the durable records share (journals, leases, the ledger). Pure. */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The object has every required key, no key outside `keys`, and each optional key may be absent. */
export function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const names = Object.keys(value);

  return (
    names.every((name) => keys.includes(name)) &&
    keys.every((key) => optional.includes(key) || names.includes(key))
  );
}

export function isIsoInstant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function isCount(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}

export function isShortText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}
