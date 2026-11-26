import { describe, expect, it } from 'vitest';

import type { TaskManifest } from '../../../tasks/resource/model';
import { attemptChangesOf } from './attempt';

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
