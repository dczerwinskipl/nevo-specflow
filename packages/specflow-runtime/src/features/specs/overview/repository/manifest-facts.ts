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
 *
 * Progress is not a manifest fact: the manifest lists no Tasks (they are the Specification's
 * `tasks/index.yaml`, which the Tasks owner reads through the Engine).
 */
export interface ManifestOverviewFacts {
  readonly status: typeof OVERVIEW_SPEC_STATUS;
  readonly readyForWork: boolean;
}

export function manifestOverviewFacts(): ManifestOverviewFacts {
  return { status: OVERVIEW_SPEC_STATUS, readyForWork: false };
}
