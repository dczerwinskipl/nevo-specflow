import { describe, expect, it } from 'vitest';

import type { TaskManifest } from '../../../tasks/resource/model';
import { attemptChangesOf, committedPathsOf } from './attempt';

const SPEC = 'specs/active/sso';

const task = (id: string, title: string): TaskManifest =>
  ({
    id,
    title,
    type: 'implementation',
    status: 'draft',
    dependsOn: [],
    origin: { kind: 'produced', step: 'breakdown', attempt: 1 },
    documents: [{ id: 'task', path: 'task.md', type: 'task' }],
  }) as unknown as TaskManifest;

describe('attemptChangesOf', () => {
  it('puts each path of a Specification attempt in one group', () => {
    const login = task('login', 'Sign in with SSO');
    const changes = attemptChangesOf({
      specification: { directory: SPEC, documents: [`${SPEC}/overview.md`] },
      subject: { kind: 'specification', specId: 'x' },
      manifests: [login],
      produced: [login],
      paths: [
        `${SPEC}/overview.md`,
        `${SPEC}/overview.md`,
        `${SPEC}/notes.txt`,
        `${SPEC}/specification.yaml`,
        `${SPEC}/.execution/specification.yaml`,
        `${SPEC}/tasks/index.yaml`,
        `${SPEC}/tasks/login/task.md`,
        'src/a.ts',
      ],
    });

    expect(changes).toEqual({
      directory: SPEC,
      documents: [`${SPEC}/overview.md`],
      tasks: [{ id: 'login', title: 'Sign in with SSO' }],
      // An unregistered file of the Specification is a file, not a document.
      files: [`${SPEC}/notes.txt`, 'src/a.ts'],
      state: [
        `${SPEC}/.execution/specification.yaml`,
        `${SPEC}/specification.yaml`,
        `${SPEC}/tasks/index.yaml`,
        `${SPEC}/tasks/login/task.md`,
      ],
    });
  });

  it("counts a Task attempt's own registered documents as documents", () => {
    const login = task('login', 'Sign in with SSO');
    const changes = attemptChangesOf({
      specification: { directory: SPEC, documents: [] },
      subject: { kind: 'task', specId: 'x', taskId: 'login' },
      manifests: [login],
      produced: [],
      paths: [`${SPEC}/tasks/login/task.md`, `${SPEC}/.execution/tasks/login.yaml`],
      truncated: true,
    });

    expect(changes.documents).toEqual([`${SPEC}/tasks/login/task.md`]);
    expect(changes.state).toEqual([`${SPEC}/.execution/tasks/login.yaml`]);
    expect(changes.truncated).toBe(true);
  });
});

describe('committedPathsOf', () => {
  const dirty = (paths: readonly string[], truncated?: true) => ({
    invocationId: 'i',
    recordedAt: '2026-11-25T12:00:00.000Z',
    paths: paths.map((path) => ({ path, sha256: null })),
    ...(truncated ? { truncated } : {}),
  });

  it('takes the paths the commit names', () => {
    expect(
      committedPathsOf({ documents: 1, files: 0, paths: ['a.md'] }, dirty(['a.md', 'b.md'])),
    ).toEqual(['a.md']);
  });

  it("takes an older journal's dirty set when it holds as many paths as the commit counted", () => {
    expect(committedPathsOf({ documents: 2, files: 0 }, dirty(['a.md', 'b.md']))).toEqual([
      'a.md',
      'b.md',
    ]);
  });

  it('names none when the dirty set cannot be the commit', () => {
    expect(committedPathsOf({ documents: 3, files: 0 }, dirty(['a.md', 'b.md']))).toBeUndefined();
    expect(
      committedPathsOf({ documents: 2, files: 0 }, dirty(['a.md', 'b.md'], true)),
    ).toBeUndefined();
    expect(committedPathsOf(undefined, dirty(['a.md']))).toBeUndefined();
  });
});
