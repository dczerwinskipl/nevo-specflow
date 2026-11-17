import { isDeepStrictEqual } from 'node:util';

import type { SpecFlowEngine } from '../../../application';
import { runGitFreeMutation } from '../../../project/request-verification-memo';
import {
  inspectRegisteredWorkspace,
  readWorkspaceRegistry,
} from '../../../project/workspace/registry/registry';
import {
  assertArchivedFiles,
  completeArchiveMove,
  inspectArchiveMove,
  moveToArchive,
  planArchiveMove,
  type ArchiveMoveState,
} from '../archive-effects';
import { readCloseJournal } from '../journal/store';
import { CloseOperationError, type CloseJournal } from '../model';
import { publishCloseCheckpoint } from './checkpoint';

function recovery(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_RECOVERY_REQUIRED', message);
}

function invalid(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_PREFLIGHT', message);
}

async function publish(
  engine: SpecFlowEngine,
  old: CloseJournal,
  next: CloseJournal,
): Promise<CloseJournal> {
  return publishCloseCheckpoint(engine, old, next, {
    onConflict: 'Concurrent Close archive journal modification.',
    onConflictCode: 'CLOSE_RECOVERY_REQUIRED',
    onReadbackFailure: 'Archive journal checkpoint was not durable.',
    verifyCurrent: async () => {
      const registry = await readWorkspaceRegistry(engine.context);
      if (registry.revision !== old.plan.registryRevision) {
        throw recovery('Registry revision changed during archival.');
      }
    },
  });
}

/**
 * The archive of a reserved Close with Git off: the pinned move of `specs/active/<slug>` to
 * `specs/archive/<slug>` with the archived manifest, in the Specification's own checkout. No Git
 * process, no commit, no binding change: the archived Specification stays where it was.
 */
async function archiveWithoutGit(
  engine: SpecFlowEngine,
  record: CloseJournal,
  afterArchiveMove?: () => Promise<void>,
): Promise<CloseJournal> {
  const source = record.plan.source;
  const registry = await engine.readRegistry();
  if (registry.revision !== record.plan.registryRevision) {
    throw invalid('Registry changed after reservation.');
  }

  const actual = await inspectRegisteredWorkspace(engine.context, registry, source.workspaceId);
  if (
    actual.status !== 'available' ||
    actual.root !== source.root ||
    actual.workspace.instanceId !== source.instanceId
  ) {
    throw invalid('Canonical source checkout unavailable.');
  }

  const { move, archivedManifest } = await planArchiveMove(source.root, record.plan);
  const initiated = await publish(engine, record, {
    ...record,
    stage: 'archive-initiated',
    archiveMove: move,
  });
  // An interrupted move stays `archive-initiated` (recovery-required); it is never re-run.
  await moveToArchive(source.root, move, archivedManifest, afterArchiveMove);

  return publish(engine, initiated, {
    ...initiated,
    stage: 'completed',
    outcome: 'archived-without-git',
  });
}

/**
 * The rest of a Specification Close with Git off (owner decision 2026-11-17), from its reserved
 * journal (the reservation decided the mode and kept the Git-free verification): the archive in
 * place and its proof, with the Git-free verification of an existing-workspace Create. An
 * interrupted move stays `archive-initiated` and is never re-run here: see
 * {@link resumeCloseWithoutGit}.
 */
export async function finishCloseWithoutGit(
  engine: SpecFlowEngine,
  reserved: CloseJournal,
  hooks: { readonly afterArchiveMove?: () => Promise<void> } = {},
): Promise<CloseJournal> {
  return runGitFreeMutation(async () => {
    let journal = reserved;
    if (journal.stage === 'reserved') {
      journal = await archiveWithoutGit(engine, journal, hooks.afterArchiveMove);
    }

    if (journal.stage !== 'completed' || !journal.archiveMove) {
      throw recovery(
        'The archive move without Git did not finish: inspect it with "specs close-recover --preview" before recovery.',
      );
    }

    return verifiedCompletion(engine, journal);
  });
}

async function verifiedCompletion(
  engine: SpecFlowEngine,
  journal: CloseJournal,
): Promise<CloseJournal> {
  const final = await readCloseJournal(engine.context, journal.plan.operationId);
  if (!final || !isDeepStrictEqual(final, journal) || !final.archiveMove) {
    throw recovery('Completion journal changed during final verification.');
  }

  await assertArchivedFiles(final.plan.source.root, final.archiveMove);

  return final;
}

/** What an interrupted Close with Git off left: its stage and, while not completed, the move state. */
export type CloseWithoutGitRecovery =
  | { readonly stage: 'completed' }
  | { readonly stage: 'archive-initiated'; readonly move: ArchiveMoveState };

async function gitOffJournal(engine: SpecFlowEngine, operationId: string): Promise<CloseJournal> {
  const journal = await readCloseJournal(engine.context, operationId);
  if (!journal?.plan.gitOff) {
    throw new CloseOperationError('CLOSE_INVALID', 'No Close with Git off has this operation id.');
  }

  return journal;
}

/**
 * Read-only: where an interrupted Close with Git off stopped, proved against the pinned inventory.
 * A `reserved` journal has done nothing yet: the same Close is simply retried.
 */
export async function inspectCloseWithoutGit(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<CloseWithoutGitRecovery | { readonly stage: 'reserved' }> {
  return runGitFreeMutation(async () => {
    const journal = await gitOffJournal(engine, operationId);
    if (journal.stage === 'reserved' || journal.stage === 'completed') {
      return { stage: journal.stage };
    }

    if (journal.stage !== 'archive-initiated' || !journal.archiveMove) {
      throw recovery('Unexpected stage of a Close with Git off.');
    }

    return {
      stage: 'archive-initiated',
      move: await inspectArchiveMove(journal.plan.source.root, journal.archiveMove),
    };
  });
}

/**
 * The operator's recovery of a Close with Git off stuck at `archive-initiated` (it holds its
 * Specification and checkout claims until it ends): after the operator confirms that the original
 * Close stopped and nothing else writes the checkout, the move proved by {@link inspectArchiveMove}
 * is finished deterministically and the Close completes as `archived-without-git`, which releases
 * the claims. A state that cannot be proved stays `CLOSE_RECOVERY_REQUIRED` and changes nothing.
 */
export async function resumeCloseWithoutGit(
  engine: SpecFlowEngine,
  operationId: string,
  confirmedStopped: true,
): Promise<CloseJournal> {
  if (confirmedStopped !== true) {
    throw new CloseOperationError('CLOSE_INVALID', 'Confirm that the original Close stopped.');
  }

  return runGitFreeMutation(async () => {
    const journal = await gitOffJournal(engine, operationId);
    if (journal.stage === 'completed') {
      return verifiedCompletion(engine, journal);
    }

    if (journal.stage !== 'archive-initiated' || !journal.archiveMove) {
      throw new CloseOperationError(
        'CLOSE_INVALID',
        'Only a Close stuck after its archive intent is recovered; retry a reserved one.',
      );
    }

    await completeArchiveMove(journal.plan.source.root, journal.archiveMove, journal.plan);

    return verifiedCompletion(
      engine,
      await publish(engine, journal, {
        ...journal,
        stage: 'completed',
        outcome: 'archived-without-git',
      }),
    );
  });
}
