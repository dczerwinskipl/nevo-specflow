/** Weak comparison of `If-None-Match` (a list of entity tags, or `*`) with the current entity tag. */
export function matchesEtag(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header
    .split(',')
    .map((item) => item.trim().replace(/^W\//u, ''))
    .some((item) => item === '*' || item === etag);
}
