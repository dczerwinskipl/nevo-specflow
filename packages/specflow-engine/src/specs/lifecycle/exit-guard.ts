/**
 * The Specification exit gate of Close (D07), as a port: Close does not know the workflow. The Engine
 * composition root (`engine.ts`) supplies it from the workflow capability (`closeBlockers`). It
 * reads without a lock: Close calls it in its preview and again inside its reservation, under the
 * project control lock.
 */

/** One group of what keeps the Specification from being archived; Close lists them as given. */
export interface SpecificationExitBlocker {
  /** For example `draft-tasks`, `specification-run`, `pending-execution-change`. */
  readonly kind: string;
  /** Task ids, or the Specification id for the Specification run and Specification-wide holds. */
  readonly subjectIds: readonly string[];
  readonly message: string;
}

/** None when the workflow lets the Specification be archived. */
export type SpecificationExitGuard = (
  specId: string,
) => Promise<readonly SpecificationExitBlocker[]>;
