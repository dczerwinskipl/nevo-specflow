import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  createSpecificationForTesting as createSpecification,
  inspectCreateSpecification,
  type CreateSpecificationInput,
  type SpecFlowEngine,
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

const crashAfter = (name: string) => (effect: string) =>
  effect === name ? Promise.reject(new Crash('crash after ' + name)) : Promise.resolve();

async function project(
  attributes: string | undefined,
  autocrlf: string,
): Promise<{ root: string; engine: SpecFlowEngine }> {
  const root = await createGitTestProject(
    'specflow-create-attr-',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  roots.push(root, root + '-worktrees');
  git(root, 'checkout', '-q', '-b', 'develop');
  git(root, 'config', '--local', 'core.autocrlf', autocrlf);
  if (attributes !== undefined) {
    await writeFile(join(root, '.gitattributes'), attributes);
    git(root, 'add', '.gitattributes');
    git(root, '-c', 'user.name=T', '-c', 'user.email=t@e.invalid', 'commit', '-qm', 'attributes');
  }
  return { root, engine: await bootstrapProjectHome(root) };
}

const NOTES_PATH = 'specs/active/attributes/notes.md';
const input = (engine: SpecFlowEngine, content: string): CreateSpecificationInput => ({
  operationId: randomUUID(),
  title: 'Attributes',
  created: '2026-10-14',
  archetype: { id: 'minimal', version: 1 },
  target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
  addedDocuments: [{ path: 'notes.md', content }],
});

const RULES: readonly (readonly [string, string | undefined])[] = [
  ['* text=auto eol=lf', '* text=auto eol=lf\n'],
  ['*.md text eol=lf', '*.md text eol=lf\n'],
  ['*.md text', '*.md text\n'],
  ['* text eol=crlf', '* text eol=crlf\n'],
  ['*.md -text', '*.md -text\n'],
  ['none', undefined],
];
const AUTOCRLF = ['false', 'true', 'input'] as const;
const CONTENTS: readonly (readonly [string, string])[] = [
  ['LF', 'one\ntwo\n'],
  ['CRLF', 'one\r\ntwo\r\n'],
  ['mixed', 'one\r\ntwo\nthree\r\n'],
];

/** What Git stores for the working file: the same attributes a hand `git add` would apply. */
function storedOid(root: string): string {
  return git(root, '-c', 'core.autocrlf=false', 'hash-object', '--', NOTES_PATH);
}

describe('Create with .gitattributes line-ending rules', () => {
  describe.each(RULES)('%s', (_rule, attributes) => {
    describe.each(AUTOCRLF)('autocrlf=%s', (autocrlf) => {
      it.each(CONTENTS)(
        '%s content: Create completes and a crash after the commit resumes with one commit',
        async (_label, content) => {
          const { root, engine } = await project(attributes, autocrlf);
          const parent = git(root, 'rev-parse', 'HEAD');
          const request = input(engine, content);
          await expect(
            createSpecification(engine, request, { afterEffect: crashAfter('commit') }),
          ).rejects.toBeInstanceOf(Crash);
          expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');

          await createSpecification(engine, request, { resumeInterruptedOperation: true });

          expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
          expect((await inspectCreateSpecification(engine, request.operationId))?.stage).toBe(
            'completed',
          );
          // The disk keeps the pinned bytes and the blob is what Git stores for them.
          expect(await readFile(join(root, NOTES_PATH), 'utf8')).toBe(content);
          expect(git(root, 'rev-parse', 'HEAD:' + NOTES_PATH)).toBe(storedOid(root));
          expect(
            git(
              root,
              '-c',
              'core.autocrlf=false',
              'status',
              '--porcelain',
              '--untracked-files=all',
            ),
          ).toBe('');
        },
        240000,
      );
    });

    it('accepts a scaffold the user committed by hand', async () => {
      const { root, engine } = await project(attributes, 'false');
      const parent = git(root, 'rev-parse', 'HEAD');
      const request = input(engine, 'one\r\ntwo\nthree\r\n');
      await expect(
        createSpecification(engine, request, { afterEffect: crashAfter('manifest') }),
      ).rejects.toBeInstanceOf(Crash);
      git(root, 'add', 'specs');
      git(root, '-c', 'user.name=H', '-c', 'user.email=h@e.invalid', 'commit', '-qm', 'by hand');
      const manual = git(root, 'rev-parse', 'HEAD');

      await createSpecification(engine, request, { resumeInterruptedOperation: true });

      expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
      expect(
        (await inspectCreateSpecification(engine, request.operationId))?.commit?.commitSha,
      ).toBe(manual);
    }, 240000);

    it('refuses a partly committed scaffold', async () => {
      const { root, engine } = await project(attributes, 'false');
      const request = input(engine, 'one\r\ntwo\n');
      await expect(
        createSpecification(engine, request, { afterEffect: crashAfter('manifest') }),
      ).rejects.toBeInstanceOf(Crash);
      git(root, 'add', 'specs/active/attributes/overview.md');
      git(root, '-c', 'user.name=H', '-c', 'user.email=h@e.invalid', 'commit', '-qm', 'partial');
      await expect(
        createSpecification(engine, request, { resumeInterruptedOperation: true }),
      ).rejects.toMatchObject({ code: 'CREATE_RECOVERY_REQUIRED' });
    }, 240000);
  });

  describe('a hand commit made under the user autocrlf=true', () => {
    it('is refused without a normalising rule, and a follow-up commit with autocrlf=false resumes', async () => {
      const { root, engine } = await project(undefined, 'true');
      const parent = git(root, 'rev-parse', 'HEAD');
      const request = input(engine, 'one\r\ntwo\r\n');
      await expect(
        createSpecification(engine, request, { afterEffect: crashAfter('manifest') }),
      ).rejects.toBeInstanceOf(Crash);
      git(root, 'add', 'specs');
      git(root, '-c', 'user.name=H', '-c', 'user.email=h@e.invalid', 'commit', '-qm', 'by hand');
      await expect(
        createSpecification(engine, request, { resumeInterruptedOperation: true }),
      ).rejects.toMatchObject({ code: 'CREATE_RECOVERY_REQUIRED' });

      // The documented remedy: a follow-up commit of the same files with autocrlf=false. History is
      // not rewritten: the refused resume already pinned the parent HEAD in the journal.
      git(root, '-c', 'core.autocrlf=false', 'add', 'specs');
      git(root, '-c', 'user.name=H', '-c', 'user.email=h@e.invalid', 'commit', '-qm', 'by hand');
      await createSpecification(engine, request, { resumeInterruptedOperation: true });
      expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('2');
      expect((await inspectCreateSpecification(engine, request.operationId))?.stage).toBe(
        'completed',
      );
    }, 240000);

    it('is accepted when a normalising attribute rule makes the blob what Git stores', async () => {
      const { root, engine } = await project('* text=auto eol=lf\n', 'true');
      const request = input(engine, 'one\r\ntwo\r\n');
      await expect(
        createSpecification(engine, request, { afterEffect: crashAfter('manifest') }),
      ).rejects.toBeInstanceOf(Crash);
      git(root, 'add', 'specs');
      git(root, '-c', 'user.name=H', '-c', 'user.email=h@e.invalid', 'commit', '-qm', 'by hand');
      await createSpecification(engine, request, { resumeInterruptedOperation: true });
      expect((await inspectCreateSpecification(engine, request.operationId))?.stage).toBe(
        'completed',
      );
    }, 240000);
  });
});
