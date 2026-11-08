import {
  readCanonicalSpecSources,
  readRegistrySnapshot,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';
import type { DefinitionSource } from '../tasks';

/** One Engine object an association references, read at request time (time-of-check only). */
export type TargetFact<T> =
  | { readonly state: 'available'; readonly value: T }
  | { readonly state: 'missing' }
  | { readonly state: 'unavailable' };
export interface AssociatedSpecification {
  readonly specId: string;
  readonly key?: string;
  readonly title: string;
  readonly collection: 'current' | 'archived';
}
export interface AssociatedTask {
  readonly taskId: string;
  readonly key?: string;
  readonly title: string;
}

/**
 * The Engine-owned facts the association module verifies (create) and reads (association read,
 * references). The registry stores only identifiers; titles and bindings are always read here.
 */
export interface AssociationTargets {
  specification(specId: string): Promise<TargetFact<AssociatedSpecification>>;
  /** One fact per requested Task, in request order; a Task of another Specification is missing. */
  tasks(specId: string, taskIds: readonly string[]): Promise<TargetFact<AssociatedTask>[]>;
  /** The current workspace binding of each Specification, in one Engine read. */
  workspaces(specIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

const unavailable = { state: 'unavailable' } as const;
const missing = { state: 'missing' } as const;

/** Task facts from the Tasks feature's definition source; without one, Tasks are unreadable. */
export async function readTaskTargets(
  definitions: DefinitionSource | undefined,
  specId: string,
  taskIds: readonly string[],
): Promise<TargetFact<AssociatedTask>[]> {
  if (!definitions) {
    return taskIds.map(() => unavailable);
  }

  return Promise.all(
    taskIds.map(async (taskId): Promise<TargetFact<AssociatedTask>> => {
      try {
        const definition = await definitions.resolve(specId, taskId);
        if (!definition) {
          return missing;
        }

        // A definition that names another object is not this Task.
        if (definition.identity.specId !== specId || definition.task.id !== taskId) {
          return unavailable;
        }

        return { state: 'available', value: { taskId, title: definition.task.title } };
      } catch {
        return unavailable;
      }
    }),
  );
}

/** Project mode: the Engine's canonical Specification sources and its workspace registry. */
export function createEngineAssociationTargets(
  engine: SpecFlowEngine | undefined,
  definitions?: DefinitionSource,
): AssociationTargets {
  return {
    async specification(specId) {
      if (!engine) {
        return unavailable;
      }

      try {
        const sources = await readCanonicalSpecSources(engine, (candidate) => candidate === specId);
        const source = sources.find((item) => item.specId === specId);
        if (!source) {
          return missing;
        }

        if (source.status !== 'available') {
          return unavailable;
        }

        return {
          state: 'available',
          value: {
            specId: source.specId,
            ...(source.specification.key ? { key: source.specification.key } : {}),
            title: source.specification.title,
            collection: source.specification.location === 'archive' ? 'archived' : 'current',
          },
        };
      } catch {
        return unavailable;
      }
    },
    tasks: (specId, taskIds) => readTaskTargets(definitions, specId, taskIds),
    async workspaces(specIds) {
      const bound = new Map<string, string>();
      if (!engine || !specIds.length) {
        return bound;
      }

      // The read-path snapshot: no Git process per reference batch.
      const registry = await readRegistrySnapshot(engine);
      const explicit = new Map(
        registry.specBindings.map((binding) => [binding.specId, binding.workspaceId]),
      );
      for (const specId of specIds) {
        // An explicit binding wins; every other Specification lives in the primary checkout.
        bound.set(specId, explicit.get(specId) ?? registry.primaryWorkspaceId);
      }

      return bound;
    },
  };
}
