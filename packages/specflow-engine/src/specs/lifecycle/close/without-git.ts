import { isDeepStrictEqual } from 'node:util';

import type { SpecFlowEngine } from '../../../application';
import { runGitFreeMutation } from '../../../project/request-verification-memo';
import {
  inspectRegisteredWorkspace,
  readWorkspaceRegistry,
} from '../../../project/workspace/registry/registry';
import { assertArchivedFiles, moveToArchive, planArchiveMove } from '../archive-effects';
import { readCloseJournal } from '../journal/store';
import { CloseOperationError, type CloseJournal } from '../model';
import { reserveCloseOperation } from '../reservation';
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
 * A Specification Close with Git off (owner decision 2026-11-17): the workflow gate, the reservation
 * and the archive in place, with the Git-free verification of an existing-workspace Create. The
 * caller decided the mode ({@link closeRepositoryMode}); a reservation the Git policy changed under
 * (a Git plan) is left for a retry of the same operation, which then continues with Git.
 */
export async function closeSpecificationWithoutGit(
  engine: SpecFlowEngine,
  request: {
    readonly operationId: string;
    readonly specId: string;
    readonly integrateToTargetBranch?: boolean;
  },
  hooks: { readonly afterArchiveMove?: () => Promise<void> } = {},
): Promise<CloseJournal> {
  return runGitFreeMutation(async () => {
    let journal = (await reserveCloseOperation(engine, { kind: 'specification-close', ...request }))
      .journal;
    if (!journal.plan.gitOff) {
      throw new CloseOperationError(
        'CLOSE_CONFLICT',
        'The project Git policy changed during the Close admission: retry the same operation.',
      );
    }

    if (journal.stage === 'reserved') {
      journal = await archiveWithoutGit(engine, journal, hooks.afterArchiveMove);
    }

    if (journal.stage !== 'completed' || !journal.archiveMove) {
      throw recovery(
        'The archive move without Git did not finish: inspect specs/active and specs/archive of the checkout before recovery.',
      );
    }

    const final = await readCloseJournal(engine.context, request.operationId);
    if (!final || !isDeepStrictEqual(final, journal)) {
      throw recovery('Completion journal changed during final verification.');
    }

    await assertArchivedFiles(journal.plan.source.root, journal.archiveMove);

    return final;
  });
}
