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
 * Project mode's `tasks` contribution from the manifest `tasks` the Specification source already
 * read (one manifest read per workspace read). Without them (a source that reads no manifest) the
 * section is `source_unavailable`.
 *
 * TEMPORARY source: the Specification manifest no longer lists Tasks (they are its
 * `tasks/index.yaml`), so the Engine source hands over none and project mode reports
 * `source_unavailable`. TODO(T8a): replace this contribution and the workspace `preparationState`
 * with the Engine-backed Task source.
 */
export function manifestWorkspaceTasks(
  _specId: string,
  facts: { readonly manifestTasks?: readonly unknown[] },
): Promise<WorkspaceTasksSection> {
  return Promise.resolve(
    facts.manifestTasks
      ? manifestTasksSection(facts.manifestTasks)
      : { state: 'unavailable', reason: 'source_unavailable' },
  );
}
