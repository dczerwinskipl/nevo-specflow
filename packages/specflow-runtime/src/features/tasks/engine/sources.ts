import {
  inspectExecution,
  readTaskDocuments,
  resolveSpecificationForRead,
  SpecificationError,
  type SpecFlowEngine,
  type WorkflowDependencies,
} from '@nevo/specflow-engine';

import type {
  Availability,
  DefinitionSource,
  ExecutionSource,
  HistorySource,
  TaskIdentity,
} from '../reads/facts';
import { sameTask } from '../reads/facts';
import {
  definitionFactsOf,
  executionFactsOf,
  findInspectedTask,
  historyFactsOf,
  identityOf,
  type InspectionBasis,
} from './projection';

/** The Engine of a project-mode Runtime and its workflow operations. */
export interface TaskEngine {
  readonly engine: SpecFlowEngine;
  /**
   * The workflow operations with the definitions as they are now (`openWorkflow`): called once per
   * request, so a definition edit is seen by the next request.
   */
  readonly openWorkflow: () => Promise<WorkflowDependencies>;
}

/** The Engine could not read the Specification's execution: the read answers 503. */
export class TaskSourceUnavailableError extends Error {
  constructor(cause: unknown) {
    super('The Task source is unavailable.', { cause });
    this.name = 'TaskSourceUnavailableError';
  }
}

/** A workflow refusal; the core and the SpecFlow adapter throw two classes of one name. */
export function workflowErrorCode(error: unknown): string | undefined {
  return error instanceof Error &&
    error.name === 'WorkflowError' &&
    typeof (error as { code?: unknown }).code === 'string'
    ? (error as unknown as { code: string }).code
    : undefined;
}

/**
 * One Engine inspection of a Specification's execution (`inspectExecution`, read under the project
 * control lock, so never half a mutation) with the Specification it belongs to. `null`: the
 * Specification does not exist. Any other failure is an outage.
 */
export async function inspectSpecification(
  source: TaskEngine,
  specId: string,
): Promise<InspectionBasis | null> {
  try {
    const found = await resolveSpecificationForRead(source.engine, specId);
    if (found.status !== 'available') {
      throw new TaskSourceUnavailableError(found.status);
    }

    const workflow = await source.openWorkflow();

    return {
      projectId: source.engine.context.project.projectId,
      workspaceId: found.workspaceId,
      specificationTitle: found.specification.title,
      catalogue: workflow.catalogue,
      inspection: await inspectExecution(workflow, specId),
    };
  } catch (error) {
    if (
      (error instanceof SpecificationError && error.code === 'SPEC_NOT_FOUND') ||
      workflowErrorCode(error) === 'WORKFLOW_SUBJECT_NOT_FOUND'
    ) {
      return null;
    }

    throw error instanceof TaskSourceUnavailableError
      ? error
      : new TaskSourceUnavailableError(error);
  }
}

/** The `task.md` of a Task and its revision, read independently of the inspection (its own version). */
async function mainDocument(
  engine: SpecFlowEngine,
  specId: string,
  taskId: string,
): Promise<Availability<{ id: string; revision: string } | null>> {
  try {
    const listing = await readTaskDocuments(engine, specId, taskId);
    const main = listing.documents.find((document) => document.required);

    return {
      state: 'available',
      data: main?.file ? { id: main.id, revision: main.file.revision } : null,
    };
  } catch {
    return { state: 'unavailable', reason: 'source_unavailable' };
  }
}

/**
 * The project-mode Task read sources (`architecture.runtime.task-read-composition`): definition,
 * execution and history facts, each from one inspection. The execution and history reads name the
 * Task manifest revision and the execution version the detail saw; a newer one is not spliced in
 * (the detail reports the section unavailable, a page answers 409 expired).
 */
export function createEngineTaskSources(source: TaskEngine): {
  definitions: DefinitionSource;
  execution: ExecutionSource;
  history: HistorySource;
} {
  // The Task the detail resolved, still in the same checkout (a moved binding is another Task read).
  const task = async (identity: TaskIdentity) => {
    const basis = await inspectSpecification(source, identity.specId);
    const entry = basis && findInspectedTask(basis.inspection, identity.taskId);

    return basis && entry && sameTask(identity, identityOf(basis, identity.taskId))
      ? { basis, entry }
      : undefined;
  };

  const history = async (identity: TaskIdentity) => {
    const found = await task(identity);

    return found && historyFactsOf(found.basis, found.entry);
  };

  return {
    definitions: {
      async resolve(specId, taskId) {
        const basis = await inspectSpecification(source, specId);
        const entry = basis && findInspectedTask(basis.inspection, taskId);
        if (!basis || !entry) {
          return null;
        }

        return definitionFactsOf(basis, entry, await mainDocument(source.engine, specId, taskId));
      },
    },
    execution: {
      async inspect(identity, definitionVersion) {
        const found = await task(identity);
        if (found?.entry.revision !== definitionVersion) {
          return null;
        }

        return executionFactsOf(found.basis, found.entry) ?? null;
      },
    },
    history: {
      async open(identity) {
        const facts = await history(identity);

        return facts
          ? { identity, handle: facts.version, version: facts.version, coverage: 'complete' }
          : null;
      },
      async read(identity, handle, continuation, limit) {
        const facts = await history(identity);
        const start = continuation === null ? 0 : Number(continuation);
        if (
          facts?.version !== handle ||
          !Number.isSafeInteger(start) ||
          start < 0 ||
          !Number.isSafeInteger(limit) ||
          limit < 1
        ) {
          return null;
        }

        const end = Math.min(start + limit, facts.items.length);

        return {
          identity,
          version: facts.version,
          items: facts.items.slice(start, end),
          next: end < facts.items.length ? String(end) : null,
          coverage: 'complete',
        };
      },
    },
  };
}
