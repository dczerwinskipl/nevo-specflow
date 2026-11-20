import { CAPABILITY_PATTERN } from './registry';

export const REDACTED_CAPABILITY = '[redacted agent capability]';

/**
 * `text` without any invocation capability: the values named (in their plain, JSON-escaped and
 * URL-encoded forms) and anything shaped like a capability, minted here or not. Used for what the
 * Runtime stores from a Turn (transcript, tool input and output, outcome errors).
 */
export function redactCapabilities(text: string, values: readonly string[] = []): string {
  let redacted = text;
  for (const value of values.filter((entry) => entry.length > 0)) {
    for (const form of new Set([
      value,
      JSON.stringify(value).slice(1, -1),
      encodeURIComponent(value),
    ])) {
      redacted = redacted.split(form).join(REDACTED_CAPABILITY);
    }
  }

  return redacted.replace(CAPABILITY_PATTERN, REDACTED_CAPABILITY);
}
