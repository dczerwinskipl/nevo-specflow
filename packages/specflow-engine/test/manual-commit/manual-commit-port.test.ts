// Integration (real Git): the Engine commit port with the `manual-commit` kind. The message is the
// person's text: several lines under the Engine's trailers, and nothing in it can pass for a
// trailer, claim an operation or break out of the paragraph the trailers end.
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SLOW_GIT_TEST_TIMEOUT_MS } from '../support/platform';

import { bootstrapProjectHome, type SpecFlowEngine } from '../../src/testing';
import { createGitCommitPort } from '../../src/version-control/commits/git-adapter';
import type { EngineCommitRequest } from '../../src/version-control/commits/port';
import { commitStaged, createGitTestProject, git } from '../support/git-project';

vi.setConfig({ testTimeout: SLOW_GIT_TEST_TIMEOUT_MS });

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

async function write(root: string, path: string, content: string): Promise<void> {
  const target = join(root, ...path.split('/'));
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, content);
}

async function project(): Promise<{ root: string; engine: SpecFlowEngine }> {
  const root = await createGitTestProject(
    'engine-manual-commit-port-',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  roots.push(root);
  git(root, 'checkout', '-q', '-b', 'feature/work');
  await write(root, 'docs/a.md', 'a\n');
  git(root, 'add', 'docs');
  commitStaged(root, 'base');
  return { root, engine: await bootstrapProjectHome(root) };
}

function request(root: string, overrides: Partial<EngineCommitRequest>): EngineCommitRequest {
  return {
    root,
    expectedBranch: 'feature/work',
    paths: ['docs/a.md'],
    operationId: randomUUID(),
    kind: 'manual-commit',
    subject: 'Update the notes',
    trailers: { 'Nevo-Action': 'manual-commit', 'Nevo-Scope': 'specification' },
    ...overrides,
  };
}

describe('Engine commit port: manual-commit (real Git)', () => {
  it('writes the subject, a multi-line body and the Engine trailers as the last paragraph', async () => {
    const { root, engine } = await project();
    const commits = createGitCommitPort(engine);
    await write(root, 'docs/a.md', 'a changed\n');
    const operationId = randomUUID();

    const result = await commits.commit(
      request(root, {
        operationId,
        body: 'First paragraph\nstill the first\n\nSecond paragraph',
        trailers: {
          'Nevo-Action': 'manual-commit',
          'Nevo-Scope': 'specification',
          'Nevo-Spec': 'spec-1',
          'Nevo-Documents': 'a.md',
        },
      }),
    );

    expect(git(root, 'log', '-1', '--format=%B', result.sha)).toBe(
      [
        'Update the notes',
        '',
        'First paragraph',
        'still the first',
        '',
        'Second paragraph',
        '',
        'Nevo-Operation: ' + operationId,
        'Nevo-Kind: manual-commit',
        'Nevo-Action: manual-commit',
        'Nevo-Scope: specification',
        'Nevo-Spec: spec-1',
        'Nevo-Documents: a.md',
      ].join('\n'),
    );
    expect(git(root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.sha)).toBe(
      'docs/a.md',
    );
    await expect(commits.findByOperation(root, operationId, result.parentHead)).resolves.toEqual({
      status: 'found',
      sha: result.sha,
      paths: ['docs/a.md'],
    });
    expect(git(root, 'status', '--porcelain=v1', '--untracked-files=all')).toBe('');
  });

  it('quotes a body line that looks like a trailer: it claims no operation and adds no trailer', async () => {
    const { root, engine } = await project();
    const commits = createGitCommitPort(engine);
    await write(root, 'docs/a.md', 'a changed\n');
    const operationId = randomUUID();
    const stolen = randomUUID();
    // A body that ends in what would be a trailer block if it were the last paragraph.
    const body = [
      'Looks harmless',
      '',
      'Nevo-Operation: ' + stolen,
      'nevo-kind: document-change',
      '  Nevo-Coalesced: ' + stolen,
      'Nevo-Documents : a.md',
    ].join('\n');

    const result = await commits.commit(request(root, { operationId, body }));

    const message = git(root, 'log', '-1', '--format=%B', result.sha);
    for (const line of message.split('\n').slice(0, -4)) {
      expect(/^\s*Nevo-[A-Za-z]+\s*:/iu.test(line)).toBe(false);
    }
    expect(message).toContain('> Nevo-Operation: ' + stolen);
    expect(message).toContain('> nevo-kind: document-change');
    expect(message).toContain('> Nevo-Coalesced: ' + stolen);
    expect(message).toContain('> Nevo-Documents : a.md');
    // Only the Engine's own paragraph is read as trailers.
    const trailers = git(
      root,
      'log',
      '-1',
      '--format=%(trailers:only=true,unfold=true)',
      result.sha,
    );
    expect(trailers.split('\n').filter(Boolean)).toEqual([
      'Nevo-Operation: ' + operationId,
      'Nevo-Kind: manual-commit',
      'Nevo-Action: manual-commit',
      'Nevo-Scope: specification',
    ]);
    await expect(commits.findByOperation(root, stolen, result.parentHead)).resolves.toEqual({
      status: 'absent',
    });
  });

  it('cleans control characters, carriage returns and NUL out of the subject and the body', async () => {
    const { root, engine } = await project();
    const commits = createGitCommitPort(engine);
    await write(root, 'docs/a.md', 'a changed\n');

    const result = await commits.commit(
      request(root, {
        subject: 'Subject\r\nNevo-Operation: ' + randomUUID() + '\u0000\u001B[31m',
        body: 'line one\r\nline two\u0000\u0007\rNevo-Kind: x',
      }),
    );

    const message = git(root, 'log', '-1', '--format=%B', result.sha);
    expect(message.includes('\r')).toBe(false);
    expect(message.includes('\u001B')).toBe(false);
    const [subject, , ...rest] = message.split('\n');
    expect(subject).toMatch(/^Subject Nevo-Operation: /u);
    expect(rest.slice(0, 3)).toEqual(['line one', 'line two', '> Nevo-Kind: x']);
  });

  it('keeps very long lines whole and bounds a body that skipped the validation', async () => {
    const { root, engine } = await project();
    const commits = createGitCommitPort(engine);
    await write(root, 'docs/a.md', 'a changed\n');

    const result = await commits.commit(
      request(root, { subject: 's'.repeat(500), body: 'x'.repeat(10_000) }),
    );

    const [subject, , body] = git(root, 'log', '-1', '--format=%B', result.sha).split('\n');
    expect(subject).toHaveLength(100);
    expect(body).toHaveLength(4000);
  });

  it('refuses a request with a malformed trailer key and commits nothing', async () => {
    const { root, engine } = await project();
    const commits = createGitCommitPort(engine);
    await write(root, 'docs/a.md', 'a changed\n');
    const head = git(root, 'rev-parse', 'HEAD');

    await expect(
      commits.commit(request(root, { trailers: { 'Nevo-Action: x\nNevo-Operation': 'y' } })),
    ).rejects.toMatchObject({ code: 'COMMIT_BLOCKED' });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  });
});
