import { randomUUID } from 'node:crypto';

import { Command, InvalidArgumentError } from 'commander';

import { ReportedFailure } from '../exit-code';
import { engineDocumentsApi, type DocumentsEngineApi, type DocumentWriteRequest } from './api';
import { readContentInput } from './content-input';
import {
  statusLines,
  treeLines,
  validationLines,
  validationOf,
  writeResultJson,
  writeResultLines,
} from './present';
import { reportingRefusals } from './report';

export interface DocumentsCommandContext {
  readonly cwd: string;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  /** Reads all of standard input (`--stdin`). */
  readonly readStdin?: () => Promise<string>;
  /** The Engine capabilities the commands use; the installed Engine unless a test supplies a stub. */
  readonly api?: DocumentsEngineApi;
  /** How long the drain at exit may take (default 10 s, the shutdown deadline of the queue). */
  readonly exitFlushDeadlineMs?: number;
}

/** The shutdown flush deadline of the document queue. */
export const EXIT_FLUSH_DEADLINE_MS = 10_000;

/** The longest `flush` waits when no `--wait-ms` is given. */
const DEFAULT_FLUSH_WAIT_MS = 30_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function parseUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new InvalidArgumentError('Must be a UUID.');
  }

  return value;
}

function parseMs(value: string): number {
  if (!/^[1-9][0-9]{0,8}$/u.test(value)) {
    throw new InvalidArgumentError('Must be a whole number of milliseconds, at least 1.');
  }

  return Number(value);
}

interface CommonOptions {
  readonly projectRoot?: string;
  readonly json?: boolean;
}

interface WriteOptions extends CommonOptions {
  readonly operationId?: string;
  readonly wait?: boolean;
  readonly waitMs?: number;
}

interface TargetOptions {
  readonly document?: string;
  readonly folder?: string;
  readonly expectedRevision: string;
}

interface Session {
  readonly engine: Awaited<ReturnType<DocumentsEngineApi['openEngine']>>;
  /** Set when this command put work into the commit queue. */
  enqueued: boolean;
}

/**
 * `nevo-specflow specs documents ...`: the document layer for external agents and operators. Thin
 * adapters over the Engine, offline (no Runtime), on the Project Home the other `specs` commands use.
 *
 * - A write returns when the Engine acknowledges it (files and registry on disk, the commit queued),
 *   like the HTTP routes. `--wait` (optionally `--wait-ms`) also drains the queue first and reports
 *   the settled commit; a commit that did not settle is exit 1.
 * - A command that queued commits drains the queue once more before it exits, bounded by the 10 s
 *   shutdown deadline, so a one-shot agent does not leave commits behind. Whatever does not finish
 *   stays journaled for the next executor (a note goes to stderr).
 * - Exit codes: 0 success; 1 a refusal of the documents layer (printed with its code, cause and a
 *   hint) or any other operation failure; 2 a usage error.
 * - stdout holds only the result (human lines, or one JSON document with `--json`); stderr holds
 *   diagnostics. With `--json` a refusal also prints `{ "error": { code, message, details?, hint? } }`.
 */
export function createDocumentsCommand(context: DocumentsCommandContext): Command {
  const api = context.api ?? engineDocumentsApi;
  const output = { stdout: context.stdout, stderr: context.stderr };
  const documents = new Command('documents').description(
    'Read and change the documents of a Specification (offline, through the Engine)',
  );

  const common = (command: Command): Command =>
    command
      .option('--project-root <path>', 'Require this verified Project Home root')
      .option('--json', 'Print the result as JSON');
  const writing = (command: Command): Command =>
    common(command)
      .option('--operation-id <uuid>', 'Stable operation UUID; reuse it to retry safely', parseUuid)
      .option('--wait', 'Drain the commit queue and report the settled commit')
      .option('--wait-ms <ms>', 'Longest wait of --wait (default 30000)', parseMs);
  const targeting = (command: Command): Command =>
    command
      .option('--document <id>', 'Target document id')
      .option('--folder <path>', 'Target folder path')
      .requiredOption(
        '--expected-revision <revision>',
        'Revision of the target you read (document revision, or folder revision for a folder)',
      );

  const emit = (options: CommonOptions, json: unknown, lines: readonly string[]): void => {
    if (options.json) {
      context.stdout(JSON.stringify(json));
    } else {
      for (const line of lines) {
        context.stdout(line);
      }
    }
  };

  const usage = (command: Command, message: string): never => command.error(message);

  /** Exactly one of `--document` and `--folder`. */
  const targetOf = (command: Command, options: TargetOptions) => {
    if ((options.document === undefined) === (options.folder === undefined)) {
      return usage(command, 'Give exactly one of --document <id> and --folder <path>.');
    }

    return options.document !== undefined
      ? ({ kind: 'document', documentId: options.document } as const)
      : ({ kind: 'folder', path: options.folder! } as const);
  };

  async function drainAtExit(session: Session): Promise<void> {
    try {
      const outcome = await api.flushAll(
        session.engine,
        context.exitFlushDeadlineMs ?? EXIT_FLUSH_DEADLINE_MS,
      );
      if (outcome.remaining > 0) {
        context.stderr(
          `${outcome.remaining} document commit(s) are still queued; they stay journaled. ` +
            'Run "nevo-specflow specs documents flush" to commit them.',
        );
      }
    } catch (error) {
      context.stderr(
        `Could not drain the commit queue: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** The Engine, the body, and the drain at exit for a command that queued commits. */
  async function run(
    options: CommonOptions,
    body: (session: Session) => Promise<void>,
  ): Promise<void> {
    await reportingRefusals(output, options.json, async () => {
      const session: Session = {
        engine: await api.openEngine(context.cwd, options.projectRoot),
        enqueued: false,
      };
      try {
        await body(session);
      } finally {
        if (session.enqueued) {
          await drainAtExit(session);
        }
      }
    });
  }

  async function write(
    session: Session,
    options: WriteOptions,
    specId: string,
    request: DocumentWriteRequest,
  ): Promise<void> {
    const operationId = options.operationId ?? randomUUID();
    const result = await api.write(session.engine, specId, operationId, request);
    if (result.stage === 'queued') {
      session.enqueued = true;
    }

    let commit = result.commit;
    if (options.wait && commit.state === 'pending') {
      const checkout = await api.checkoutOf(session.engine, specId);
      await api.flushCheckout(session.engine, checkout, options.waitMs);
      commit = (await api.status(session.engine, operationId)).commit;
    }

    emit(options, writeResultJson(result, commit), writeResultLines(result, commit));
    if (options.wait && commit.state !== 'committed' && commit.state !== 'not-applicable') {
      context.stderr(
        `The commit did not settle (${commit.state}). Read it with ` +
          `"nevo-specflow specs documents status ${operationId}".`,
      );

      throw new ReportedFailure('The commit did not settle.', 1);
    }
  }

  common(
    documents
      .command('list')
      .description('Show the documents, folders, completeness and commit state of a Specification')
      .argument('<spec-id>', 'Specification UUID'),
  ).action(async (specId: string, options: CommonOptions) => {
    await run(options, async ({ engine }) => {
      const tree = await api.readTree(engine, specId);
      emit(options, { specId, ...tree }, treeLines(tree));
    });
  });

  common(
    documents
      .command('validate')
      .description('Check the completeness and the issues of the documents of a Specification')
      .argument('<spec-id>', 'Specification UUID'),
  ).action(async (specId: string, options: CommonOptions) => {
    await run(options, async ({ engine }) => {
      const verdict = validationOf(await api.readTree(engine, specId));
      emit(options, { specId, ...verdict }, validationLines(verdict));
      if (!verdict.valid) {
        throw new ReportedFailure('The documents are not valid.', 1);
      }
    });
  });

  writing(
    documents
      .command('add')
      .description('Create a document from text (--content-file or --stdin) or from a template')
      .argument('<spec-id>', 'Specification UUID')
      .option('--path <path>', 'Path in the Specification (required without --template)')
      .option(
        '--type <typeId>',
        'Document type id; omitted: unclassified (a template brings its own)',
      )
      .option('--template <templateId>', 'Template of the archetype of the Specification')
      .option(
        '--catalogue-revision <revision>',
        'Catalogue revision the template was read at (default: the current one)',
      )
      .option('--content-file <path>', 'Read the text from this file')
      .option('--stdin', 'Read the text from standard input'),
  ).action(
    async (
      specId: string,
      options: WriteOptions & {
        path?: string;
        type?: string;
        template?: string;
        catalogueRevision?: string;
        contentFile?: string;
        stdin?: boolean;
      },
      command: Command,
    ) => {
      const sources = [options.template, options.contentFile, options.stdin].filter(
        (value) => value !== undefined && value !== false,
      ).length;
      if (sources !== 1) {
        usage(command, 'Give exactly one of --template, --content-file and --stdin.');
      }

      if (options.template === undefined && options.path === undefined) {
        usage(command, '--path is required without --template.');
      }

      if (options.template === undefined && options.catalogueRevision !== undefined) {
        usage(command, '--catalogue-revision applies to --template only.');
      }

      await run(options, async (session) => {
        if (options.template !== undefined) {
          const tree = await api.readTree(session.engine, specId);
          const catalogueRevision =
            options.catalogueRevision ??
            (await api.catalogueRevisionFor(session.engine, tree.archetype.id));
          await write(session, options, specId, {
            action: 'create',
            documents: [
              {
                templateId: options.template,
                ...(options.path !== undefined ? { path: options.path } : {}),
                ...(options.type !== undefined ? { type: options.type } : {}),
              },
            ],
            folders: [],
            catalogueRevision,
          });

          return;
        }

        const content = await readContentInput(options, context);
        await write(session, options, specId, {
          action: 'create',
          documents: [
            {
              path: options.path!,
              content,
              ...(options.type !== undefined ? { type: options.type } : {}),
            },
          ],
          folders: [],
        });
      });
    },
  );

  writing(
    documents
      .command('folder')
      .description('Create an explicit folder')
      .argument('<spec-id>', 'Specification UUID')
      .argument('<path>', 'Folder path in the Specification'),
  ).action(async (specId: string, path: string, options: WriteOptions) => {
    await run(options, (session) => write(session, options, specId, { action: 'folder', path }));
  });

  writing(
    documents
      .command('save')
      .description('Replace the text of a document')
      .argument('<spec-id>', 'Specification UUID')
      .argument('<document-id>', 'Document id')
      .requiredOption('--expected-revision <revision>', 'Revision of the document you read')
      .option('--content-file <path>', 'Read the text from this file')
      .option('--stdin', 'Read the text from standard input'),
  ).action(
    async (
      specId: string,
      documentId: string,
      options: WriteOptions & { expectedRevision: string; contentFile?: string; stdin?: boolean },
      command: Command,
    ) => {
      if ((options.contentFile === undefined) === (options.stdin !== true)) {
        usage(command, 'Give exactly one of --content-file and --stdin.');
      }

      await run(options, async (session) => {
        const content = await readContentInput(options, context);
        await write(session, options, specId, {
          action: 'save',
          documentId,
          content,
          expectedRevision: options.expectedRevision,
        });
      });
    },
  );

  targeting(
    writing(
      documents
        .command('rename')
        .description('Rename a document or a folder (the last path segment)')
        .argument('<spec-id>', 'Specification UUID')
        .argument('<name>', 'New name'),
    ),
  ).action(
    async (
      specId: string,
      name: string,
      options: WriteOptions & TargetOptions,
      command: Command,
    ) => {
      const target = targetOf(command, options);
      await run(options, (session) =>
        write(session, options, specId, {
          action: 'rename',
          target,
          name,
          expectedRevision: options.expectedRevision,
        }),
      );
    },
  );

  targeting(
    writing(
      documents
        .command('move')
        .description('Move a document or a folder into another folder')
        .argument('<spec-id>', 'Specification UUID')
        .option('--to <folder>', 'Target folder path')
        .option('--to-root', 'Move to the Specification root'),
    ),
  ).action(
    async (
      specId: string,
      options: WriteOptions & TargetOptions & { to?: string; toRoot?: boolean },
      command: Command,
    ) => {
      const target = targetOf(command, options);
      if ((options.to === undefined) === (options.toRoot !== true)) {
        usage(command, 'Give exactly one of --to <folder> and --to-root.');
      }

      await run(options, (session) =>
        write(session, options, specId, {
          action: 'move',
          target,
          targetFolder: options.to ?? '',
          expectedRevision: options.expectedRevision,
        }),
      );
    },
  );

  targeting(
    writing(
      documents
        .command('delete')
        .description('Delete a document or a folder with everything in it')
        .argument('<spec-id>', 'Specification UUID'),
    ),
  ).action(async (specId: string, options: WriteOptions & TargetOptions, command: Command) => {
    const target = targetOf(command, options);
    await run(options, (session) =>
      write(session, options, specId, {
        action: 'delete',
        target,
        expectedRevision: options.expectedRevision,
      }),
    );
  });

  writing(
    documents
      .command('classify')
      .description('Give an unclassified document a type')
      .argument('<spec-id>', 'Specification UUID')
      .argument('<document-id>', 'Document id')
      .requiredOption('--type <typeId>', 'Document type id')
      .requiredOption('--expected-revision <revision>', 'Revision of the document you read'),
  ).action(
    async (
      specId: string,
      documentId: string,
      options: WriteOptions & { type: string; expectedRevision: string },
    ) => {
      await run(options, (session) =>
        write(session, options, specId, {
          action: 'classify',
          documentId,
          type: options.type,
          expectedRevision: options.expectedRevision,
        }),
      );
    },
  );

  common(
    documents
      .command('status')
      .description('Show where an operation is and the state of its commit')
      .argument('<operation-id>', 'Operation UUID'),
  ).action(async (operationId: string, options: CommonOptions) => {
    await run(options, async ({ engine }) => {
      const status = await api.status(engine, operationId);
      emit(options, status, statusLines(status));
    });
  });

  common(
    documents
      .command('flush')
      .description('Commit what is queued now (one Specification, or every checkout with work)')
      .argument('[spec-id]', 'Only the checkout of this Specification')
      .option('--wait-ms <ms>', 'Longest wait (default 30000)', parseMs),
  ).action(async (specId: string | undefined, options: CommonOptions & { waitMs?: number }) => {
    await run(options, async ({ engine }) => {
      let settled: boolean;
      let remaining: unknown;
      if (specId !== undefined) {
        const checkout = await api.checkoutOf(engine, specId);
        const outcome = await api.flushCheckout(engine, checkout, options.waitMs);
        settled = outcome.remaining === undefined && !outcome.timedOut;
        remaining = outcome.remaining ?? null;
      } else {
        const outcome = await api.flushAll(engine, options.waitMs ?? DEFAULT_FLUSH_WAIT_MS);
        settled = outcome.remaining === 0 && !outcome.timedOut;
        remaining = outcome.remaining;
      }

      emit(options, { settled, remaining }, [
        settled ? 'Flushed: settled' : 'Flushed: not settled',
      ]);
      if (!settled) {
        context.stderr(
          'Some commits are not settled. Read them with "nevo-specflow specs documents list <spec-id>" and ' +
            'resolve failed ones with retry, abandon or recover.',
        );

        throw new ReportedFailure('Not settled.', 1);
      }
    });
  });

  for (const action of ['retry', 'abandon'] as const) {
    common(
      documents
        .command(action)
        .description(
          action === 'retry'
            ? 'Queue the commit of an operation whose commit failed again'
            : 'Give up the commit of a failed operation; the files stay on disk, uncommitted',
        )
        .argument('<operation-id>', 'Operation UUID'),
    ).action(async (operationId: string, options: CommonOptions) => {
      await run(options, async (session) => {
        await api[action](session.engine, operationId);
        if (action === 'retry') {
          session.enqueued = true;
        }

        const status = await api.status(session.engine, operationId);
        emit(options, status, statusLines(status));
      });
    });
  }

  common(
    documents
      .command('resolve')
      .description(
        'Drop the uncommitted-changes entries of an operation that you dealt with by hand (HEAD holds ' +
          'the file, or you edited it); content the Engine wrote and nobody touched stays listed',
      )
      .argument('<operation-id>', 'Operation UUID'),
  ).action(async (operationId: string, options: CommonOptions) => {
    await run(options, async ({ engine }) => {
      const result = await api.resolve(engine, operationId);
      emit(options, { operationId, ...result }, [
        ...result.resolved.map((path) => `Resolved: ${path}`),
        ...result.stillUncommitted.map((path) => `Still uncommitted: ${path}`),
      ]);
      if (result.stillUncommitted.length > 0) {
        context.stderr(
          'Some paths still hold the Engine content and are not in Git. Commit them with ' +
            '"nevo-specflow commit".',
        );
        if (result.resolved.length === 0) {
          throw new ReportedFailure('Nothing to resolve.', 1);
        }
      }
    });
  });

  common(
    documents
      .command('recover')
      .description(
        'Operator recovery: resolve one operation (--resume, --adopt or --abandon) or, with ' +
          '--confirmed-stopped alone, take over the whole queue of a stopped process',
      )
      .argument('[operation-id]', 'Operation UUID; omitted: queue-wide takeover')
      .option('--resume', 'Look the commit up and finish or queue it again')
      .option(
        '--adopt',
        'Accept a commit that already holds every path (for example a hand commit)',
      )
      .option('--abandon', 'Keep the files and give up the commit')
      .option(
        '--confirmed-stopped',
        'Assert that no process of this project still runs the document queue',
      ),
  ).action(
    async (
      operationId: string | undefined,
      options: CommonOptions & {
        resume?: boolean;
        adopt?: boolean;
        abandon?: boolean;
        confirmedStopped?: boolean;
      },
      command: Command,
    ) => {
      const modes = (['resume', 'adopt', 'abandon'] as const).filter((mode) => options[mode]);
      if (operationId === undefined) {
        if (modes.length > 0 || options.confirmedStopped !== true) {
          usage(command, 'Without an operation id only "recover --confirmed-stopped" is valid.');
        }
      } else if (modes.length !== 1) {
        usage(command, 'Give exactly one of --resume, --adopt and --abandon.');
      }

      await run(options, async (session) => {
        if (operationId === undefined) {
          const result = await api.takeOver(session.engine);
          emit(options, result, [
            `Control lock: ${result.lock.status}`,
            ...result.writes.map((item) => `Write ${item.operationId}: ${item.outcome}`),
            ...result.manualCommits.map(
              (item) => `Manual commit ${item.operationId}: ${item.outcome}`,
            ),
            ...result.passes.map(
              (item) => `Checkout ${item.workspaceId}: ${item.results.length} pass(es)`,
            ),
          ]);
          if (result.lock.status === 'refused') {
            context.stderr(`Takeover refused: ${result.lock.reason}.`);

            throw new ReportedFailure('Takeover refused.', 1);
          }

          return;
        }

        const mode = modes[0]!;
        await api.recover(session.engine, operationId, mode, options.confirmedStopped === true);
        if (mode === 'resume') {
          session.enqueued = true;
        }

        const status = await api.status(session.engine, operationId);
        emit(options, status, statusLines(status));
      });
    },
  );

  return documents;
}
