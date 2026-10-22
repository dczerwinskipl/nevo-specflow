import { CREATE_RESPOND_ASYNC_PREFERENCE } from '@nevo/specflow-contracts/specs';

/** RFC 7240: `Prefer` is a comma-separated list of tokens with optional parameters. */
export function prefersRespondAsync(header: string | string[] | undefined): boolean {
  const value = Array.isArray(header) ? header.join(',') : header;
  if (!value) return false;
  return value
    .split(',')
    .some((token) => token.split(';')[0]?.trim().toLowerCase() === CREATE_RESPOND_ASYNC_PREFERENCE);
}
