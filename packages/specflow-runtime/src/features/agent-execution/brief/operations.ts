import { AGENT_COMMANDS, type AgentFormContext } from '@nevo/specflow-contracts/runtime';
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
}

const executable = 'nevo-specflow';

function operationOf(path: string, context: AgentFormContext): BriefOperation | undefined {
  const entry = AGENT_COMMANDS[path];
  if (!entry?.form) {
    return undefined;
  }

  return { path, form: `${executable} ${entry.form(context)}`, purpose: entry.purpose ?? '' };
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
  const line = (operation: BriefOperation) => `- \`${operation.form}\` - ${operation.purpose}`;

  return [
    '## Operations you may call in this Turn',
    'Run them with the product CLI. Add `--json` for machine output. Anything else is refused.',
    '',
    `Writes (${scope.taskId !== undefined ? `Task ${scope.taskId} of ` : ''}Specification ${scope.specId}):`,
    ...writeOperations(scope, context).map(line),
    '',
    'Reads:',
    ...readOperations(context).map(line),
  ].join('\n');
}
