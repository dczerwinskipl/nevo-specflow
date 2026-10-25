import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  type SpecFlowEngine,
} from '../../src/testing';
import { DocumentError } from '../../src/specs/documents/errors';
import { createGitTestProject } from './git-project';
import { writeSpecificationManifestFixture } from './manifest-fixture';

const roots: string[] = [];

/** Whether this process may create symbolic links (Windows needs a privilege or Developer Mode). */
export const SYMLINKS_AVAILABLE: boolean = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'specflow-symlink-probe-'));
  try {
    writeFileSync(join(dir, 'target'), 'x');
    symlinkSync(join(dir, 'target'), join(dir, 'link'), 'file');
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
})();

/** Remember a directory for {@link removeTrackedRoots} (call it from `afterEach`). */
export function trackRoot(path: string): void {
  roots.push(path);
}

export async function removeTrackedRoots(): Promise<void> {
  await Promise.all(
    roots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
}

export const GIT_OFF = 'runtime: {}\ngit:\n  enabled: false\n';

export interface DocumentsFixture {
  readonly root: string;
  readonly engine: SpecFlowEngine;
}

export async function documentsProject(config = GIT_OFF): Promise<DocumentsFixture> {
  const root = await createGitTestProject('specflow-documents-', config);
  roots.push(root, root + '-worktrees');
  return { root, engine: await bootstrapProjectHome(root) };
}

/** A Specification created through Create (feature, the preselected suggestions chosen). */
export async function createdFeature(fixture: DocumentsFixture) {
  const created = await createSpecificationForTesting(fixture.engine, {
    operationId: randomUUID(),
    title: 'Readable feature',
    created: '2026-10-24',
    archetype: { id: 'feature', version: 1 },
    optionalDocumentIds: ['behaviour', 'ux', 'backend'],
    target: { kind: 'existing', workspaceId: fixture.engine.workspace.workspaceId },
  });
  return { ...created, dir: join(fixture.root, 'specs', 'active', created.slug) };
}

export interface HandBuiltOptions {
  slug?: string;
  location?: 'active' | 'archive';
  documents?: { id: string; path: string; type: string }[];
  folders?: string[];
  files?: Record<string, string | Buffer>;
}

/** A hand-built Specification: its own registry and its own files, no Create. */
export async function handBuiltSpecification(
  fixture: DocumentsFixture,
  options: HandBuiltOptions = {},
) {
  const slug = options.slug ?? 'hand';
  const location = options.location ?? 'active';
  const written = await writeSpecificationManifestFixture(fixture.root, {
    slug,
    location,
    documents: options.documents ?? [{ id: 'overview', path: 'overview.md', type: 'overview' }],
    ...(options.folders ? { folders: options.folders } : {}),
  });
  const dir = join(fixture.root, 'specs', location, slug);
  for (const [path, content] of Object.entries(options.files ?? { 'overview.md': '# Hand\n' })) {
    await mkdir(join(dir, ...path.split('/').slice(0, -1)), { recursive: true });
    await writeFile(join(dir, ...path.split('/')), content);
  }
  return { specId: written.specId, dir };
}

/** The error a promise rejects with; fails when it resolves. */
export async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the operation to fail.');
}

export function errorCode(error: unknown): string | undefined {
  return error instanceof DocumentError ? error.code : undefined;
}
