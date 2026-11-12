import {
  openWorkflow,
  type SpecFlowEngine,
  type WorkflowDependencies,
} from '@nevo/specflow-engine';

import { engineAt } from './engine-at';
import { ReportedFailure } from './exit-code';

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

  return { engine, workflow: await openWorkflow(engine) };
}

interface CodedError {
  readonly code: string;
  readonly message: string;
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
    return { code: (error as unknown as CodedError).code, message: error.message };
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
  WORKFLOW_EXECUTOR_NOT_ALLOWED:
    'The step is not allowed for the owner, or an agent attempt is still active.',
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
    return await body();
  } catch (error) {
    const refusal = workflowRefusal(error);
    if (refusal === undefined) {
      throw error;
    }

    const hint = HINTS[refusal.code];
    output.stderr(`${refusal.code}: ${refusal.message}`);
    if (hint !== undefined) {
      output.stderr(`Hint: ${hint}`);
    }

    if (json) {
      output.stdout(
        JSON.stringify({
          error: { code: refusal.code, message: refusal.message, ...(hint ? { hint } : {}) },
        }),
      );
    }

    throw new ReportedFailure(refusal.message, 1);
  }
}
