import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  addWorkspace,
  bindSpecToWorkspace,
  bootstrapProjectHome,
  createSpecificationFromRequest,
  provisionLinkedWorkspaceIdentity,
  updateWorkspaceRegistry,
} from '@nevo/specflow-engine/testing';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';
import { SpecificationWorkspaceResponseSchema } from '@nevo/specflow-contracts/specs/workspace';
import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';

import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

function trustedLocalConfig() {
  const config = passwordConfig();
  return { ...config, authentication: { ...config.authentication, mode: 'none' as const } };
}

const roots: string[] = [];
// Real Git and an Engine bootstrap: slow on Windows.
const timeoutMs = process.platform === 'win32' ? 120000 : 45000;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, windowsHide: true });
}

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-workspace-')));
  roots.push(root);
  git(root, 'init', '-q');
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: false\n');
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
  return { root, engine: await bootstrapProjectHome(root) };
}

describe('Engine-backed specification workspace read', () => {
  it('stays unavailable (not an invented workspace) when no Engine or repository was configured', async () => {
    const app = await createRuntimeApp(trustedLocalConfig());
    try {
      const response = await app.inject(`/api/specs/${randomUUID()}/workspace`);
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: 'specification_source_unavailable' });
    } finally {
      await app.close();
    }
  });

  it(
    'returns the identity of an existing specification with not-implemented sections, 404 for an unknown one',
    async () => {
      const { root, engine } = await fixture();
      const created = await createSpecificationFromRequest(engine, {
        operationId: randomUUID(),
        title: 'Actual canonical Spec',
        target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
      });
      const app = await createRuntimeApp(trustedLocalConfig(), { specs: { engine } });
      try {
        const response = await app.inject(`/api/specs/${created.specId}/workspace`);
        expect(response.statusCode, response.body).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        const body = response.json<SpecificationWorkspaceResponse>();
        expect(Value.Check(SpecificationWorkspaceResponseSchema, body)).toBe(true);
        expect(body.specification).toEqual({
          id: created.specId,
          title: 'Actual canonical Spec',
          summary: '',
          preparationState: 'empty',
          attention: [],
        });
        const unavailable = { state: 'unavailable', reason: 'not_implemented' };
        expect(body.sections).toEqual({
          tasks: unavailable,
          documents: unavailable,
          sessions: unavailable,
          activity: unavailable,
          repository: unavailable,
          changes: unavailable,
        });
        expect(body.actions).toEqual({
          executeTasks: { available: false, reason: 'not_implemented' },
          startSession: { available: false, reason: 'not_implemented' },
        });

        // The revision follows the canonical manifest and the title follows the file.
        const manifestPath = join(root, created.relativeManifestPath);
        await writeFile(
          manifestPath,
          (await readFile(manifestPath, 'utf8')).replace(
            'title: Actual canonical Spec',
            'title: Renamed canonical Spec',
          ),
        );
        const renamed = (
          await app.inject(`/api/specs/${created.specId}/workspace`)
        ).json<SpecificationWorkspaceResponse>();
        expect(renamed.specification.title).toBe('Renamed canonical Spec');
        expect(renamed.revision).not.toBe(body.revision);

        const unknown = await app.inject(`/api/specs/${randomUUID()}/workspace`);
        expect(unknown.statusCode).toBe(404);
        expect(unknown.json()).toEqual({ error: 'specification_not_found' });
        // A slug-shaped identity is not a canonical specification id.
        expect((await app.inject('/api/specs/admission/workspace')).statusCode).toBe(404);
      } finally {
        await app.close();
      }
    },
    timeoutMs,
  );

  it(
    'authorizes by specification before reading: a viewer of another specification gets 403, never its existence',
    async () => {
      const { engine } = await fixture();
      const visible = await createSpecificationFromRequest(engine, {
        operationId: randomUUID(),
        title: 'Granted canonical Spec',
        target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
      });
      const hidden = await createSpecificationFromRequest(engine, {
        operationId: randomUUID(),
        title: 'Hidden canonical Spec',
        target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
      });
      const config = passwordConfig();
      const store = new InMemoryAuthenticationStore();
      const session = store.createSession({
        userId: 'demo-user',
        authenticatedWith: { kind: 'password' },
      });
      const app = await createRuntimeApp(
        {
          ...config,
          authorization: {
            assignments: [
              { userId: 'demo-user', role: 'viewer', scope: { specId: visible.specId } },
            ],
          },
        },
        { auth: { store }, specs: { engine } },
      );
      const headers = { cookie: authCookieNames(config.server.port).session + '=' + session };
      try {
        expect((await app.inject(`/api/specs/${visible.specId}/workspace`)).statusCode).toBe(401);
        expect(
          (await app.inject({ url: `/api/specs/${visible.specId}/workspace`, headers })).statusCode,
        ).toBe(200);
        const denied = await app.inject({ url: `/api/specs/${hidden.specId}/workspace`, headers });
        expect(denied.statusCode).toBe(403);
        expect(denied.json()).toEqual({ error: 'forbidden' });
      } finally {
        await app.close();
      }
    },
    timeoutMs,
  );

  it(
    'answers 503 (a source failure, not 404) for a bound specification whose manifest is missing',
    async () => {
      const { root, engine } = await fixture();
      const linked = await realpath(await mkdtemp(join(tmpdir(), 'specflow-linked-')));
      roots.push(linked);
      git(root, 'worktree', 'add', '-q', '-b', 'test/workspace-missing', linked, 'HEAD');
      const registration = await provisionLinkedWorkspaceIdentity(
        engine.context,
        linked,
        randomUUID(),
        true,
      );
      const boundSpecId = randomUUID();
      await updateWorkspaceRegistry(engine.context, (registry) =>
        bindSpecToWorkspace(
          addWorkspace(registry, registration),
          boundSpecId,
          registration.workspaceId,
        ),
      );
      const app = await createRuntimeApp(trustedLocalConfig(), { specs: { engine } });
      try {
        const response = await app.inject(`/api/specs/${boundSpecId}/workspace`);
        expect(response.statusCode, response.body).toBe(503);
        expect(response.json()).toEqual({ error: 'specification_source_unavailable' });
      } finally {
        await app.close();
      }
    },
    timeoutMs,
  );
});
