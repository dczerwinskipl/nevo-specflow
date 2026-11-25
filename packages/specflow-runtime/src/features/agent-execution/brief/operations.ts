import {
  AGENT_COMMAND_USAGE,
  AGENT_COMMANDS,
  AGENT_SCRATCH_DIRECTORY,
  type AgentFormContext,
} from '@nevo/specflow-contracts/runtime';
import type { AgentWriteOperation, AgentWriteScope } from '@nevo/specflow-engine';

/**
 * The operations section of the agent brief (D13). Its forms come from the one command table the CLI
 * routing also reads (`AGENT_COMMANDS`), and a write is listed only when the broker scope admits its
 * operation, so the brief never names a command that is refused. An operation added to the scope
 * (the attempt scope's Task drafts and finish proposal) without a table entry throws here, which
 * the operations test catches.
 */
export interface BriefOperation {
  readonly path: string;
  readonly form: string;
  readonly purpose: string;
  /**
   * The options the form names, each with its meaning as the real program declares it
   * (`AGENT_COMMAND_USAGE`, generated from the CLI), so the agent needs no `--help`.
   */
  readonly options: readonly { readonly flags: string; readonly description: string }[];
}

const executable = 'nevo-specflow';

function operationOf(path: string, context: AgentFormContext): BriefOperation | undefined {
  const entry = AGENT_COMMANDS[path];
  if (!entry?.form) {
    return undefined;
  }

  const form = entry.form(context);
  const named = new Set(form.match(/--[a-z][a-z-]*/g));
  const options = (AGENT_COMMAND_USAGE[path]?.options ?? [])
    .filter((option) => named.has(option.long) && option.description !== '')
    .map((option) => ({ flags: option.flags, description: option.description }));

  return { path, form: `${executable} ${form}`, purpose: entry.purpose ?? '', options };
}

/** The writes the scope admits with their exact CLI forms, in the scope's order. */
export function writeOperations(
  scope: AgentWriteScope,
  context: AgentFormContext,
): readonly BriefOperation[] {
  return scope.operations.map((operation: AgentWriteOperation) => {
    const path = Object.keys(AGENT_COMMANDS).find(
      (key) => AGENT_COMMANDS[key]?.operation === operation,
    );
    const entry = path === undefined ? undefined : operationOf(path, context);
    if (!entry) {
      throw new Error(`The agent command table has no form for the operation ${operation}.`);
    }

    return entry;
  });
}

/** Every read the brief shows: the table's local reads that carry a form. */
export function readOperations(context: AgentFormContext): readonly BriefOperation[] {
  return Object.entries(AGENT_COMMANDS)
    .filter(([, entry]) => entry.placement === 'read')
    .flatMap(([path]) => operationOf(path, context) ?? []);
}

/** The operations section: the writes of the scope, then the reads. */
export function renderOperations(scope: AgentWriteScope, context: AgentFormContext): string {
  const line = (operation: BriefOperation) =>
    [
      `- \`${operation.form}\` - ${operation.purpose}`,
      ...operation.options.map((option) => `  - \`${option.flags}\`: ${option.description}`),
    ].join('\n');

  return [
    '## Operations you may call in this Turn',
    'Run them with the product CLI. Add `--json` for machine output. Other product CLI commands are refused.',
    '',
    ...renderApprovals(),
    '',
    `Writes (${scope.taskId !== undefined ? `Task ${scope.taskId} of ` : ''}Specification ${scope.specId}):`,
    ...writeOperations(scope, context).map(line),
    '',
    'Reads:',
    ...readOperations(context).map(line),
  ].join('\n');
}

/**
 * What runs without the owner (ADR 0026, D20), so the agent reads and writes with the tools that do
 * not ask, and issues product CLI calls in the form the host approves (`judgeAgentCliCommand`).
 */
export function renderApprovals(): string[] {
  return [
    'What runs without asking the owner:',
    `- Read, Grep and Glob, and Write and Edit inside this worktree. Read and search code and documents with them, and write files (document texts, Task lists, feedback) with them under \`${AGENT_SCRATCH_DIRECTORY}/\`, not with \`cat\`, \`grep\`, \`sed\`, here-documents or scripts in the shell.`,
    `- A shell command made only of the calls listed here: one or more \`nevo-specflow\` calls joined by \`&&\`, \`;\` or new lines, optionally after \`cd <absolute path of this worktree or a folder in it>\`. Write ids and values literally, quoted when they contain spaces or symbols. No variables (\`S=...; $S\`), \`$(...)\`, backticks, globs, \`~\` or pipes into other commands such as \`head\`. A relative file path (\`--content-file\`, \`--tasks-file\`, a redirection) needs that leading absolute \`cd\`; files you pass must be inside this worktree, and output may be redirected only into \`${AGENT_SCRATCH_DIRECTORY}/\`.`,
    '- Every other shell command waits until the owner approves it.',
  ];
}
