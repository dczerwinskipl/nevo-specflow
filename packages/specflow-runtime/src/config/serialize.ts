import { stringify } from 'yaml';

export function serializeRuntimeConfig(value: unknown): string {
  return `${stringify(value, { lineWidth: 0 }).trimEnd()}\n`;
}
