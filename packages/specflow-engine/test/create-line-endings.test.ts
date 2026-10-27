import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveGitExecutable } from '../src/git/executable';
import {
  bootstrapProjectHome,
  createSpecificationForTesting as createSpecification,
  inspectCreateSpecification,
  type CreateSpecificationInput,
  type SpecFlowEngine,
  installDefinitionsForTesting,
} from '../src/testing';
import { createGitTestProject, git } from './support/git-project';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

class Crash extends Error {}

async function project(
  settings: Readonly<Record<string, string>>,
): Promise<{ root: string; engine: SpecFlowEngine }> {
  const root = await createGitTestProject(
    'specflow-create-eol-',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  roots.push(root, root + '-worktrees');
  git(root, 'checkout', '-q', '-b', 'develop');
  // The user's own settings, applied after the fixture's neutral default.
  for (const [key, value] of Object.entries(settings)) git(root, 'config', '--local', key, value);
  const engine = await bootstrapProjectHome(root);
  // The definitions are installed (and committed) up front, so a test that notes HEAD before its first
  // Create sees the commit of the Create alone. A refusal (protected branch) surfaces from the Create.
  await installDefinitionsForTesting(engine).catch(() => undefined);
  return { root, engine };
}

const NOTES = 'notes.md';
const input = (engine: SpecFlowEngine, content: string): CreateSpecificationInput => ({
  operationId: randomUUID(),
  title: 'Line endings',
  created: '2026-10-14',
  archetype: { id: 'minimal', version: 1 },
  target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
  addedDocuments: [{ path: NOTES, content }],
});

/** The exact bytes of a committed blob (the `git()` helper trims, which would hide a CR). */
function blobAt(root: string, ref: string, path: string): string {
  return execFileSync(resolveGitExecutable(), ['cat-file', 'blob', ref + ':' + path], {
    cwd: root,
    encoding: 'latin1',
  });
}

const NOTES_PATH = 'specs/active/line-endings/' + NOTES;
const CASES: readonly (readonly [string, Readonly<Record<string, string>>])[] = [
  ['autocrlf=true', { 'core.autocrlf': 'true' }],
  ['autocrlf=input', { 'core.autocrlf': 'input' }],
  ['autocrlf=false', { 'core.autocrlf': 'false' }],
  ['autocrlf=true safecrlf=true', { 'core.autocrlf': 'true', 'core.safecrlf': 'true' }],
  ['autocrlf=input safecrlf=true', { 'core.autocrlf': 'input', 'core.safecrlf': 'true' }],
];
const CONTENTS: readonly (readonly [string, string])[] = [
  ['CRLF', 'one\r\ntwo\r\n'],
  ['LF', 'one\ntwo\n'],
  ['mixed', 'one\r\ntwo\nthree\r\n'],
];

describe('Create commits exactly the pinned bytes whatever the user line-ending settings are', () => {
  describe.each(CASES)('%s', (_name, settings) => {
    it.each(CONTENTS)(
      '%s content is committed byte for byte',
      async (_label, content) => {
        const { root, engine } = await project(settings);
        const request = input(engine, content);
        await createSpecification(engine, request);

        expect(blobAt(root, 'HEAD', NOTES_PATH)).toBe(
          Buffer.from(content, 'utf8').toString('latin1'),
        );
        expect(
          git(root, '-c', 'core.autocrlf=false', 'status', '--porcelain', '--untracked-files=all'),
        ).toBe('');
        expect((await inspectCreateSpecification(engine, request.operationId))?.stage).toBe(
          'completed',
        );
      },
      240000,
    );

    it('resumes after a crash between the Git commit and the journal', async () => {
      const { root, engine } = await project(settings);
      const parent = git(root, 'rev-parse', 'HEAD');
      const request = input(engine, 'one\r\ntwo\nthree\r\n');
      await expect(
        createSpecification(engine, request, {
          afterEffect: (effect) =>
            effect === 'commit' ? Promise.reject(new Crash('crash')) : Promise.resolve(),
        }),
      ).rejects.toBeInstanceOf(Crash);

      await createSpecification(engine, request, { resumeInterruptedOperation: true });

      expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
      expect(blobAt(root, 'HEAD', NOTES_PATH)).toBe('one\r\ntwo\nthree\r\n');
      expect((await inspectCreateSpecification(engine, request.operationId))?.stage).toBe(
        'completed',
      );
    }, 240000);
  });
});
