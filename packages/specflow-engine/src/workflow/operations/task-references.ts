import type { TaskContextEntry } from '../../tasks/resource/model';
import type { TaskContextLookup } from '../../tasks/resource/validate';

/**
 * What the Task operations look up outside the execution store, one question at a time and without
 * network access. Production (`openWorkflow`) reads the Specification's manifest and its checkout;
 * the project documentation index is supplied by the caller that has it (the Runtime).
 */
export interface TaskReferences {
  /**
   * The Specification archetype of the manifest: its execution binding's `taskTypes` is the live
   * Task Type policy while the Specification has no run.
   */
  archetype(specId: string): Promise<string>;
  /** A document id registered in the Specification's manifest. */
  specificationDocument(specId: string, id: string): Promise<boolean>;
  /** A stable id of the project documentation index (`pnpm docs:get <id>`). */
  projectDocument(id: string): Promise<boolean>;
  /**
   * A repository-relative file or folder exists in the Specification's checkout, or a glob matches at
   * least one file there.
   */
  path(specId: string, path: string): Promise<boolean>;
  /**
   * Seam of the Task-scoped Documents (T5): a change of one of the Task's documents is pending, so
   * the Task cannot be removed.
   */
  pendingDocumentChange(specId: string, taskId: string): Promise<boolean>;
}

/**
 * The synchronous lookup `validateTaskContext` takes, answered beforehand for exactly the given
 * entries (every other reference reads as missing).
 */
export async function contextLookupFor(
  references: TaskReferences,
  specId: string,
  entries: readonly TaskContextEntry[],
): Promise<TaskContextLookup> {
  const specification = new Set<string>();
  const project = new Set<string>();
  const paths = new Set<string>();
  for (const entry of entries) {
    if (entry.kind === 'specification-document') {
      if (await references.specificationDocument(specId, entry.id)) {
        specification.add(entry.id);
      }
    } else if (entry.kind === 'project-document') {
      if (await references.projectDocument(entry.id)) {
        project.add(entry.id);
      }
    } else if (entry.kind === 'path' && (await references.path(specId, entry.path))) {
      paths.add(entry.path);
    }
  }

  return {
    specificationDocument: (id) => specification.has(id),
    projectDocument: (id) => project.has(id),
    path: (path) => paths.has(path),
  };
}
