import {
  SpecificationError,
  readCanonicalSpecSources,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

/** The shape of the Specification workspace `tasks` section (the Specs feature consumes it). */
export type WorkspaceTasksSection =
  | {
      readonly state: 'available';
      readonly data: {
        readonly groups: never[];
        readonly completed: 0;
        readonly total: 0;
        readonly attention: never[];
      };
    }
  | { readonly state: 'unavailable'; readonly reason: 'not_implemented' | 'source_unavailable' };

/**
 * The verified manifest `tasks` as a workspace section: an empty list is a verified fact (no Tasks,
 * an available empty section); entries have no schema the Engine verifies, so a non-empty list is
 * `not_implemented`, never a guessed Task. The same rule as the Specs Overview `progress`.
 */
export function manifestTasksSection(tasks: readonly unknown[]): WorkspaceTasksSection {
  return tasks.length === 0
    ? { state: 'available', data: { groups: [], completed: 0, total: 0, attention: [] } }
    : { state: 'unavailable', reason: 'not_implemented' };
}

/**
 * Project mode's `tasks` contribution from the Engine-verified manifest.
 *
 * TEMPORARY source: on the workflow kernel Tasks live in `.execution/tasks/<id>.yaml` and the
 * manifest `tasks` stays `[]`. When the kernel merges, this contribution and the workspace
 * `preparationState` move to the kernel Task source and the manifest rule is deleted.
 */
export function createManifestWorkspaceTasks(
  engine: SpecFlowEngine,
): (specId: string) => Promise<WorkspaceTasksSection> {
  return async (specId) => {
    try {
      const sources = await readCanonicalSpecSources(engine, (candidate) => candidate === specId);
      const source = sources.find((item) => item.specId === specId);

      return source?.status === 'available'
        ? manifestTasksSection(source.specification.tasks)
        : { state: 'unavailable', reason: 'source_unavailable' };
    } catch (error) {
      // An unreadable manifest degrades this section like every other source failure.
      if (error instanceof SpecificationError) {
        return { state: 'unavailable', reason: 'source_unavailable' };
      }

      throw error;
    }
  };
}
