import { createHash } from 'node:crypto';

import type { ArchetypeCatalogue } from '@nevo/specflow-contracts/documents';

/**
 * The ETag of the catalogue route. The revision covers the VALID catalogue only, so a change that only
 * touches the problems (a file turned invalid, a warning fixed) or the unstable flag must change the
 * ETag as well, or a conditional request would be answered `304` for a different response. Without
 * problems the ETag is the revision itself, so a client can still compare it with `catalogueRevision`.
 */
export function catalogueEtag(catalogue: ArchetypeCatalogue): string {
  const problems = catalogue.problems ?? [];
  if (problems.length === 0 && catalogue.unstableRead !== true) {
    return `"${catalogue.revision}"`;
  }

  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        problems,
        problemsTruncated: catalogue.problemsTruncated === true,
        unstableRead: catalogue.unstableRead === true,
      }),
    )
    .digest('hex')
    .slice(0, 16);

  return `"${catalogue.revision}.${digest}"`;
}
