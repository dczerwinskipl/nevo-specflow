import {
  GateUnsatisfiedError,
  TaskContextInvalidError,
  TaskContextUnresolvedError,
  TasksOpenError,
  flushAllDocumentCommits,
  openWorkflow,
  type AwaitedContextEntry,
  type CloseBlocker,
  type GateStatus,
  type InvalidContextEntry,
  type OpenTask,
  type SpecFlowEngine,
  type UnresolvedContextEntry,
  type WorkflowDependencies,
} from '@nevo/specflow-engine';

import { engineAt } from './engine-at';
import { gateLine } from './workflow/present';
import { drainDocumentQueueAtExit } from './documents/drain';
import { reportingRefusals } from './documents/report';
import { ReportedFailure } from './exit-code';
import { projectDocumentLookup } from './project-document-lookup';

export interface ExecutionOutput {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

/** The Engine of the Project Home and its workflow operations (definitions loaded now). */
export interface ExecutionSession {
  readonly engine: SpecFlowEngine;
  readonly workflow: WorkflowDependencies;
}

export async function openExecution(cwd: string, projectRoot?: string): Promise<ExecutionSession> {
  const engine = await engineAt(cwd, projectRoot);

  return {
    engine,
    workflow: await openWorkflow(engine, {
      projectDocument: projectDocumentLookup(),
    }),
  };
}

/**
 * Runs a `tasks`, `workflow` or Abandon command body over a fresh {@link ExecutionSession}, refusals
 * reported as {@link reportingWorkflowRefusals}. A `change` commits what it queued before the command
 * exits: with automatic commits on, the execution store queues each change for the document queue,
 * which in the Runtime its scheduler commits; a one-shot CLI process runs no scheduler, so without
 * this drain the Task and `.execution` files would stay uncommitted (and journaled) after the command.
 * With automatic commits off the queue is empty and the drain does nothing.
 */
export async function runExecution(
  context: ExecutionOutput & { readonly cwd: string },
  options: { readonly projectRoot?: string; readonly json?: boolean },
  kind: 'read' | 'change',
  body: (session: ExecutionSession) => Promise<void>,
): Promise<void> {
  await reportingWorkflowRefusals(context, options.json, async () => {
    const session = await openExecution(context.cwd, options.projectRoot);
    await body(session);
    // Only after the change succeeded: a refused change wrote and queued nothing, and a failed one
    // is reported at once (what it left journaled is the next executor's).
    if (kind === 'change') {
      await drainDocumentQueueAtExit(session.engine, flushAllForExit, context.stderr);
    }
  });
}

const flushAllForExit = (engine: SpecFlowEngine, deadlineMs: number) =>
  flushAllDocumentCommits(engine, { deadlineMs });

interface CodedError {
  readonly code: string;
  readonly message: string;
  /** `WORKFLOW_EXIT_BLOCKED`: what holds the Specification. */
  readonly blockers?: readonly CloseBlocker[];
  /** `WORKFLOW_GATE_UNSATISFIED`: the phase, the step and the unsatisfied gates. */
  readonly gate?: {
    readonly phase: 'entry' | 'exit';
    readonly step: string;
    readonly stepTitle: string;
    readonly gates: readonly GateStatus[];
  };
  /** `WORKFLOW_TASK_CONTEXT_UNRESOLVED`: stale references and, apart, awaited process artifacts. */
  readonly unresolved?: readonly UnresolvedContextEntry[];
  readonly awaited?: readonly AwaitedContextEntry[];
  /** `WORKFLOW_INPUT_INVALID` of a Task create/edit: context entries that can never hold. */
  readonly invalidContext?: readonly InvalidContextEntry[];
  /** `WORKFLOW_TASKS_OPEN`: the open Tasks a completion waits for, with why each is open. */
  readonly openTasks?: readonly OpenTask[];
}

/**
 * A workflow refusal. The core and the SpecFlow adapter throw two classes of one name, so it is
 * recognised by its name and a string `code`.
 */
function workflowRefusal(error: unknown): CodedError | undefined {
  if (
    error instanceof Error &&
    error.name === 'WorkflowError' &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    const { code, blockers } = error as unknown as CodedError;

    return {
      code,
      message: error.message,
      ...(Array.isArray(blockers) ? { blockers } : {}),
      ...(error instanceof GateUnsatisfiedError
        ? {
            gate: {
              phase: error.phase,
              step: error.step,
              stepTitle: error.stepTitle,
              gates: error.gates,
            },
          }
        : {}),
      ...(error instanceof TaskContextUnresolvedError
        ? { unresolved: error.unresolved, awaited: error.awaited }
        : {}),
      ...(error instanceof TaskContextInvalidError ? { invalidContext: error.invalidContext } : {}),
      ...(error instanceof TasksOpenError ? { openTasks: error.openTasks } : {}),
    };
  }

  return undefined;
}

const HINTS: Readonly<Record<string, string>> = {
  WORKFLOW_TASK_REVISION_CONFLICT:
    'The Task changed. Read it again with "nevo-specflow tasks inspect" and repeat with its current revision.',
  WORKFLOW_DEFINITION_CHANGED:
    'The workflow definition changed. Read the actions again with "nevo-specflow workflow actions" and repeat.',
  WORKFLOW_ATTEMPT_MISMATCH:
    'The attempt is not the one you finished. Read the actions again with "nevo-specflow workflow actions".',
  WORKFLOW_TASK_BUSY:
    'A change of the Task documents is pending. Flush it with "nevo-specflow specs documents flush" and repeat.',
  WORKFLOW_EXIT_BLOCKED:
    'Pending writes or broken Tasks hold the Specification. Read what holds it with "nevo-specflow workflow actions <spec-id>", resolve it and repeat.',
  WORKFLOW_SPECIFICATION_ENDED:
    'The Specification workflow has ended already (a completed one is not abandoned; an abandon is final).',
  WORKFLOW_EXECUTOR_NOT_ALLOWED:
    'The step is not allowed for the owner, or an agent attempt is still active.',
  WORKFLOW_GATE_UNSATISFIED:
    'Create or complete the documents the gates name (see "nevo-specflow workflow actions"), then repeat.',
  WORKFLOW_TASKS_OPEN:
    'Finish or cancel the open Tasks (see "nevo-specflow tasks list"), or abandon the Specification, then repeat.',
};

/**
 * Runs a command body. A workflow refusal is printed to stderr as `CODE: message` with a hint where
 * one helps and ends the command with exit code 1; with `--json`, stdout also carries
 * `{ "error": { code, message, hint? } }`. Anything else propagates to the executable boundary.
 */
export async function reportingWorkflowRefusals<T>(
  output: ExecutionOutput,
  json: boolean | undefined,
  body: () => Promise<T>,
): Promise<T> {
  try {
    // A refusal of the documents layer (a Task document, a context reference) reports like `specs documents`.
    return await reportingRefusals(output, json, body);
  } catch (error) {
    const refusal = workflowRefusal(error);
    if (refusal === undefined) {
      throw error;
    }

    const hint = HINTS[refusal.code];
    output.stderr(`${refusal.code}: ${refusal.message}`);
    for (const blocker of refusal.blockers ?? []) {
      output.stderr(
        `  held by ${blocker.kind} (${blocker.subjectIds.join(', ')}): ${blocker.message}`,
      );
    }

    for (const gate of refusal.gate?.gates ?? []) {
      output.stderr(`  ${gateLine(gate)}`);
    }

    for (const entry of refusal.unresolved ?? []) {
      output.stderr(`  unresolved context ${String(entry.index)}: ${entry.key} (${entry.reason})`);
    }

    for (const entry of refusal.awaited ?? []) {
      output.stderr(`  awaited artifact ${String(entry.index)}: ${entry.key}`);
    }

    for (const entry of refusal.invalidContext ?? []) {
      output.stderr(`  invalid context ${String(entry.index)}: ${entry.key} (${entry.reason})`);
    }

    for (const task of refusal.openTasks ?? []) {
      output.stderr(`  open task ${task.taskId}: ${task.cause}`);
    }

    // A refused own-document artifact names the gate alternative (the message carries it too).
    const effectiveHint =
      refusal.invalidContext !== undefined
        ? 'Context lists the inputs a Task needs before it starts. For a document the Task produces, use an exit gate on the producing step and an entry gate on the consuming step.'
        : hint;
    if (effectiveHint !== undefined) {
      output.stderr(`Hint: ${effectiveHint}`);
    }

    if (json) {
      output.stdout(
        JSON.stringify({
          error: {
            code: refusal.code,
            message: refusal.message,
            ...(refusal.blockers ? { blockers: refusal.blockers } : {}),
            ...(refusal.gate ? { gate: refusal.gate } : {}),
            ...(refusal.unresolved ? { unresolved: refusal.unresolved } : {}),
            ...(refusal.awaited && refusal.awaited.length > 0 ? { awaited: refusal.awaited } : {}),
            ...(refusal.invalidContext ? { invalidContext: refusal.invalidContext } : {}),
            ...(refusal.openTasks ? { openTasks: refusal.openTasks } : {}),
            ...(effectiveHint ? { hint: effectiveHint } : {}),
          },
        }),
      );
    }

    throw new ReportedFailure(refusal.message, 1);
  }
}
