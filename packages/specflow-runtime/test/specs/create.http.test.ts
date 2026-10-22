import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  ProjectControlLockError,
  bootstrapProjectHome,
  createSpecificationForTesting,
  discoverSpecifications,
  workspaceRegistryPath,
} from '@nevo/specflow-engine/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const roots: string[] = [];
const createTestTimeoutMs = process.platform === 'win32' ? 420000 : 30000;
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd });
}

async function fixture(gitEnabled = false, extraGitConfig = '') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-http-create-Ż ')));
  roots.push(root);
  git(root, 'init', '-q');
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    gitEnabled
      ? 'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: develop\n' + extraGitConfig
      : 'runtime: {}\ngit:\n  enabled: false\n',
  );
  git(root, 'add', '.gitignore', '.nevo/config.yaml');
  git(
    root,
    '-c',
    'user.name=SpecFlow Test',
    '-c',
    'user.email=specflow@example.invalid',
    'commit',
    '-qm',
    'initial',
  );
  if (gitEnabled) git(root, 'branch', '-m', 'develop');
  return { root, engine: await bootstrapProjectHome(root) };
}

function authenticatedStore() {
  const store = new InMemoryAuthenticationStore();
  const session = store.createSession({
    userId: 'demo-user',
    authenticatedWith: { kind: 'password' },
  });
  const cookie = authCookieNames(passwordConfig().server.port).session;
  return { store, headers: { cookie: cookie + '=' + session } };
}

describe('E2.T05 — authorized HTTP Spec create adapter', () => {
  it('H02: denies anonymous and viewer before any journal/registry/manifest write', async () => {
    const { engine } = await fixture();
    const auth = authenticatedStore();
    const config = passwordConfig();
    const app = await createRuntimeApp(
      {
        ...config,
        authorization: { assignments: [{ userId: 'demo-user', role: 'viewer', scope: {} }] },
      },
      { auth: { store: auth.store }, specs: { engine } },
    );
    const path = workspaceRegistryPath(engine.context);
    const registryBefore = await readFile(path, 'utf8');
    try {
      const anonymous = await app.inject({
        method: 'POST',
        url: '/api/specs',
        payload: { title: 'Unauthorized' },
      });
      expect(anonymous.statusCode).toBe(401);
      const denied = await app.inject({
        method: 'POST',
        url: '/api/specs',
        headers: auth.headers,
        payload: { title: 'Unauthorized' },
      });
      expect(denied.statusCode).toBe(403);
      expect(await readFile(path, 'utf8')).toBe(registryBefore);
      expect(await discoverSpecifications(engine)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('does not accept a spec-scoped developer grant as project-level creation rights', async () => {
    const { engine } = await fixture();
    const auth = authenticatedStore();
    const app = await createRuntimeApp(
      {
        ...passwordConfig(),
        authorization: {
          assignments: [
            { userId: 'demo-user', role: 'developer', scope: { specId: randomUUID() } },
          ],
        },
      },
      { auth: { store: auth.store }, specs: { engine } },
    );
    try {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/specs',
            headers: auth.headers,
            payload: { title: 'Scoped developer cannot create project Spec' },
          })
        ).statusCode,
      ).toBe(403);
      expect(await discoverSpecifications(engine)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it(
    'H06: creates via real Engine then retries without duplicate registry update',
    async () => {
      const { root, engine } = await fixture();
      const auth = authenticatedStore();
      const app = await createRuntimeApp(
        {
          ...passwordConfig(),
          authorization: { assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }] },
        },
        { auth: { store: auth.store }, specs: { engine } },
      );
      try {
        const operationId = randomUUID();
        const payload = { title: 'HTTP canonical Spec', operationId };
        const first = await app.inject({
          method: 'POST',
          url: '/api/specs',
          headers: auth.headers,
          payload,
        });
        expect(first.statusCode, first.body).toBe(201);
        expect(first.headers['cache-control']).toBe('no-store');
        const created = first.json<{
          specId: string;
          slug: string;
          workspaceId: string;
          relativeManifestPath: string;
        }>();
        expect(created.workspaceId).toBe(engine.workspace.workspaceId);
        expect(first.json()).toEqual({
          operationId,
          specId: created.specId,
          kind: 'specification-create',
          status: 'completed',
          slug: created.slug,
          workspaceId: engine.workspace.workspaceId,
          relativeManifestPath: created.relativeManifestPath,
        });
        expect(await readFile(join(root, created.relativeManifestPath), 'utf8')).toContain(
          created.specId,
        );
        const registryBefore = await readFile(workspaceRegistryPath(engine.context), 'utf8');
        const second = await app.inject({
          method: 'POST',
          url: '/api/specs',
          headers: auth.headers,
          payload,
        });
        expect(second.statusCode, second.body).toBe(201);
        expect(second.json()).toEqual(first.json());
        expect(await readFile(workspaceRegistryPath(engine.context), 'utf8')).toBe(registryBefore);
        expect((await discoverSpecifications(engine)).map((item) => item.specId)).toEqual([
          created.specId,
        ]);
      } finally {
        await app.close();
      }
    },
    createTestTimeoutMs,
  );

  it('E2.I02: persists an explicit linked-workspace integration target through HTTP Create', async () => {
    const { root, engine } = await fixture(true);
    const feature = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'HTTP integration source',
      created: '2026-10-20',
      target: { kind: 'new-worktree', branch: 'feature/x', baseRef: 'HEAD' },
    });
    roots.push(dirname(feature.workspaceRoot));
    const auth = authenticatedStore();
    const app = await createRuntimeApp(
      {
        ...passwordConfig(),
        authorization: { assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }] },
      },
      { auth: { store: auth.store }, specs: { engine } },
    );
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/specs',
        headers: auth.headers,
        payload: {
          title: 'HTTP nested worktree',
          operationId: randomUUID(),
          target: {
            kind: 'new-worktree',
            baseRef: 'refs/heads/feature/x',
            integrationTargetWorkspaceId: feature.workspaceId,
          },
        },
      });
      expect(response.statusCode, response.body).toBe(201);
      const result = response.json<{ workspaceId: string }>();
      const registered = (await engine.readRegistry()).workspaces.find(
        (item) => item.workspaceId === result.workspaceId,
      );
      expect(registered?.kind).toBe('linked');
      if (registered?.kind !== 'linked') throw new Error('HTTP linked checkout not registered.');
      expect(registered.integrationDestination).toMatchObject({
        workspaceId: feature.workspaceId,
        branch: 'feature/x',
      });
      expect(response.body).not.toContain(root);
    } finally {
      await app.close();
    }
  }, 420000);

  it(
    'creates with an explicit slug, replays idempotently and answers 409 for a taken or changed slug',
    async () => {
      const { root, engine } = await fixture();
      const app = await createRuntimeApp(
        {
          ...passwordConfig(),
          authentication: { ...passwordConfig().authentication, mode: 'none' },
        },
        { specs: { engine } },
      );
      try {
        const operationId = randomUUID();
        const payload = { title: 'Some long title', slug: 'my-slug', operationId };
        const first = await app.inject({ method: 'POST', url: '/api/specs', payload });
        expect(first.statusCode, first.body).toBe(201);
        expect(first.json<{ slug: string }>().slug).toBe('my-slug');
        expect(first.json<{ relativeManifestPath: string }>().relativeManifestPath).toBe(
          'specs/active/my-slug/specification.yaml',
        );
        expect(
          await readFile(join(root, 'specs/active/my-slug/specification.yaml'), 'utf8'),
        ).toContain('title: Some long title');
        const replay = await app.inject({ method: 'POST', url: '/api/specs', payload });
        expect(replay.statusCode, replay.body).toBe(201);
        expect(replay.json()).toEqual(first.json());
        const changed = await app.inject({
          method: 'POST',
          url: '/api/specs',
          payload: { ...payload, slug: 'other-slug' },
        });
        expect(changed.statusCode, changed.body).toBe(409);
        expect(changed.json()).toEqual({ error: 'CREATE_CONFLICT', code: 'CREATE_CONFLICT' });
        const taken = await app.inject({
          method: 'POST',
          url: '/api/specs',
          payload: { title: 'Another', slug: 'my-slug', operationId: randomUUID() },
        });
        expect(taken.statusCode, taken.body).toBe(409);
        expect(taken.json()).toEqual({ error: 'CREATE_CONFLICT', code: 'CREATE_CONFLICT' });
        for (const slug of ['', 'Upper', 'a--b', '../x', 'con']) {
          const bad = await app.inject({
            method: 'POST',
            url: '/api/specs',
            payload: { title: 'Bad', slug, operationId: randomUUID() },
          });
          expect(bad.statusCode, slug).toBe(400);
        }
      } finally {
        await app.close();
      }
    },
    createTestTimeoutMs,
  );

  it('rejects unexpected request keys and invalid title without persistence', async () => {
    const { engine } = await fixture();
    const app = await createRuntimeApp(
      { ...passwordConfig(), authentication: { ...passwordConfig().authentication, mode: 'none' } },
      { specs: { engine } },
    );
    try {
      const before = await readFile(workspaceRegistryPath(engine.context), 'utf8');
      for (const payload of [{ title: '' }, { title: 'Valid', workspaceRoot: '/tmp/foreign' }]) {
        const response = await app.inject({ method: 'POST', url: '/api/specs', payload });
        expect(response.statusCode, response.body).toBe(400);
      }
      expect(await readFile(workspaceRegistryPath(engine.context), 'utf8')).toBe(before);
    } finally {
      await app.close();
    }
  });

  it('returns a typed 503 for a busy Project Home lock during default target selection', async () => {
    const { engine } = await fixture();
    const failingEngine = {
      ...engine,
      readRegistry: () =>
        Promise.reject(
          new ProjectControlLockError('CONTROL_LOCK_BUSY', 'Another writer owns the lock.'),
        ),
    };
    const app = await createRuntimeApp(
      {
        ...passwordConfig(),
        authentication: { ...passwordConfig().authentication, mode: 'none' },
      },
      { specs: { engine: failingEngine } },
    );
    const registryBefore = await readFile(workspaceRegistryPath(engine.context), 'utf8');
    try {
      const result = await app.inject({
        method: 'POST',
        url: '/api/specs',
        payload: { title: 'Must not persist while Engine is unavailable' },
      });
      expect(result.statusCode, result.body).toBe(503);
      expect(result.json()).toMatchObject({ code: 'CONTROL_LOCK_BUSY' });
      expect(await readFile(workspaceRegistryPath(engine.context), 'utf8')).toBe(registryBefore);
      expect(await discoverSpecifications(engine)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('keeps unconfigured/demo Runtime create unavailable instead of mutating the project', async () => {
    const app = await createRuntimeApp({
      ...passwordConfig(),
      authentication: { ...passwordConfig().authentication, mode: 'none' },
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/specs',
        payload: { title: 'Should never be created' },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: 'ENGINE_UNAVAILABLE' });
    } finally {
      await app.close();
    }
  });
});

describe('E2.I01 — authorized read-only Create options', () => {
  it('denies anonymous, viewer and spec-scoped grants before enumerating refs', async () => {
    const { engine } = await fixture();
    const auth = authenticatedStore();
    const app = await createRuntimeApp(
      {
        ...passwordConfig(),
        authorization: {
          assignments: [{ userId: 'demo-user', role: 'viewer', scope: {} }],
        },
      },
      { auth: { store: auth.store }, specs: { engine } },
    );
    try {
      const anonymous = await app.inject({ method: 'GET', url: '/api/specs/create-options' });
      expect(anonymous.statusCode).toBe(401);
      const denied = await app.inject({
        method: 'GET',
        url: '/api/specs/create-options',
        headers: auth.headers,
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.body).not.toContain('workspaceId');
    } finally {
      await app.close();
    }
  });

  it('refuses a spec-scoped developer grant without revealing create choices', async () => {
    const { root, engine } = await fixture();
    const auth = authenticatedStore();
    const app = await createRuntimeApp(
      {
        ...passwordConfig(),
        authorization: {
          assignments: [
            { userId: 'demo-user', role: 'developer', scope: { specId: randomUUID() } },
          ],
        },
      },
      { auth: { store: auth.store }, specs: { engine } },
    );
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/specs/create-options',
        headers: auth.headers,
      });
      expect(response.statusCode).toBe(403);
      expect(response.body).not.toContain('workspaceId');
      expect(response.body).not.toContain('baseRefs');
      expect(response.body).not.toContain('refs/heads/');
      expect(response.body).not.toContain(root);
    } finally {
      await app.close();
    }
  });

  it(
    'returns schema-validated policy without Git facts or mutation when Git is disabled',
    async () => {
      const { root, engine } = await fixture();
      const auth = authenticatedStore();
      const app = await createRuntimeApp(
        {
          ...passwordConfig(),
          authorization: {
            assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }],
          },
        },
        { auth: { store: auth.store }, specs: { engine } },
      );
      const registryBefore = await readFile(workspaceRegistryPath(engine.context), 'utf8');
      try {
        const response = await app.inject({
          method: 'GET',
          url: '/api/specs/create-options',
          headers: auth.headers,
        });
        expect(response.statusCode, response.body).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        const result = response.json<{
          primaryWorkspaceId: string;
          workspaces: { workspaceId: string; specCount: number; state: string }[];
          newWorktree: { status: string; reason?: string };
          defaultBaseRef: string;
          baseRefs: { ref: string; checkedOutWorkspaceId?: string }[];
        }>();
        expect(result.primaryWorkspaceId).toBe(engine.workspace.workspaceId);
        expect(result.workspaces).toEqual([
          expect.objectContaining({
            workspaceId: engine.workspace.workspaceId,
            specCount: 0,
            state: 'available',
          }),
        ]);
        expect(result.newWorktree).toEqual({ status: 'disabled', reason: 'git-disabled' });
        expect(result.defaultBaseRef).toBe('HEAD');
        // Git disabled: answered from registry and filesystem only; no Git facts (refs, branches).
        expect(result.baseRefs).toEqual([]);
        // Options expose registered display paths (workspace path, worktreesRoot) by contract,
        // but no Git facts: no commits policy, no branches or refs.
        expect(response.json<Record<string, unknown>>()).not.toHaveProperty('commits');
        expect(response.body).not.toContain('refs/heads/');
        expect(await readFile(workspaceRegistryPath(engine.context), 'utf8')).toBe(registryBefore);
      } finally {
        await app.close();
      }
    },
    createTestTimeoutMs,
  );

  it(
    'commit policy: git-off options carry no commits, protected branches answer typed refusals',
    async () => {
      const auth = authenticatedStore();
      const authorization = {
        assignments: [{ userId: 'demo-user', role: 'developer' as const, scope: {} }],
      };
      const off = await fixture();
      const offApp = await createRuntimeApp(
        { ...passwordConfig(), authorization },
        { auth: { store: auth.store }, specs: { engine: off.engine } },
      );
      try {
        const body = (
          await offApp.inject({
            method: 'GET',
            url: '/api/specs/create-options',
            headers: auth.headers,
          })
        ).json<Record<string, unknown>>();
        expect('commits' in body).toBe(false);
      } finally {
        await offApp.close();
      }

      const { root, engine } = await fixture(
        true,
        '  commits:\n    protectedBranches: [develop]\n',
      );
      const app = await createRuntimeApp(
        { ...passwordConfig(), authorization },
        { auth: { store: auth.store }, specs: { engine } },
      );
      try {
        const options = (
          await app.inject({
            method: 'GET',
            url: '/api/specs/create-options',
            headers: auth.headers,
          })
        ).json<{
          commits: { protectedBranches: string[] };
          workspaces: { selectable: boolean; reason?: string; branch?: string }[];
        }>();
        expect(options.commits).toEqual({ protectedBranches: ['develop'] });
        expect(options.workspaces[0]).toMatchObject({
          selectable: false,
          reason: 'branch-protected',
          branch: 'develop',
        });

        const refused = await app.inject({
          method: 'POST',
          url: '/api/specs',
          headers: auth.headers,
          payload: { title: 'Protected refusal', operationId: randomUUID() },
        });
        expect(refused.statusCode, refused.body).toBe(422);
        expect(refused.json()).toEqual({ error: 'BRANCH_PROTECTED', code: 'BRANCH_PROTECTED' });
        expect(refused.body).not.toContain(root);
        expect(existsSync(join(root, 'specs'))).toBe(false);

        git(root, 'checkout', '-q', '--detach');
        const blocked = await app.inject({
          method: 'POST',
          url: '/api/specs',
          headers: auth.headers,
          payload: { title: 'Detached refusal', operationId: randomUUID() },
        });
        expect(blocked.statusCode, blocked.body).toBe(409);
        expect(blocked.json()).toEqual({ error: 'COMMIT_BLOCKED', code: 'COMMIT_BLOCKED' });
      } finally {
        await app.close();
      }
    },
    createTestTimeoutMs,
  );

  it('returns typed 503 when the Engine is not composed', async () => {
    const app = await createRuntimeApp({
      ...passwordConfig(),
      authentication: { ...passwordConfig().authentication, mode: 'none' },
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/api/specs/create-options' });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: 'ENGINE_UNAVAILABLE' });
    } finally {
      await app.close();
    }
  });
});

describe('E2.I04 — authorized read-only Create operation inspection', () => {
  it('denies anonymous, viewer and spec-scoped developer grants before journal lookup', async () => {
    const { engine } = await fixture();
    const auth = authenticatedStore();
    const operationId = randomUUID();
    const config = passwordConfig();
    const app = await createRuntimeApp(
      {
        ...config,
        authorization: { assignments: [{ userId: 'demo-user', role: 'viewer', scope: {} }] },
      },
      { auth: { store: auth.store }, specs: { engine } },
    );
    const url = '/api/specs/create/operations/' + operationId;
    try {
      const anonymous = await app.inject({ method: 'GET', url });
      expect(anonymous.statusCode).toBe(401);
      const viewer = await app.inject({ method: 'GET', url, headers: auth.headers });
      expect(viewer.statusCode).toBe(403);
      expect(viewer.body).not.toContain(operationId);
    } finally {
      await app.close();
    }

    const scoped = await createRuntimeApp(
      {
        ...config,
        authorization: {
          assignments: [
            { userId: 'demo-user', role: 'developer', scope: { specId: randomUUID() } },
          ],
        },
      },
      { auth: { store: auth.store }, specs: { engine } },
    );
    try {
      const refused = await scoped.inject({ method: 'GET', url, headers: auth.headers });
      expect(refused.statusCode).toBe(403);
      expect(refused.body).not.toContain(operationId);
    } finally {
      await scoped.close();
    }
  });

  it(
    'returns completed CreatedSpec, stable 404 and no mutation or workstation paths',
    async () => {
      const { root, engine } = await fixture();
      const auth = authenticatedStore();
      const app = await createRuntimeApp(
        {
          ...passwordConfig(),
          authorization: { assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }] },
        },
        { auth: { store: auth.store }, specs: { engine } },
      );
      try {
        const operationId = randomUUID();
        const created = await app.inject({
          method: 'POST',
          url: '/api/specs',
          headers: auth.headers,
          payload: { title: 'Inspect completed Create', operationId },
        });
        expect(created.statusCode, created.body).toBe(201);
        const registryBefore = await readFile(workspaceRegistryPath(engine.context), 'utf8');
        const journalPath = join(
          engine.context.project.stateRoot,
          'engine/operations/create',
          operationId + '.json',
        );
        const journalBefore = await readFile(journalPath, 'utf8');
        const result = await app.inject({
          method: 'GET',
          url: '/api/specs/create/operations/' + operationId,
          headers: auth.headers,
        });
        expect(result.statusCode, result.body).toBe(200);
        expect(result.headers['cache-control']).toBe('no-store');
        expect(result.json()).toEqual(created.json());
        expect(result.body).not.toContain(root);
        expect(result.body).not.toContain('workspaceRoot');
        expect(result.body).not.toContain('inputFingerprint');
        expect(await readFile(journalPath, 'utf8')).toBe(journalBefore);
        expect(await readFile(workspaceRegistryPath(engine.context), 'utf8')).toBe(registryBefore);

        const missing = await app.inject({
          method: 'GET',
          url: '/api/specs/create/operations/' + randomUUID(),
          headers: auth.headers,
        });
        expect(missing.statusCode).toBe(404);
        expect(missing.json()).toEqual({
          code: 'CREATE_NOT_FOUND',
          error: 'CREATE_NOT_FOUND',
        });
        const invalid = await app.inject({
          method: 'GET',
          url: '/api/specs/create/operations/not-an-operation-id',
          headers: auth.headers,
        });
        expect(invalid.statusCode).toBe(400);
      } finally {
        await app.close();
      }
    },
    createTestTimeoutMs,
  );

  it(
    'reports durable in-progress/recovery-required without implying writer liveness',
    async () => {
      const { engine } = await fixture();
      const app = await createRuntimeApp(
        {
          ...passwordConfig(),
          authentication: { ...passwordConfig().authentication, mode: 'none' },
        },
        { specs: { engine } },
      );
      const operationId = randomUUID();
      try {
        const created = await app.inject({
          method: 'POST',
          url: '/api/specs',
          payload: { title: 'Read only checkpoint', operationId },
        });
        expect(created.statusCode, created.body).toBe(201);
        const path = join(
          engine.context.project.stateRoot,
          'engine/operations/create',
          operationId + '.json',
        );
        const complete = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
        const registryBefore = await readFile(workspaceRegistryPath(engine.context), 'utf8');
        for (const [stage, status] of [
          ['registry-writing', 'in-progress'],
          ['recovery-required', 'recovery-required'],
        ]) {
          await writeFile(path, JSON.stringify({ ...complete, stage }));
          const before = await readFile(path, 'utf8');
          const response = await app.inject({
            method: 'GET',
            url: '/api/specs/create/operations/' + operationId,
          });
          expect(response.statusCode, response.body).toBe(200);
          expect(response.json()).toEqual({ operationId, kind: 'specification-create', status });
          expect(response.body).not.toContain('specId');
          expect(response.body).not.toContain('workspaceId');
          expect(await readFile(path, 'utf8')).toBe(before);
        }
        expect(await readFile(workspaceRegistryPath(engine.context), 'utf8')).toBe(registryBefore);
      } finally {
        await app.close();
      }
    },
    createTestTimeoutMs,
  );

  it(
    'enforces Engine-aligned 200-character title and normalized Engine unavailable errors',
    async () => {
      const { engine } = await fixture();
      const app = await createRuntimeApp(
        {
          ...passwordConfig(),
          authentication: { ...passwordConfig().authentication, mode: 'none' },
        },
        { specs: { engine } },
      );
      try {
        const rejected = await app.inject({
          method: 'POST',
          url: '/api/specs',
          payload: { title: 'x'.repeat(201), operationId: randomUUID() },
        });
        expect(rejected.statusCode, rejected.body).toBe(400);
        const accepted = await app.inject({
          method: 'POST',
          url: '/api/specs',
          payload: { title: 'x'.repeat(200), operationId: randomUUID() },
        });
        expect(accepted.statusCode, accepted.body).toBe(201);
      } finally {
        await app.close();
      }

      const unavailable = await createRuntimeApp({
        ...passwordConfig(),
        authentication: { ...passwordConfig().authentication, mode: 'none' },
      });
      try {
        for (const { method, url, payload } of [
          { method: 'GET' as const, url: '/api/specs/create-options' },
          { method: 'GET' as const, url: '/api/specs/create/operations/' + randomUUID() },
          { method: 'POST' as const, url: '/api/specs', payload: { title: 'Unavailable' } },
        ]) {
          const response = await unavailable.inject({
            method,
            url,
            ...(payload ? { payload } : {}),
          });
          expect(response.statusCode, response.body).toBe(503);
          expect(response.json()).toEqual({
            code: 'ENGINE_UNAVAILABLE',
            error: 'ENGINE_UNAVAILABLE',
          });
        }
      } finally {
        await unavailable.close();
      }
    },
    createTestTimeoutMs,
  );
});
