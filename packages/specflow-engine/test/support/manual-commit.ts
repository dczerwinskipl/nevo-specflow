import { randomUUID } from 'node:crypto';

import { sha256Hex } from '../../src/hash';
import { applyDocumentChange } from '../../src/specs/documents/api';
import {
  manualCommit,
  readUncommittedScope,
  recoverManualCommitOperation,
  type ManualCommitCommand,
  type ManualCommitCommandOptions,
  type ManualCommitCommandResult,
} from '../../src/specs/documents/manual-commit';
import {
  findManualCommitJournal,
  type ManualCommitRecoverMode,
} from '../../src/specs/manual-commit';
import { isolatedQueue, queueProject, type QueueProject } from './document-queue';
import { notesPath, notesText, setLocalAutoCommit } from './document-writes';
import { git } from './git-project';

/** The checkout-relative path of `notes-<index>` of the project's Specification. */
export const specPath = (index: number): string => `specs/active/hand/${notesPath(index)}`;

/** The text of `notes-<index>` the tests last saved (the base of the next `expectedRevision`). */
export function notesNow(project: QueueProject, index: number): string {
  return project.content.get(`${project.specId}:${index}`) ?? notesText(index);
}

/** Saves `notes-<index>` through the writer: with auto-commit off it is uncommitted at once. */
export async function saveUncommitted(
  project: QueueProject,
  index: number,
  content: string,
  operationId: string = randomUUID(),
): Promise<string> {
  await applyDocumentChange(project.engine, project.specId, operationId, {
    action: 'save',
    documentId: `notes-${index}`,
    content,
    expectedRevision: sha256Hex(notesNow(project, index)),
  });
  project.content.set(`${project.specId}:${index}`, content);

  return operationId;
}

/** A batch save of several notes documents: one operation, so their paths travel together. */
export async function saveAllUncommitted(
  project: QueueProject,
  contents: ReadonlyMap<number, string>,
  operationId: string = randomUUID(),
): Promise<string> {
  await applyDocumentChange(project.engine, project.specId, operationId, {
    action: 'save-all',
    documents: [...contents].map(([index, content]) => ({
      documentId: `notes-${index}`,
      content,
      expectedRevision: sha256Hex(notesNow(project, index)),
    })),
  });
  for (const [index, content] of contents) {
    project.content.set(`${project.specId}:${index}`, content);
  }

  return operationId;
}

/** A project with auto-commit off for the documents (the local setting), nothing saved yet. */
export async function manualModeProject(): Promise<QueueProject> {
  const project = await queueProject();
  await setLocalAutoCommit(project, false);

  return project;
}

export interface CommitOverrides extends Partial<Omit<ManualCommitCommand, 'operationId'>> {
  readonly operationId?: string;
}

/** The options every test uses: a queue ledger of its own, so tests never share settle state. */
export function manualOptions(
  overrides: ManualCommitCommandOptions = {},
): ManualCommitCommandOptions {
  return { queue: isolatedQueue(), ...overrides };
}

/** A manual commit of the Specification of the project. */
export function commitUncommitted(
  project: QueueProject,
  overrides: CommitOverrides = {},
  options: ManualCommitCommandOptions = {},
): Promise<ManualCommitCommandResult> {
  const { operationId, ...rest } = overrides;

  return manualCommit(
    project.engine,
    {
      operationId: operationId ?? randomUUID(),
      scope: 'specification',
      specId: project.specId,
      ...rest,
    },
    manualOptions(options),
  );
}

export function recover(
  project: QueueProject,
  operationId: string,
  mode: ManualCommitRecoverMode,
  options: Parameters<typeof recoverManualCommitOperation>[3] = {},
): Promise<ManualCommitCommandResult> {
  return recoverManualCommitOperation(project.engine, operationId, mode, options);
}

export function journalOf(project: QueueProject, operationId: string) {
  return findManualCommitJournal(project.engine.context, operationId);
}

/** The `ledgerRevision` a client reads for the Specification now. */
export async function ledgerRevisionOf(project: QueueProject): Promise<string> {
  return (
    await readUncommittedScope(project.engine, { scope: 'specification', specId: project.specId })
  ).ledgerRevision;
}

/** The full message of a commit. */
export function messageOf(project: QueueProject, sha: string): string {
  return git(project.root, 'log', '-1', '--format=%B', sha);
}

/** Commits made by the manual commit kind. */
export function manualCommits(project: QueueProject): string[] {
  const out = git(project.root, 'log', '--format=%H', '--grep=Nevo-Kind: manual-commit');

  return out === '' ? [] : out.split('\n');
}

/** The number of commits reachable from HEAD. */
export function headCount(project: QueueProject): number {
  return Number(git(project.root, 'rev-list', '--count', 'HEAD'));
}
