import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bootstrapProjectHome, installDefinitionsForTesting } from '@nevo/specflow-engine/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { SpecCapabilities } from '../../src/features/specs';
import { firstStepIntentDirectory } from '../../src/features/specs/create/first-step';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';
import { ARCHETYPE_REQUEST } from '../support/archetype';

// A developer who may create Specifications but not manage them: no built-in role is like that,
// so this file narrows the developer's capabilities.
vi.mock('../../src/server/roles', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/server/roles')>();

  return {
    specFlowRoleCapabilities: () => {
      const roles = original.specFlowRoleCapabilities();

      return {
        ...roles,
        developer: roles.developer.filter(
          (capability) => capability !== SpecCapabilities.capabilities.Manage,
        ),
      };
    },
  };
});

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Create with a first-step intent needs Manage', () => {
  it('answers 403 before anything is written', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-first-step-authz-')));
    roots.push(root);
    execFileSync('git', ['init', '-q'], { cwd: root });
    await mkdir(join(root, '.nevo'));
    await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: false\n');
    const engine = await bootstrapProjectHome(root);
    await installDefinitionsForTesting(engine);
    const store = new InMemoryAuthenticationStore();
    const session = store.createSession({
      userId: 'demo-user',
      authenticatedWith: { kind: 'password' },
    });
    const start = vi.fn();
    const app = await createRuntimeApp(
      {
        ...passwordConfig(),
        authorization: { assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }] },
      },
      {
        auth: { store },
        specs: { engine, firstStepStarter: { start, refusal: () => undefined } },
      },
    );
    try {
      await app.ready();
      const operationId = randomUUID();
      const response = await app.inject({
        method: 'POST',
        url: '/api/specs',
        headers: {
          cookie: authCookieNames(passwordConfig().server.port).session + '=' + session,
        },
        payload: {
          ...ARCHETYPE_REQUEST,
          operationId,
          title: 'Not allowed to manage',
          firstStep: { run: 'agent', provider: 'claude' },
        },
      });
      expect(response.statusCode).toBe(403);
      expect(await readdir(firstStepIntentDirectory(engine)).catch(() => [])).toEqual([]);
      expect(start).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  }, 240000);
});
