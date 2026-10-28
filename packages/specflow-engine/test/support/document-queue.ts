import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { sha256Hex } from '../../src/hash';
import { applyDocumentChange } from '../../src/specs/documents/api';
import { listDocumentBatches } from '../../src/specs/documents/queue/batch-store';
import { leasePath } from '../../src/specs/documents/queue/lease';
import { SettleLedger, type QueueClock } from '../../src/specs/documents/queue/settle-ledger';
import type { QueueDependencies } from '../../src/specs/documents/queue/types';
import { findDocumentChangeJournal } from '../../src/specs/documents/write/journal-store';
import { commitStaged, git } from './git-project';
import { handBuiltSpecification } from './documents-fixture';
import { notesPath, notesText, writableProject, type WritableProject } from './document-writes';

export interface QueueProject extends WritableProject {
  /** What each notes document holds on disk now (the base of the next `expectedRevision`). */
  readonly content: Map<string, string>;
}

/** A project with Git, one committed Specification (`hand`, notes-1..6) and nothing queued. */
export async function queueProject(
  options: { notes?: number; autoCommit?: 'enabled' | 'default' } = {},
): Promise<QueueProject> {
  const project = await writableProject({ git: true, ...options });
  return Object.assign(project, { content: new Map<string, string>() });
}

/** The text of `notes-<index>` on disk, as far as the test wrote it. */
export function currentNotes(project: QueueProject, index: number): string {
  return project.content.get(`${project.specId}:${index}`) ?? notesText(index);
}

/** Saves `notes-<index>` through the writer: the file is on disk and the operation is `queued`. */
export async function queueSave(
  project: QueueProject,
  index: number,
  content: string,
  operationId: string = randomUUID(),
): Promise<string> {
  await applyDocumentChange(project.engine, project.specId, operationId, {
    action: 'save',
    documentId: `notes-${index}`,
    content,
    expectedRevision: sha256Hex(currentNotes(project, index)),
  });
  project.content.set(`${project.specId}:${index}`, content);
  return operationId;
}

/** A second committed Specification in the same checkout. */
export async function addSpecification(
  project: QueueProject,
  slug: string,
): Promise<{ readonly specId: string; readonly dir: string }> {
  const spec = await handBuiltSpecification(project, {
    slug,
    documents: [
      { id: 'overview', path: 'overview.md', type: 'overview' },
      { id: 'notes-1', path: 'notes-1.md', type: 'notes' },
    ],
    files: { 'overview.md': '# Second\n', 'notes-1.md': 'second notes\n' },
  });
  git(project.root, 'add', 'specs');
  commitStaged(project.root, 'second specification');
  return spec;
}

export async function saveIn(
  project: QueueProject,
  spec: { readonly specId: string },
  content: string,
  previous: string,
  operationId: string = randomUUID(),
): Promise<string> {
  await applyDocumentChange(project.engine, spec.specId, operationId, {
    action: 'save',
    documentId: 'notes-1',
    content,
    expectedRevision: sha256Hex(previous),
  });
  return operationId;
}

/** A clock the test moves by hand. The wall clock follows the real one until `wallAt` pins it. */
export interface ManualClock extends QueueClock {
  advance(ms: number): void;
  /** Pins the wall clock to this instant (epoch ms). */
  wallAt(epochMs: number): void;
}

export function manualClock(start = 1_000_000): ManualClock {
  let mono = start;
  let wall: number | undefined;
  return {
    monotonicMs: () => mono,
    wallMs: () => wall ?? Date.now(),
    advance: (ms) => {
      mono += ms;
    },
    wallAt: (epochMs) => {
      wall = epochMs;
    },
  };
}

/** Pins the wall clock to the instant the operation was queued: its age is then exactly 0. */
export async function alignWall(
  project: QueueProject,
  clock: ManualClock,
  operationId: string,
): Promise<void> {
  const journal = await findDocumentChangeJournal(project.engine.context, operationId);
  clock.wallAt(Date.parse(journal!.queuedAt!));
}

/** Dependencies with a ledger of their own, so tests never share settle state. */
export function isolatedQueue(overrides: QueueDependencies = {}): QueueDependencies {
  return { ledger: new SettleLedger(), ...overrides };
}

export function commitCount(project: QueueProject): number {
  return Number(git(project.root, 'rev-list', '--count', 'HEAD'));
}

/** Commits with an Engine trailer `Nevo-Operation: <operationId>` below the baseline. */
export function commitsOf(project: QueueProject, operationId: string): string[] {
  const out = git(
    project.root,
    'log',
    '--format=%H',
    '--grep=Nevo-Operation: ' + operationId,
    '--fixed-strings',
  );
  return out === '' ? [] : out.split('\n');
}

export function engineCommits(project: QueueProject): string[] {
  const out = git(project.root, 'log', '--format=%H', '--grep=Nevo-Kind: document-change');
  return out === '' ? [] : out.split('\n');
}

/** The trailers of the Engine commit `sha`. */
export function trailersOf(project: QueueProject, sha: string): Record<string, string> {
  const body = git(project.root, 'log', '-1', '--format=%B', sha);
  const trailers: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const match = /^(Nevo-[A-Za-z]+): (.*)$/u.exec(line);
    if (match) trailers[match[1]!] = match[2]!;
  }
  return trailers;
}

export function committedPaths(project: QueueProject, sha: string): string[] {
  return git(project.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', sha)
    .split('\n')
    .filter(Boolean)
    .sort();
}

export function workingTreeClean(project: QueueProject): boolean {
  return git(project.root, 'status', '--porcelain') === '';
}

/** The queue's records on disk: batches and the lease of the checkout. */
export async function queueRecords(
  project: QueueProject,
): Promise<{ batches: number; lease: boolean }> {
  const batches = (await listDocumentBatches(project.engine.context)).length;
  let lease = true;
  try {
    await readFile(leasePath(project.engine.context, project.workspaceId));
  } catch {
    lease = false;
  }
  return { batches, lease };
}

export async function stageOf(project: QueueProject, operationId: string) {
  return findDocumentChangeJournal(project.engine.context, operationId);
}

/** A foreign edit of a notes document (someone else's bytes on disk). */
export async function editNotesByHand(
  project: QueueProject,
  index: number,
  content: string,
): Promise<void> {
  await writeFile(join(project.dir, notesPath(index)), content);
}

/** A clock two minutes ahead of now: every backoff after a failed attempt has passed on it. */
export function clockAfterBackoff(): ManualClock {
  const clock = manualClock();
  clock.wallAt(Date.now() + 120_000);
  return clock;
}
