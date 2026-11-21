import type { Command } from 'commander';

import { commitLine } from '../documents/present';
import { ReportedFailure } from '../exit-code';
import {
  AgentBrokerClientError,
  stableRequestId,
  type AgentBrokerTransport,
  type AgentRoute,
  type BrokerOperation,
} from './client';

/**
 * Where a command runs inside an agent Turn (D11 point 2). The single routing seam of the CLI: every
 * command not listed here is a write the broker protocol does not know and is refused, so a new
 * command is closed to an agent until someone decides otherwise here.
 *
 * - `read`: stays local (it opens the Engine for reading only, or no Engine at all).
 * - `brokered`: the write is sent to the Runtime's broker; the Engine is never opened for writing.
 */
export const READS: ReadonlySet<string> = new Set([
  'specs list',
  'specs documents list',
  'specs documents read',
  'specs documents validate',
  'specs documents status',
  'tasks list',
  'tasks inspect',
  'workflow actions',
  'workflow context',
  'project inspect',
  'definitions list',
  'definitions show',
  'definitions validate',
  'commit status',
  'docs list',
  'docs get',
  'docs find',
  'docs context',
  'docs search',
]);

export const BROKERED: ReadonlySet<string> = new Set([
  'specs documents add',
  'specs documents save',
  'specs documents classify',
]);

/**
 * Every other registered command, listed on purpose: a table test requires each registered command
 * to be in exactly one of the three sets, so a new command cannot slip into an agent Turn unseen.
 * Anything not in READS or BROKERED is refused whether or not it is listed here.
 */
export const REFUSED: ReadonlySet<string> = new Set([
  'auth hash-password',
  'definitions install',
  'docs check',
  'docs semantic index',
  'docs semantic status',
  'init',
  'project bootstrap',
  'specs abandon',
  'specs close',
  'specs close-inspect',
  'specs close-reconcile-scratch',
  'specs close-recover',
  'specs create',
  'specs documents abandon',
  'specs documents delete',
  'specs documents flush',
  'specs documents folder',
  'specs documents move',
  'specs documents recover',
  'specs documents rename',
  'specs documents resolve',
  'specs documents retry',
  'specs recover',
  'specs resolve',
  'specs workspace close',
  'specs workspace inspect',
  'specs worktree close',
  'start',
  'tasks create',
  'tasks edit',
  'tasks remove',
  'tasks status',
  'workflow finish',
  'workflow reevaluate-wait',
  'workflow return',
  'workflow start',
]);

export type CommandPlacement = 'read' | 'brokered' | 'refused';

/** The words of a command below the executable: `specs documents add`. */
export function commandPath(command: Command): string {
  const words: string[] = [];
  for (let current: Command | null = command; current?.parent; current = current.parent) {
    words.unshift(current.name());
  }

  return words.join(' ');
}

export function placementOf(path: string): CommandPlacement {
  if (BROKERED.has(path)) {
    return 'brokered';
  }

  return READS.has(path) ? 'read' : 'refused';
}

interface RefusalOutput {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

function report(
  output: RefusalOutput,
  json: boolean | undefined,
  error: { code: string; message: string; details?: unknown; hint?: string },
): never {
  output.stderr(`${error.code}: ${error.message}`);
  if (error.hint !== undefined) {
    output.stderr(`Hint: ${error.hint}`);
  }

  if (json) {
    output.stdout(JSON.stringify({ error }));
  }

  throw new ReportedFailure(error.message, 1);
}

/** The refusal of a write the broker does not know, or of any write when the broker is unusable. */
export function refuse(
  output: RefusalOutput,
  json: boolean | undefined,
  path: string,
  why?: string,
): never {
  return report(output, json, {
    code: 'AGENT_SCOPE_REFUSED',
    message: why ?? `"nevo-specflow ${path}" is not available to an agent in this Turn.`,
    hint: 'This Turn can read, and can create, save and classify documents of its Specification (specs documents add, save, classify). Anything else is for the owner.',
  });
}

/**
 * Runs before every command action. Outside an agent Turn nothing changes. Inside one, a command
 * that is neither a local read nor a brokered write ends here, before it can open the Engine.
 */
export function guardAgentCommand(
  route: AgentRoute,
  command: Command,
  output: RefusalOutput,
): void {
  if (route.kind === 'none') {
    return;
  }

  const path = commandPath(command);
  const placement = placementOf(path);
  const json = command.opts<{ json?: boolean }>().json;
  if (placement === 'read') {
    return;
  }

  if (route.kind === 'broken') {
    refuse(output, json, path, route.message);
  }

  if (placement === 'refused') {
    refuse(output, json, path);
  }
}

/** The result of a brokered document write, in the shape the local write prints. */
function resultOf(
  action: 'create' | 'save' | 'classify',
  value: Extract<Awaited<ReturnType<AgentBrokerTransport['send']>>, { ok: true }>['value'],
  specId: string,
) {
  if (value.operation === 'scope.describe') {
    throw new ReportedFailure('The broker answered another operation.', 1);
  }

  const result = value.result;
  const documents = 'document' in result ? [result.document] : result.documents;

  return {
    operationId: result.operationId,
    specId,
    action,
    documents,
    removedDocumentIds: 'removedDocumentIds' in result ? result.removedDocumentIds : [],
    folders: 'folders' in result ? result.folders : [],
    commit: result.commit,
  };
}

/**
 * Sends one document write to the broker and prints its result like the local write does. A refusal
 * prints its code and reason (what an agent can act on) and exits 1. The request id is the
 * `--operation-id` when given, otherwise derived from the command, so a repeat replays.
 */
export async function runBrokeredDocumentWrite(
  context: RefusalOutput,
  transport: AgentBrokerTransport,
  options: { readonly json?: boolean; readonly operationId?: string },
  action: 'create' | 'save' | 'classify',
  operation: BrokerOperation & { readonly specId: string },
): Promise<void> {
  let response;
  try {
    response = await transport.send(options.operationId ?? stableRequestId(operation), operation);
  } catch (error) {
    if (error instanceof AgentBrokerClientError) {
      return report(context, options.json, {
        code: 'AGENT_BROKER_UNAVAILABLE',
        message: error.message,
        hint: 'Nothing was written. Repeat the same command; the broker replays a request it already answered.',
      });
    }

    throw error;
  }

  if (!response.ok) {
    return report(context, options.json, {
      code: response.error.code,
      message: response.error.message,
      ...(response.error.details !== undefined ? { details: response.error.details } : {}),
    });
  }

  const result = resultOf(action, response.value, operation.specId);
  if (options.json) {
    context.stdout(JSON.stringify(result));

    return;
  }

  context.stdout(`Operation: ${result.operationId}`);
  context.stdout(`Action: ${result.action}`);
  for (const document of result.documents) {
    context.stdout(`Document: ${document.id} ${document.path} revision ${document.revision}`);
  }

  context.stdout(`Commit: ${commitLine(result.commit)}`);
}

/**
 * The background index catch-up `docs search` may start. Inside an agent Turn there is none: the
 * search reads the existing index and never writes a marker or spawns a process.
 */
export function catchUpLaunchFor<T>(route: AgentRoute, launch: T | undefined): T | undefined {
  return route.kind === 'none' ? launch : undefined;
}
