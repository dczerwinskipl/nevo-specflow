import type { TaskContextEntry } from '../../tasks/resource/model';
import type { TaskContextLookup } from '../../tasks/resource/validate';
import type { GateDocuments } from '../gates/read';

/**
 * What the Task operations look up outside the execution store, one question at a time and without
 * network access. Production (`openWorkflow`) reads the Specification's manifest and its checkout;
 * the project documentation index is supplied by the caller that has it (the Runtime). The step
 * gates read the documents of a type the Specification or a Task registers (`GateDocuments`).
 */
export interface TaskReferences extends GateDocuments {
  /**
   * The Specification archetype of the manifest: its execution binding's `taskTypes` is the live
   * Task Type policy while the Specification has no run.
   */
  archetype(specId: string): Promise<string>;
  /** A document id registered in the Specification's manifest. */
  specificationDocument(specId: string, id: string): Promise<boolean>;
  /**
   * A stable id of an active document in the documentation of the Specification's checkout (its
   * workspace or worktree; `docs get <id>` there).
   */
  projectDocument(specId: string, id: string): Promise<boolean>;
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
  /** {@link pendingDocumentChange} of every Task of the Specification at once (one read). */
  pendingDocumentChanges(specId: string): Promise<ReadonlySet<string>>;
}

/** The dependencies of ONE read, with {@link readScopedReferences}. */
export function forOneRead<D extends { readonly references: TaskReferences }>(dependencies: D): D {
  return { ...dependencies, references: readScopedReferences(dependencies.references) };
}

/**
 * The references of ONE read (inside `serialize`): every answer is asked once and remembered, and
 * the pending document changes of a Specification are read once for all its Tasks. Production
 * answers resolve the Specification (its manifest, its checkout) each time, so a read of 200 Tasks
 * would otherwise repeat the same lookups per Task. Only for reads: a command asks again after it
 * writes.
 */
export function readScopedReferences(references: TaskReferences): TaskReferences {
  const answers = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, ask: () => Promise<T>): Promise<T> => {
    let answer = answers.get(key) as Promise<T> | undefined;
    if (!answer) {
      answer = ask();
      answers.set(key, answer);
    }

    return answer;
  };

  const key = (...parts: readonly unknown[]) => JSON.stringify(parts);
  const pending = (specId: string) =>
    once(key('pending', specId), () => references.pendingDocumentChanges(specId));

  return {
    archetype: (specId) => once(key('archetype', specId), () => references.archetype(specId)),
    specificationDocument: (specId, id) =>
      once(key('specification', specId, id), () => references.specificationDocument(specId, id)),
    projectDocument: (specId, id) =>
      once(key('project', specId, id), () => references.projectDocument(specId, id)),
    path: (specId, path) => once(key('path', specId, path), () => references.path(specId, path)),
    pendingDocumentChange: async (specId, taskId) => (await pending(specId)).has(taskId),
    pendingDocumentChanges: pending,
    documentsOfType: (scope, type) =>
      once(key('documents', scope, type), () => references.documentsOfType(scope, type)),
  };
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
      if (await references.projectDocument(specId, entry.id)) {
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
