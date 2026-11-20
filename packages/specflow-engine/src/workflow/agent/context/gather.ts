import { WorkflowError } from '../../errors';
import { AGENT_CONTEXT_ENTRIES_MAX, AGENT_CONTEXT_HASHED_BYTES_MAX } from '../../limits';
import type { ExecutionTask, WorkflowSubject } from '../../state/model';
import type { GateScopeRef } from '../../gates/evaluate';
import { effectiveContextOf } from '../../operations/task-policy';
import type { WorkflowDependencies } from '../../operations/loaded-execution';
import type { TaskContextEntry } from '../../../tasks/resource/model';
import { compileAgentContext } from './compile';
import type {
  AgentStepContext,
  ContextArchetype,
  ContextDocument,
  ContextDocumentType,
  ContextEntryFact,
  ContextFileFact,
  HashBudget,
} from '../../operations/agent-step-context';

/**
 * What the agent context reads outside the execution store. Production reads the Specification's
 * documents, the project catalogue and the checkout (`engine-source.ts`); tests answer from memory.
 * Paths are relative to the workspace the Turn runs in. Nothing here writes.
 */
export interface AgentContextSource {
  /** The registered documents of the Specification and, for a Task, of the Task (registry order). */
  documents(subject: WorkflowSubject): Promise<readonly ContextDocument[]>;
  /** The document types the agent may register, in id order, and the Specification's archetype. */
  catalogue(specId: string): Promise<{
    readonly documentTypes: readonly ContextDocumentType[];
    readonly archetype?: ContextArchetype;
  }>;
  /** The file of a registered document; absent when the registered document has no file. */
  documentFile(
    scope: GateScopeRef,
    documentId: string,
    budget: HashBudget,
  ): Promise<ContextFileFact | undefined>;
  /**
   * What a `path` reference names in the checkout: a file (`path`, digest), or a folder or glob (the
   * digest of its sorted file list); absent when it does not resolve. Hashing spends `budget`.
   */
  checkoutFile(
    specId: string,
    path: string,
    budget: HashBudget,
  ): Promise<ContextFileFact | undefined>;
}

/**
 * The agent data of a subject's step context: read the facts (inside the caller's `serialize`),
 * then compile them. For a Task the effective context list (explicit or default) is resolved entry by
 * entry, in its declared order.
 */
export async function gatherAgentContext(
  dependencies: Pick<WorkflowDependencies, 'references'>,
  source: AgentContextSource,
  subject: WorkflowSubject,
  task: ExecutionTask | undefined,
): Promise<AgentStepContext> {
  const [documents, catalogue] = await Promise.all([
    source.documents(subject),
    source.catalogue(subject.specId),
  ]);
  const list = task ? (await effectiveContextOf(dependencies, task.specId, task)).entries : [];
  if (list.length > AGENT_CONTEXT_ENTRIES_MAX) {
    throw new WorkflowError(
      'WORKFLOW_INPUT_INVALID',
      `The agent context is over its budget: ${String(list.length)} context entries (at most ${String(AGENT_CONTEXT_ENTRIES_MAX)} entries).`,
    );
  }

  const entries = task
    ? await resolveEntries(dependencies, source, task, list, {
        remaining: AGENT_CONTEXT_HASHED_BYTES_MAX,
      })
    : undefined;

  return compileAgentContext({
    documents,
    ...catalogue,
    ...(task && entries ? { taskId: task.taskId, entries } : {}),
  });
}

async function resolveEntries(
  dependencies: Pick<WorkflowDependencies, 'references'>,
  source: AgentContextSource,
  task: ExecutionTask,
  entries: readonly TaskContextEntry[],
  budget: HashBudget,
): Promise<ContextEntryFact[]> {
  const { references } = dependencies;
  const { specId, taskId } = task;
  const facts: ContextEntryFact[] = [];
  for (const entry of entries) {
    switch (entry.kind) {
      case 'instructions':
        facts.push({ entry, found: {} });
        break;
      case 'task-document': {
        const registered = task.documents.some((document) => document.id === entry.id);
        const file = registered
          ? await source.documentFile({ kind: 'task', specId, taskId }, entry.id, budget)
          : undefined;
        facts.push(registered ? found(entry, file) : { entry });
        break;
      }

      case 'specification-document': {
        const registered = await references.specificationDocument(specId, entry.id);
        const file = registered
          ? await source.documentFile({ kind: 'specification', specId }, entry.id, budget)
          : undefined;
        facts.push(registered ? found(entry, file) : { entry });
        break;
      }

      case 'project-document':
        facts.push(
          (await references.projectDocument(specId, entry.id))
            ? found(entry, undefined)
            : { entry },
        );
        break;
      case 'path': {
        // A file is pinned by its digest, a folder or a glob by the digest of its file list.
        const file = await source.checkoutFile(specId, entry.path, budget);
        facts.push(
          file || (await references.path(specId, entry.path)) ? found(entry, file) : { entry },
        );
        break;
      }
    }
  }

  return facts;
}

function found(entry: TaskContextEntry, file: ContextFileFact | undefined): ContextEntryFact {
  return { entry, found: file ? { file } : {} };
}
