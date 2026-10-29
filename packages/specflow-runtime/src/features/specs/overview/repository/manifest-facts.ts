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
 * - **Progress** comes from `tasks`. A manifest without tasks has nothing to do: `0 / 0` (the UI's
 *   "No tasks"). Task entries have no schema the Engine verifies yet, so a non-empty list is not
 *   progress evidence: `null` (not projected), never a guessed count.
 */
export interface ManifestOverviewFacts {
  readonly status: typeof OVERVIEW_SPEC_STATUS;
  readonly readyForWork: boolean;
  readonly progress: SpecProgressRecord | null;
}

export function manifestOverviewFacts(manifest: {
  readonly tasks: readonly unknown[];
}): ManifestOverviewFacts {
  return {
    status: OVERVIEW_SPEC_STATUS,
    readyForWork: false,
    progress: manifest.tasks.length === 0 ? { completed: 0, total: 0 } : null,
  };
}
