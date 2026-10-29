/**
 * The human key of a Specification (`nevo-1234`): given once at Create, never reused, stored in the
 * manifest (`key`). One fixed prefix for now (owner decision): {@link SPEC_KEY_PREFIX} is the single
 * place a later per-category prefix replaces. Pure.
 *
 * The number is one more than the highest number any Specification of the project (active and
 * archived, in every checkout the Project Home knows) or any reserved Create already holds. Create
 * allocates it under the Project Home lock that also serializes its reservations, so two Creates of
 * one Project Home never get the same key; separate clones of a repository each count their own
 * Specifications (the number is unique per Project Home, not across clones).
 */
export const SPEC_KEY_PREFIX = 'nevo';

/** Any `<prefix>-<number>`: what the manifest accepts (a later prefix stays readable). */
export const SPEC_KEY_PATTERN = /^[a-z][a-z0-9]{0,15}-[1-9][0-9]{0,8}$/u;

export function isSpecKey(value: unknown): value is string {
  return typeof value === 'string' && SPEC_KEY_PATTERN.test(value);
}

/** The number of a key with the current prefix, `undefined` for any other value. */
export function specKeyNumber(key: string | undefined): number | undefined {
  if (key === undefined || !key.startsWith(SPEC_KEY_PREFIX + '-') || !isSpecKey(key)) {
    return undefined;
  }

  return Number(key.slice(SPEC_KEY_PREFIX.length + 1));
}

/** The next key after every key given (`nevo-1` when there is none). */
export function nextSpecKey(existing: Iterable<string | undefined>): string {
  let highest = 0;
  for (const key of existing) {
    highest = Math.max(highest, specKeyNumber(key) ?? 0);
  }

  return `${SPEC_KEY_PREFIX}-${highest + 1}`;
}
