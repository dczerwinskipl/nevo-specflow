import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  inspectCloseOperation,
  readWorkspaceSpecification,
} from '@nevo/specflow-engine/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0).reverse()) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

async function fixture(linked: boolean) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-http-close-Ż ')));
  roots.push(root);
  git(root, 'init', '-q');
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: true\n');
  git(root, 'add', '.gitignore', '.nevo/config.yaml');
  git(
    root,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '-qm',
    'initial',
  );
  const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: ' + branch + '\n',
  );
  git(root, 'add', '.nevo/config.yaml');
  git(
    root,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '-qm',
    'target branch',
  );
  const engine = await bootstrapProjectHome(root);
  const registry = await engine.readRegistry();
  const spec = await createSpecificationForTesting(engine, {
    archetype: { id: 'minimal', version: 1 },
    operationId: randomUUID(),
    title: 'Protected lifecycle HTTP',
    created: '2026-10-19',
    target: linked
      ? { kind: 'new-worktree' as const, baseRef: 'HEAD' }
      : { kind: 'existing' as const, workspaceId: registry.primaryWorkspaceId },
  });
  if (linked) {
    roots.push(dirname(spec.workspaceRoot));
  }

  git(
    spec.workspaceRoot,
    'add',
    '--',
    spec.relativeManifestPath,
    'specs/active/' + spec.slug + '/overview.md',
  );
  // Create commits its own scaffold when git.enabled; only commit what is still staged.
  if (git(spec.workspaceRoot, 'diff', '--cached', '--name-only') !== '') {
    git(
      spec.workspaceRoot,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'canonical source',
    );
  }

  return { root, engine, spec };
}

async function authedApp(
  engine: Awaited<ReturnType<typeof bootstrapProjectHome>>,
  role: 'viewer' | 'developer' | 'admin',
) {
  const store = new InMemoryAuthenticationStore();
  const session = store.createSession({
    userId: 'demo-user',
    authenticatedWith: { kind: 'password' },
  });
  const config = passwordConfig();
  const app = await createRuntimeApp(
    {
      ...config,
      authorization: { assignments: [{ userId: 'demo-user', role, scope: {} }] },
    },
    { auth: { store }, specs: { engine } },
  );

  return {
    app,
    headers: { cookie: authCookieNames(config.server.port).session + '=' + session },
  };
}

describe('E2.T16 authorized HTTP lifecycle adapters', () => {
  it('LC24: public Close rejects fake gate and process claims without mutation', async () => {
    const { root, engine, spec } = await fixture(false);
    const { app, headers } = await authedApp(engine, 'admin');
    const url = '/api/specs/' + spec.specId + '/close';
    const originalHead = git(root, 'rev-parse', 'HEAD');
    const forbidden = [
      { gateDisposition: 'passed' },
      { exitEvaluation: { approved: true } },
      { adminBypass: true },
      { processList: [] },
      { confirmedNoActiveGitProcess: true },
      { sessionQuiescence: true },
    ];
    try {
      for (const extra of forbidden) {
        const operationId = randomUUID();
        const response = await app.inject({
          method: 'POST',
          url,
          headers,
          payload: { operationId, ...extra },
        });
        expect(response.statusCode).toBe(400);
        expect(await inspectCloseOperation(engine, operationId)).toBeUndefined();
        expect(git(root, 'rev-parse', 'HEAD')).toBe(originalHead);
      }

      const approved = await app.inject({
        method: 'POST',
        url,
        headers,
        payload: { operationId: randomUUID() },
      });
      expect(approved.statusCode, approved.body).toBe(200);
      const result = approved.json<Record<string, unknown>>();
      expect(result).toMatchObject({ status: 'completed', outcome: 'archived-in-primary' });
      for (const extra of forbidden) {
        for (const name of Object.keys(extra)) {
          expect(Object.hasOwn(result, name)).toBe(false);
        }
      }
    } finally {
      await app.close();
    }
  }, 120000);

  it('rejects anonymous and viewer before any archive mutation', async () => {
    const { root, engine, spec } = await fixture(false);
    const { app, headers } = await authedApp(engine, 'viewer');
    const url = '/api/specs/' + spec.specId + '/close';
    const original = git(root, 'rev-parse', 'HEAD');
    const operationId = randomUUID();
    try {
      const anonymous = await app.inject({ method: 'POST', url, payload: { operationId } });
      expect(anonymous.statusCode).toBe(401);
      const viewer = await app.inject({ method: 'POST', url, headers, payload: { operationId } });
      expect(viewer.statusCode).toBe(403);
      expect(await inspectCloseOperation(engine, operationId)).toBeUndefined();
      expect(git(root, 'rev-parse', 'HEAD')).toBe(original);
    } finally {
      await app.close();
    }
  }, 120000);

  it('allows a developer to archive a linked Spec without whole-branch permission', async () => {
    const { root, engine, spec } = await fixture(true);
    const { app, headers } = await authedApp(engine, 'developer');
    const url = '/api/specs/' + spec.specId + '/close';
    const originalPrimary = git(root, 'rev-parse', 'HEAD');
    const operationId = randomUUID();
    try {
      const request = {
        method: 'POST' as const,
        url,
        headers,
        payload: {
          operationId,
          integrateToTargetBranch: false,
        },
      };
      const first = await app.inject(request);
      expect(first.statusCode, first.body).toBe(200);
      expect(first.json()).toMatchObject({ status: 'completed', outcome: 'archive-only-closed' });
      expect((await readWorkspaceSpecification(spec.workspaceRoot, spec.specId)).location).toBe(
        'archive',
      );
      expect(git(root, 'rev-parse', 'HEAD')).toBe(originalPrimary);
      expect((await app.inject(request)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  }, 120000);

  it('requires independent project-wide permission BEFORE integrating a linked branch', async () => {
    const { root, engine, spec } = await fixture(true);
    const operationId = randomUUID();
    const url = '/api/specs/' + spec.specId + '/close';
    const originalPrimary = git(root, 'rev-parse', 'HEAD');
    const originalSource = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const developer = await authedApp(engine, 'developer');
    try {
      const denied = await developer.app.inject({
        method: 'POST',
        url,
        headers: developer.headers,
        payload: { operationId },
      });
      expect(denied.statusCode, denied.body).toBe(403);
      expect(await inspectCloseOperation(engine, operationId)).toBeUndefined();
      expect(git(root, 'rev-parse', 'HEAD')).toBe(originalPrimary);
      expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(originalSource);
    } finally {
      await developer.app.close();
    }

    const admin = await authedApp(engine, 'admin');
    try {
      const result = await admin.app.inject({
        method: 'POST',
        url,
        headers: admin.headers,
        payload: { operationId },
      });
      expect(result.statusCode, result.body).toBe(200);
      expect(result.json()).toMatchObject({
        status: 'completed',
        outcome: 'integrated-and-removed',
      });
      expect((await readWorkspaceSpecification(root, spec.specId)).location).toBe('archive');
      const status = await admin.app.inject({
        method: 'GET',
        url: url + '/operations/' + operationId,
        headers: admin.headers,
      });
      expect(status.statusCode).toBe(200);
      expect(status.json()).toMatchObject({ status: 'completed' });
    } finally {
      await admin.app.close();
    }
  }, 120000);

  it('keeps Worktree Close separate and denies a Spec-scoped developer without Git permission', async () => {
    const { root, engine, spec } = await fixture(true);
    const url = '/api/specs/' + spec.specId + '/worktree/close';
    const operationId = randomUUID();
    const initialPrimary = git(root, 'rev-parse', 'HEAD');
    const developer = await authedApp(engine, 'developer');
    try {
      const result = await developer.app.inject({
        method: 'POST',
        url,
        headers: developer.headers,
        payload: { operationId },
      });
      expect(result.statusCode).toBe(403);
      expect(git(root, 'rev-parse', 'HEAD')).toBe(initialPrimary);
    } finally {
      await developer.app.close();
    }

    const admin = await authedApp(engine, 'admin');
    try {
      const result = await admin.app.inject({
        method: 'POST',
        url,
        headers: admin.headers,
        payload: { operationId },
      });
      expect(result.statusCode, result.body).toBe(200);
      expect(result.json()).toMatchObject({
        status: 'completed',
        outcome: 'worktree-integrated-and-removed',
      });
      expect((await readWorkspaceSpecification(root, spec.specId)).location).toBe('active');
    } finally {
      await admin.app.close();
    }
  }, 120000);

  it('I03: workspace preview hides occupants before admin grant, then closes all bindings', async () => {
    const { root, engine, spec: a } = await fixture(true);
    const registry = await engine.readRegistry();
    const workspaceId = registry.specBindings.find((x) => x.specId === a.specId)!.workspaceId;
    const b = await createSpecificationForTesting(engine, {
      archetype: { id: 'minimal', version: 1 },
      operationId: randomUUID(),
      title: 'HTTP shared sibling',
      created: '2026-10-20',
      target: { kind: 'existing', workspaceId },
    });
    git(
      a.workspaceRoot,
      'add',
      '--',
      b.relativeManifestPath,
      'specs/active/' + b.slug + '/overview.md',
    );
    // Create commits the scaffold itself when Git is enabled; commit by hand only what is still staged.
    if (git(a.workspaceRoot, 'diff', '--cached', '--name-only') !== '') {
      git(
        a.workspaceRoot,
        '-c',
        'user.name=SpecFlow Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '-qm',
        'add HTTP sibling',
      );
    }

    const operationId = randomUUID();
    const url = '/api/workspaces/' + workspaceId + '/close';
    const developer = await authedApp(engine, 'developer');
    try {
      const denied = await developer.app.inject({
        method: 'GET',
        url: url + '/preview',
        headers: developer.headers,
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.body).not.toContain(b.specId);
      const refused = await developer.app.inject({
        method: 'POST',
        url,
        headers: developer.headers,
        payload: { operationId },
      });
      expect(refused.statusCode).toBe(403);
      expect(await inspectCloseOperation(engine, operationId)).toBeUndefined();
    } finally {
      await developer.app.close();
    }

    const admin = await authedApp(engine, 'admin');
    try {
      const preview = await admin.app.inject({
        method: 'GET',
        url: url + '/preview',
        headers: admin.headers,
      });
      expect(preview.statusCode, preview.body).toBe(200);
      expect(preview.json()).toMatchObject({
        workspaceId,
        kind: 'workspace-close',
        wholeBranchIntegration: true,
        occupantCount: 2,
      });
      expect(
        preview.json<{ occupants: { specId: string }[] }>().occupants.map((x) => x.specId),
      ).toEqual([a.specId, b.specId].sort());
      const completed = await admin.app.inject({
        method: 'POST',
        url,
        headers: admin.headers,
        payload: { operationId },
      });
      expect(completed.statusCode, completed.body).toBe(200);
      expect(completed.json()).toMatchObject({
        workspaceId,
        kind: 'workspace-close',
        status: 'completed',
        occupantCount: 2,
      });
      expect(completed.body).not.toContain(a.specId);
      expect((await readWorkspaceSpecification(root, a.specId)).status).toBe('draft');
      expect((await readWorkspaceSpecification(root, b.specId)).status).toBe('draft');
      const inspection = await admin.app.inject({
        method: 'GET',
        url: url + '/operations/' + operationId,
        headers: admin.headers,
      });
      expect(inspection.statusCode).toBe(200);
      expect(inspection.json()).toMatchObject({ status: 'completed', occupantCount: 2 });
    } finally {
      await admin.app.close();
    }
  }, 120000);

  it('requires project Git permission before even inspecting a retained conflict scratch', async () => {
    const { root, engine, spec } = await fixture(true);
    const url =
      '/api/specs/' + spec.specId + '/close/operations/' + randomUUID() + '/reconcile-scratch';
    const originalPrimary = git(root, 'rev-parse', 'HEAD');
    const developer = await authedApp(engine, 'developer');
    try {
      const denied = await developer.app.inject({
        method: 'POST',
        url,
        headers: developer.headers,
        payload: { confirmedNoActiveGitProcess: true },
      });
      expect(denied.statusCode).toBe(403);
      expect(git(root, 'rev-parse', 'HEAD')).toBe(originalPrimary);
    } finally {
      await developer.app.close();
    }

    const admin = await authedApp(engine, 'admin');
    try {
      // This is an operator attestation, not an automated process-liveness proof.
      // Requests without an explicit positive acknowledgement cannot retire claims.
      const unconfirmed = await admin.app.inject({
        method: 'POST',
        url,
        headers: admin.headers,
        payload: { confirmedNoActiveGitProcess: false },
      });
      expect(unconfirmed.statusCode).toBe(400);
      const absentAcknowledgement = await admin.app.inject({
        method: 'POST',
        url,
        headers: admin.headers,
        payload: {},
      });
      expect(absentAcknowledgement.statusCode).toBe(400);
      const missing = await admin.app.inject({
        method: 'POST',
        url,
        headers: admin.headers,
        payload: { confirmedNoActiveGitProcess: true },
      });
      expect(missing.statusCode).toBe(404);
    } finally {
      await admin.app.close();
    }
  }, 120000);
});
