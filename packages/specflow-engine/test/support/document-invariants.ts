import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect } from 'vitest';

import { listDocumentBatches, readBatchPaths } from '../../src/specs/documents/queue/batch-store';
import type { DocumentChangeJournal } from '../../src/specs/documents/changes/journal/model';
import { readJournalPlanPaths } from '../../src/specs/documents/reads/commit-reader';
import {
  findDocumentChangeJournal,
  listDocumentChangeJournals,
  readSettledDocumentChangeJournal,
} from '../../src/specs/documents/write/journal-store';
import { journalDirectory, SETTLED_DIRECTORY_NAME } from '../../src/specs/durable';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../../src/specs/documents/changes/journal/kind';
import { checkoutClaimFree, ledgerPaths } from './document-writes';
import { engineCommits, queueRecords, trailersOf, type QueueProject } from './document-queue';
import { git } from './git-project';

/**
 * What a test knows about a run of document saves: every save that was acknowledged or attempted,
 * with the bytes it wrote. The invariants below are phrased against it, never against the Engine's
 * own records alone.
 */
export class SaveModel {
  /** Operation ids whose save was acknowledged (the writer returned `queued` or later). */
  readonly acknowledged = new Set<string>();
  /** Every content a path may hold, besides what HEAD holds: a save in flight can leave any of them. */
  private readonly contents = new Map<string, Set<string>>();

  attempt(path: string, content: string): void {
    const set = this.contents.get(path) ?? new Set<string>();
    set.add(content);
    this.contents.set(path, set);
  }

  acknowledge(operationId: string, path: string, content: string): void {
    this.attempt(path, content);
    this.acknowledged.add(operationId);
  }

  paths(): readonly string[] {
    return [...this.contents.keys()];
  }

  allows(path: string, content: string): boolean {
    return this.contents.get(path)?.has(content) === true;
  }
}

/** A stage file of a write in flight; the writer removes it, it is never a document. */
const STAGE_FILE = /(^|[\\/])\.n[vb][0-9a-f]{13}$/u;
const NEWLINE = String.fromCharCode(10);
const MANIFEST = 'specification.yaml';

export type InvariantPhase =
  /** A process stopped (or a fault was injected) and nothing recovered yet: the invariants of any instant. */
  | 'stopped'
  /** After recovery and a drain: every acknowledged change is done. */
  | 'drained';

/** Paths below the Specification directory that differ from HEAD (modified, new or deleted). */
export function dirtyPaths(project: QueueProject): string[] {
  const prefix = 'specs/active/hand/';
  // Two name-only listings: a porcelain status is trimmed by the helper and would lose its first column.
  const lines = [
    git(project.root, 'diff', '--name-only', 'HEAD', '--', 'specs'),
    git(project.root, 'ls-files', '--others', '--exclude-standard', '--', 'specs'),
  ].flatMap((listing) => listing.split(NEWLINE));

  return [...new Set(lines.filter((line) => line !== ''))]
    .map((path) => (path.startsWith(prefix) ? path.slice(prefix.length) : path))
    .filter((path) => !STAGE_FILE.test(path))
    .sort();
}

/** The journals that completed `uncommitted`, active or settled. */
async function uncommittedJournals(
  project: QueueProject,
  active: readonly DocumentChangeJournal[],
): Promise<DocumentChangeJournal[]> {
  const context = project.engine.context;
  const found = new Map(active.map((journal) => [journal.operationId, journal]));
  const directory = join(
    journalDirectory(context, DOCUMENT_CHANGE_JOURNAL_KIND),
    SETTLED_DIRECTORY_NAME,
  );
  for (const name of await readdir(directory).catch(() => [])) {
    if (!name.endsWith('.json')) {
      continue;
    }

    const journal = await readSettledDocumentChangeJournal(context, name.slice(0, -5));
    if (journal !== undefined) {
      found.set(journal.operationId, journal);
    }
  }

  return [...found.values()].filter(
    (journal) => journal.stage === 'completed' && journal.outcome === 'uncommitted',
  );
}

/**
 * The operation ids an Engine commit names: its own and the ones it coalesced. The trailer is cut at
 * an id boundary when it is long and then ends with a count (`,+N`), which names no operation.
 */
export function operationsOfCommit(project: QueueProject, sha: string): string[] {
  const trailers = trailersOf(project, sha);

  return [
    trailers['Nevo-Operation']!,
    ...(trailers['Nevo-Coalesced'] ?? '')
      .split(',')
      .filter((part) => part !== '' && !part.startsWith('+')),
  ];
}

/**
 * The invariants of the document write and commit pipeline (ADR 0016), asserted from the disk:
 *
 * - I1 every pending change is journaled: a path that differs from HEAD belongs to the model and
 *   some operation that is not completed exists;
 * - I2 a path is at its pre or its post state, never between: its bytes are HEAD's or the bytes of a
 *   save the model knows;
 * - I3 the claim is held while an operation is not completed, and free when every one is;
 * - I4 nothing is committed that is not recorded: every operation an Engine commit names has a
 *   journal, and once drained it is `completed` as `committed` with that commit;
 * - I5 one active batch per checkout;
 * - I6 no operation is in two batches or in two commits;
 * - I7 after the work drained, the tree is clean, no batch or lease is left and every acknowledged
 *   operation is completed;
 * - I8 (ADR 0018) the ledger upsert precedes the completion: every path of an operation that
 *   completed `uncommitted` and still differs from HEAD is in the ledger, at any instant;
 * - I9 a dirty path is journaled or in the ledger: with an unfinished operation or a ledger entry
 *   covering it, nothing is changed that the Engine did not record.
 */
export async function expectPipelineInvariants(
  project: QueueProject,
  model: SaveModel | undefined,
  phase: InvariantPhase,
  options: { readonly claimHeldByClose?: boolean } = {},
): Promise<void> {
  const context = project.engine.context;
  const active = await listDocumentChangeJournals(context);
  const unfinished = active.filter((journal) => journal.stage !== 'completed');

  // I1 and I2
  const dirty = dirtyPaths(project);
  const prefix = 'specs/active/hand/';
  const recorded = (await ledgerPaths(project)).map((path) =>
    path.startsWith(prefix) ? path.slice(prefix.length) : path,
  );
  for (const path of dirty) {
    if (model !== undefined && path !== MANIFEST) {
      expect(model.paths(), `${path} is not a path of the model`).toContain(path);
    }
  }

  const unrecorded = dirty.filter((path) => !recorded.includes(path));
  if (unrecorded.length > 0) {
    expect(
      unfinished.length,
      `dirty ${unrecorded.join(',')} without an unfinished operation or a ledger entry`,
    ).toBeGreaterThan(0);
  }

  // I8
  for (const journal of await uncommittedJournals(project, active)) {
    for (const path of (await readJournalPlanPaths(context, journal)) ?? []) {
      const relative = path.startsWith(prefix) ? path.slice(prefix.length) : path;
      if (dirty.includes(relative)) {
        expect(
          recorded,
          `${journal.operationId} completed uncommitted but ${path} is not in the ledger`,
        ).toContain(relative);
      }
    }
  }

  for (const path of model?.paths() ?? []) {
    let head: string | undefined;
    try {
      head = git(project.root, 'show', `HEAD:specs/active/hand/${path}`);
    } catch {
      head = undefined; // not in HEAD: created by a save in flight
    }

    let onDisk: string;
    try {
      onDisk = await readFile(join(project.dir, path), 'utf8');
    } catch {
      continue; // a path that does not exist is the pre state of a creation or the post state of a delete
    }

    expect(
      onDisk.trimEnd() === head?.trimEnd() || model?.allows(path, onDisk) === true,
      `${path} holds bytes that are neither HEAD's nor a save's`,
    ).toBe(true);
  }

  // I3: an unfinished operation holds the claim; with none, only a Close (when the caller says so) may.
  const claimFree = await checkoutClaimFree(project);
  if (unfinished.length > 0) {
    expect(claimFree, 'an unfinished operation without the claim').toBe(false);
  } else if (options.claimHeldByClose !== true) {
    expect(claimFree, 'a claim without an operation').toBe(true);
  }

  // I5: one active batch per checkout; a failed batch only holds its paths and may wait beside it.
  // I6: no operation is a member of two batches and no path is in two batches.
  const batches = await listDocumentBatches(context);
  const activeBatches = new Map<string, number>();
  for (const batch of batches) {
    if (batch.state !== 'committing') {
      continue;
    }

    activeBatches.set(batch.workspaceId, (activeBatches.get(batch.workspaceId) ?? 0) + 1);
  }

  for (const [workspaceId, count] of activeBatches) {
    expect(count, `${count} active batches for checkout ${workspaceId}`).toBeLessThanOrEqual(1);
  }

  const members = batches.flatMap((batch) => batch.memberIds);
  expect(new Set(members).size, 'an operation is a member of two batches').toBe(members.length);
  const batchPaths: string[] = [];
  for (const batch of batches) {
    if (batch.state === 'committed' || batch.state === 'dissolved') {
      continue;
    }

    for (const entry of await readBatchPaths(context, batch)) {
      batchPaths.push(entry.path);
    }
  }

  expect(new Set(batchPaths).size, 'a path is in two batches').toBe(batchPaths.length);

  // I4 and I6 (commits)
  const named: string[] = [];
  for (const sha of engineCommits(project)) {
    for (const operationId of operationsOfCommit(project, sha)) {
      named.push(operationId);
      const journal = await findDocumentChangeJournal(context, operationId);
      expect(journal, `commit ${sha} names ${operationId} that has no journal`).toBeDefined();
      if (phase === 'drained') {
        expect(journal).toMatchObject({ stage: 'completed', outcome: 'committed', sha });
      }
    }
  }

  expect(new Set(named).size, 'an operation is in two commits').toBe(named.length);

  if (phase === 'drained') {
    // I7
    expect(dirtyPaths(project)).toEqual([]);
    expect(git(project.root, 'status', '--porcelain')).toBe('');
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
    expect(unfinished).toEqual([]);
    for (const operationId of model?.acknowledged ?? []) {
      const journal = await findDocumentChangeJournal(context, operationId);
      expect(journal?.stage, `acknowledged ${operationId} is not completed`).toBe('completed');
    }
  }
}
