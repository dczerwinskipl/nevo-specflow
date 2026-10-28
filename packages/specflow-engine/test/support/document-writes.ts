import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { sha256Hex } from '../../src/hash';
import { assertSharedResourcesAvailable } from '../../src/specs/coordination/resources';
import { readLedgerRecord, type LedgerRecord } from '../../src/specs/durable';
import type { DocumentChangeRequest } from '../../src/specs/documents/changes/plan/request';
import type { DocumentChangeJournal } from '../../src/specs/documents/changes/journal/model';
import { listDocumentChangeJournals } from '../../src/specs/documents/write/journal-store';
import type { SpecFlowEngine } from '../../src/testing';
import { commitStaged, git } from './git-project';
import {
  documentsProject,
  handBuiltSpecification,
  GIT_OFF,
  type DocumentsFixture,
} from './documents-fixture';

/** Git on with the default policy: nothing is committed automatically (enable it with `enableAutoCommitForTesting`). */
export const GIT_ON = 'runtime: {}\ngit:\n  enabled: true\n';

export interface WritableProject extends DocumentsFixture {
  readonly specId: string;
  readonly dir: string;
  readonly workspaceId: string;
}

export const notesPath = (index: number): string => `notes-${index}.md`;
export const notesText = (index: number): string => `notes ${index}\n`;
export const notesRevision = (index: number): string => sha256Hex(notesText(index));

/** A project with a committed, hand-built Specification of `overview` and `notes-1..notes-N`. */
export async function writableProject(
  options: { git?: boolean; notes?: number; autoCommit?: 'enabled' | 'default' } = {},
): Promise<WritableProject> {
  const count = options.notes ?? 6;
  const fixture = await documentsProject(options.git === true ? GIT_ON : GIT_OFF);
  if (options.git === true) git(fixture.root, 'checkout', '-q', '-b', 'feature/work');
  // The queue is what most tests exercise: they run with auto-commit enabled unless they ask for the default.
  if (options.git === true && options.autoCommit !== 'default') {
    await enableAutoCommitForTesting(fixture.root);
  }
  const indexes = Array.from({ length: count }, (_, index) => index + 1);
  const spec = await handBuiltSpecification(fixture, {
    documents: [
      { id: 'overview', path: 'overview.md', type: 'overview' },
      ...indexes.map((index) => ({
        id: `notes-${index}`,
        path: notesPath(index),
        type: 'notes',
      })),
    ],
    files: {
      'overview.md': '# Hand\n',
      ...Object.fromEntries(indexes.map((index) => [notesPath(index), notesText(index)])),
    },
  });
  git(fixture.root, 'add', 'specs');
  commitStaged(fixture.root, 'specification');
  return { ...fixture, ...spec, workspaceId: fixture.engine.workspace.workspaceId };
}

/**
 * Sets `git.commits.auto.documents` in the workstation-local configuration (ignored by Git, so the
 * checkout stays clean); `undefined` removes the file.
 */
export async function setLocalAutoCommit(
  project: WritableProject,
  documents: boolean | undefined,
): Promise<void> {
  await writeLocalAutoCommit(project.root, documents);
}

/**
 * Enables `git.commits.auto.documents` through the local configuration, the same path production
 * reads. Automatic commit is off by default, so every test of the queue, the scheduler, flush, retry and
 * Close calls this (or uses `writableProject({ git: true })`, which does).
 */
export async function enableAutoCommitForTesting(root: string): Promise<void> {
  await writeLocalAutoCommit(root, true);
}

async function writeLocalAutoCommit(root: string, documents: boolean | undefined): Promise<void> {
  const path = join(root, '.nevo', 'local', 'config.yaml');
  if (documents === undefined) {
    await rm(path, { force: true });
    return;
  }
  await mkdir(join(root, '.nevo', 'local'), { recursive: true });
  await writeFile(
    path,
    ['git:', '  commits:', '    auto:', '      documents: ' + String(documents), ''].join('\n'),
  );
}

/** The uncommitted-changes ledger record of the project's Specification, or `undefined`. */
export function ledgerOf(project: WritableProject): Promise<LedgerRecord | undefined> {
  return readLedgerRecord(project.engine.context, project.workspaceId, {
    kind: 'specification',
    id: project.specId,
  });
}

/** The paths the ledger of the project's Specification holds, sorted. */
export async function ledgerPaths(project: WritableProject): Promise<string[]> {
  return ((await ledgerOf(project))?.entries ?? []).map((entry) => entry.path);
}

export function saveNotes(index: number, content: string): DocumentChangeRequest {
  return {
    action: 'save',
    documentId: `notes-${index}`,
    content,
    expectedRevision: notesRevision(index),
  };
}

export async function activeJournals(
  engine: SpecFlowEngine,
): Promise<readonly DocumentChangeJournal[]> {
  return listDocumentChangeJournals(engine.context);
}

/** Whether a Close of the checkout could be admitted now (no unfinished document change holds it). */
export async function checkoutClaimFree(project: WritableProject): Promise<boolean> {
  try {
    await assertSharedResourcesAvailable(project.engine.context, [
      'checkout:' + project.workspaceId,
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Stage files (`.nv...`) left in the Specification directory tree. */
export async function strayStageFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true });
  return entries.filter((entry) => /(^|[\\/])\.n[vb][0-9a-f]{13}$/u.test(entry)).sort();
}

export const text = (project: WritableProject, path: string): Promise<string> =>
  readFile(join(project.dir, path), 'utf8');

export function errnoError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

export const noSleep = (): Promise<void> => Promise.resolve();
