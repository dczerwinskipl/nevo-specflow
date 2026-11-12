import type { SpecProgressRecord } from './model';

/**
 * The status every Current Specification has until a workflow defines others (owner decision): one
 * constant of the read model, so it is replaced in one place. The manifest's free `status` string is
 * not interpreted.
 */
export const OVERVIEW_SPEC_STATUS = 'draft';

/**
 * Overview facts a canonical manifest can vouch for, and nothing more (`reference.api.specs-overview`,
 * "Project mode"). Pure.
 *
 * - **Status** is {@link OVERVIEW_SPEC_STATUS}, so a Specification is not ready for work (Draft).
 * - **Progress** is `null` (not projected), never a guessed count: the manifest no longer lists
 *   Tasks (they are the Specification's `tasks/index.yaml`, read by the Engine), so it is no evidence
 *   of progress either way.
 */
export interface ManifestOverviewFacts {
  readonly status: typeof OVERVIEW_SPEC_STATUS;
  readonly readyForWork: boolean;
  readonly progress: SpecProgressRecord | null;
}

export function manifestOverviewFacts(): ManifestOverviewFacts {
  return { status: OVERVIEW_SPEC_STATUS, readyForWork: false, progress: null };
}
