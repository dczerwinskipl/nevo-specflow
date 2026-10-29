import { randomUUID } from 'node:crypto';

import type { ManualCommitCommand, ManualCommitScope } from '@nevo/specflow-engine';
import { Command, InvalidArgumentError, Option } from 'commander';

import { reportingRefusals } from '../documents/report';
import { engineCommitApi, type CommitEngineApi } from './api';
import { commitResultJson, commitResultLines, uncommittedLines } from './present';

export interface CommitCommandContext {
  readonly cwd: string;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  /** The Engine capabilities the commands use; the installed Engine unless a test supplies a stub. */
  readonly api?: CommitEngineApi;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function parseUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new InvalidArgumentError('Must be a UUID.');
  }

  return value;
}

/** A repeatable option: every occurrence is one more value. */
function collect(value: string, previous: readonly string[]): string[] {
  return [...previous, value];
}

const SCOPES: readonly ManualCommitScope[] = ['specification', 'definitions', 'all'];

interface ScopeOptions {
  readonly projectRoot?: string;
  readonly json?: boolean;
  readonly scope?: ManualCommitScope;
  readonly spec?: string;
}

interface CommitOptions extends ScopeOptions {
  readonly message: readonly string[];
  readonly path: readonly string[];
  readonly ledgerRevision?: string;
  readonly operationId?: string;
}

/**
 * `nevo-specflow commit` and `nevo-specflow commit status` (ADR 0018 decision 8): commit exactly what the
 * Engine left uncommitted in a scope, with the person's message, or read that list. Thin adapters over
 * the Engine, offline (no Runtime). They never run Git themselves and never commit anything the Engine did
 * not write.
 *
 * - `--scope specification` (the default with `--spec`), `definitions` (the Project Home's definitions,
 *   which only the command line may commit) or `all` (every owner in the checkout of `--spec`, or of the
 *   project without it).
 * - `-m` is the message and is repeatable (each is a paragraph, like Git); without one the Engine writes
 *   `spec(docs): manual commit <slug>` or `definitions: manual commit`.
 * - `--path` (repeatable) commits a subset of the listed paths, closed under shared operations.
 * - Exit codes: 0 committed, or nothing to commit; 1 a refusal (printed with its code, cause and a hint) or
 *   any other failure; 2 a usage error. stdout holds only the result (lines, or one JSON document with
 *   `--json`); stderr the diagnostics. With `--json` a refusal also prints `{ "error": { code, message,
 *   details?, hint? } }`.
 */
export function createCommitCommand(context: CommitCommandContext): Command {
  const api = context.api ?? engineCommitApi;
  const output = { stdout: context.stdout, stderr: context.stderr };

  const scoping = (command: Command): Command =>
    command
      .option('--project-root <path>', 'Require this verified Project Home root')
      .option('--json', 'Print the result as JSON')
      .addOption(
        new Option('--scope <scope>', 'What to cover (default: specification with --spec)').choices(
          SCOPES,
        ),
      )
      .option('--spec <slug|id>', 'The Specification (its slug or UUID)');

  /** The scope the options name, or a usage error (decided before any Engine is opened). */
  const scopeOf = (command: Command, options: ScopeOptions): ManualCommitScope => {
    const scope = options.scope ?? (options.spec !== undefined ? 'specification' : undefined);
    if (scope === undefined) {
      return command.error('Give --spec <slug|id>, or --scope definitions or --scope all.');
    }

    if (scope === 'specification' && options.spec === undefined) {
      return command.error('--scope specification needs --spec <slug|id>.');
    }

    if (scope === 'definitions' && options.spec !== undefined) {
      return command.error('--spec does not apply to --scope definitions.');
    }

    return scope;
  };

  /** The Specification of the options, found through the opened Engine (by slug or UUID). */
  const targetOf = async (
    scope: ManualCommitScope,
    options: ScopeOptions,
    engine: Awaited<ReturnType<CommitEngineApi['openEngine']>>,
  ): Promise<Pick<ManualCommitCommand, 'scope' | 'specId'>> =>
    options.spec === undefined
      ? { scope }
      : { scope, specId: (await api.resolveSpecification(engine, options.spec)).specId };

  const commit = scoping(
    new Command('commit').description(
      'Commit what the Engine left uncommitted in a scope, with your message (never anything else)',
    ),
  )
    .option(
      '-m, --message <text>',
      'Commit message; repeat for more paragraphs (default: the Engine writes one)',
      collect,
      [],
    )
    .option(
      '--path <path>',
      'Commit only this uncommitted path; repeat for more (closed under shared operations)',
      collect,
      [],
    )
    .option('--ledger-revision <revision>', 'Refuse unless the list is still this revision')
    .option('--operation-id <uuid>', 'Stable operation UUID; reuse it to retry safely', parseUuid)
    .action(async (options: CommitOptions, command: Command) => {
      const scope = scopeOf(command, options);
      await reportingRefusals(output, options.json, async () => {
        const engine = await api.openEngine(context.cwd, options.projectRoot);
        const target = await targetOf(scope, options, engine);
        const result = await api.commit(engine, {
          operationId: options.operationId ?? randomUUID(),
          ...target,
          ...(options.message.length > 0 ? { message: options.message.join('\n\n') } : {}),
          ...(options.path.length > 0 ? { paths: options.path } : {}),
          ...(options.ledgerRevision !== undefined
            ? { ledgerRevision: options.ledgerRevision }
            : {}),
        });
        if (options.json) {
          context.stdout(JSON.stringify(commitResultJson(result, target.scope, target.specId)));
        } else {
          for (const line of commitResultLines(result)) {
            context.stdout(line);
          }
        }
      });
    });

  scoping(
    commit
      .enablePositionalOptions()
      .command('status')
      .description('List the uncommitted changes of a scope, the commit policy and the queue'),
  ).action(async (options: ScopeOptions, command: Command) => {
    const scope = scopeOf(command, options);
    await reportingRefusals(output, options.json, async () => {
      const engine = await api.openEngine(context.cwd, options.projectRoot);
      const target = await targetOf(scope, options, engine);
      const view = await api.uncommitted(engine, target);
      if (options.json) {
        context.stdout(JSON.stringify(view));
      } else {
        for (const line of uncommittedLines(view)) {
          context.stdout(line);
        }
      }
    });
  });

  return commit;
}
