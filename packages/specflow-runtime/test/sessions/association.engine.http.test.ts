import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bootstrapProjectHome,
  createSpecificationFromRequestForTesting as createSpecificationFromRequest,
  installDefinitionsForTesting,
} from '@nevo/specflow-engine/testing';
import type { FastifyInstance } from 'fastify';
import type { CreateContextSessionResult } from '@nevo/specflow-contracts/sessions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

// Real Git and an Engine bootstrap: slow on Windows.
const timeoutMs = process.platform === 'win32' ? 120000 : 45000;

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, windowsHide: true });
}

let root = '',
  app: FastifyInstance,
  specId = '';

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-association-engine-')));
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
  const engine = await bootstrapProjectHome(root);
  await installDefinitionsForTesting(engine);
  specId = (
    await createSpecificationFromRequest(engine, {
      archetype: { id: 'minimal', version: 1 },
      operationId: randomUUID(),
      title: 'Associated canonical Spec',
      target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
    })
  ).specId;
  const config = passwordConfig();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: { ...config.authentication, mode: 'none' },
      sessions: { enabled: true, providers: { mock: { enabled: true } } },
    },
    { specs: { engine } },
  );
}, timeoutMs);

afterAll(async () => {
  await app?.close();
  if (root) {
    await rm(root, { recursive: true, force: true });
  }
});

const create = (target: string, payload: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: `/api/specs/${target}/sessions`,
    payload: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only', ...payload },
  });

describe('Session association over the Engine (project mode)', () => {
  it(
    'verifies the Specification through the Engine before the write',
    async () => {
      const created = await create(specId);
      expect(created.statusCode).toBe(201);
      expect(created.json<CreateContextSessionResult>().association).toEqual({
        specId,
        taskIds: [],
      });

      expect((await create(randomUUID())).json()).toEqual({ error: 'specification_not_found' });
      // Project mode has no Engine Task source yet: a Task cannot be verified.
      expect((await create(specId, { taskIds: ['TASK-01'] })).statusCode).toBe(503);
    },
    timeoutMs,
  );
});
