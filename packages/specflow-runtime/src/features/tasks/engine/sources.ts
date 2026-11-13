import {
  ProjectControlLockError,
  readExecutionForRead,
  readTaskDocuments,
  resolveSpecificationForRead,
  SpecificationError,
  type ReadExecutionOptions,
  type SpecFlowEngine,
  type WorkflowDependencies,
} from '@nevo/specflow-engine';

import type {
  Availability,
  DefinitionSource,
  ExecutionSource,
  HistorySource,
  TaskIdentity,
  TaskReading,
  TaskReadingSource,
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

/**
 * The Engine could not read the Specification's execution: the read answers 503. `retryable` when
 * the project control lock was busy (another writer), so a retry soon can succeed.
 */
export class TaskSourceUnavailableError extends Error {
  readonly retryable: boolean;

  constructor(cause: unknown) {
    super('The Task source is unavailable.', { cause });
    this.name = 'TaskSourceUnavailableError';
    this.retryable = cause instanceof ProjectControlLockError && cause.code === 'CONTROL_LOCK_BUSY';
  }
}

/** A workflow refusal; the core and the SpecFlow adapter throw two classes of one name. */
function workflowErrorCode(error: unknown): string | undefined {
  return error instanceof Error &&
    error.name === 'WorkflowError' &&
    typeof (error as { code?: unknown }).code === 'string'
    ? (error as unknown as { code: string }).code
    : undefined;
}

/**
 * ONE Engine read of a Specification's execution (`readExecution`: the inspection, the action
 * projections of the requested Tasks and their lanes, from one snapshot read under the project
 * control lock) with the Specification it belongs to. `null`: the Specification does not exist. Any
 * other failure is an outage.
 */
export async function inspectSpecification(
  source: TaskEngine,
  specId: string,
  tasks: ReadExecutionOptions['tasks'],
): Promise<InspectionBasis | null> {
  try {
    const found = await resolveSpecificationForRead(source.engine, specId);
    if (found.status !== 'available') {
      throw new TaskSourceUnavailableError(found.status);
    }

    const workflow = await source.openWorkflow();
    const reading = await readExecutionForRead(workflow, specId, { tasks });

    return {
      projectId: source.engine.context.project.projectId,
      workspaceId: found.workspaceId,
      specificationTitle: found.specification.title,
      catalogue: workflow.catalogue,
      inspection: reading.inspection,
      reading,
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

/**
 * The `task.md` of a Task and its revision. It is the Documents owner's body version (a separate
 * version by design, `architecture.runtime.task-read-composition`), not part of the execution read.
 */
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
 * The project-mode Task read sources (`architecture.runtime.task-read-composition`). A detail or a
 * page is ONE `reading`: definition, execution and history all from one Engine read, so no section
 * mixes two moments. A history page names the execution version its detail saw; a newer one is not
 * spliced in (409 expired). The separate ports read the same way, for consumers that need only one
 * of them (Session association titles).
 */
export function createEngineTaskSources(source: TaskEngine): {
  reading: TaskReadingSource;
  definitions: DefinitionSource;
  execution: ExecutionSource;
  history: HistorySource;
} {
  const reading: TaskReadingSource = {
    async read(specId, taskId): Promise<TaskReading | null> {
      const basis = await inspectSpecification(source, specId, [taskId]);
      const entry = basis && findInspectedTask(basis.inspection, taskId);
      if (!basis || !entry) {
        return null;
      }

      const history = historyFactsOf(basis, entry);

      return {
        definition: definitionFactsOf(
          basis,
          entry,
          await mainDocument(source.engine, specId, taskId),
        ),
        execution: executionFactsOf(basis, entry) ?? null,
        history: history
          ? {
              read: {
                identity: identityOf(basis, taskId),
                handle: history.version,
                version: history.version,
                coverage: 'complete',
              },
              items: history.items,
            }
          : null,
      };
    },
  };
  const same = async (identity: TaskIdentity) => {
    const read = await reading.read(identity.specId, identity.taskId);

    return read && sameTask(identity, read.definition.identity) ? read : undefined;
  };

  return {
    reading,
    definitions: {
      async resolve(specId, taskId) {
        return (await reading.read(specId, taskId))?.definition ?? null;
      },
    },
    execution: {
      async inspect(identity, definitionVersion) {
        const read = await same(identity);

        return read?.definition.version === definitionVersion ? read.execution : null;
      },
    },
    history: {
      async open(identity) {
        return (await same(identity))?.history?.read ?? null;
      },
      async read(identity, handle, continuation, limit) {
        const history = (await same(identity))?.history;
        const start = continuation === null ? 0 : Number(continuation);
        if (
          history?.read.version !== handle ||
          !Number.isSafeInteger(start) ||
          start < 0 ||
          !Number.isSafeInteger(limit) ||
          limit < 1
        ) {
          return null;
        }

        const end = Math.min(start + limit, history.items.length);

        return {
          identity,
          version: history.read.version,
          items: history.items.slice(start, end),
          next: end < history.items.length ? String(end) : null,
          coverage: 'complete',
        };
      },
    },
  };
}
