import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CREATE_JOURNAL_RELATIVE_DIR,
  bootstrapProjectHome,
  createSpecificationFromRequestForTesting as createSpecificationFromRequest,
} from '@nevo/specflow-engine/testing';
import type { OperationListResponse } from '@nevo/specflow-contracts/operations';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { createOperationProgressRegistry } from '../../src/features/operations';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const roots: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })),
  );
});

async function fixture(clock: { now: Date }) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-inspect-agrees-')));
  roots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: false\n');
  execFileSync('git', ['add', '.gitignore', '.nevo/config.yaml'], { cwd: root });
  execFileSync(
    'git',
    ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'initial'],
    { cwd: root },
  );
  const engine = await bootstrapProjectHome(root);
  const created = await createSpecificationFromRequest(engine, {
    archetype: { id: 'minimal', version: 1 },
    operationId: randomUUID(),
    title: 'Real create',
    target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
  });
  const dir = join(engine.context.project.stateRoot, CREATE_JOURNAL_RELATIVE_DIR);
  const template = JSON.parse(
    await readFile(join(dir, created.operationId + '.json'), 'utf8'),
  ) as Record<string, unknown>;

  /** A non terminal journal, last written `ageMs` before the injected clock. */
  async function stuckJournal(stage: string, ageMs: number): Promise<string> {
    const operationId = randomUUID();
    const path = join(dir, operationId + '.json');
    await writeFile(
      path,
      JSON.stringify({ ...template, operationId, specId: randomUUID(), stage }),
    );
    const at = new Date(clock.now.getTime() - ageMs);
    await utimes(path, at, at);

    return operationId;
  }

  const registry = createOperationProgressRegistry({
    graceMs: 5,
    now: () => clock.now,
  });
  const store = new InMemoryAuthenticationStore();
  const session = store.createSession({
    userId: 'demo-user',
    authenticatedWith: { kind: 'password' },
  });
  const headers = { cookie: authCookieNames(passwordConfig().server.port).session + '=' + session };
  const app = await createRuntimeApp(
    {
      ...passwordConfig(),
      authorization: { assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }] },
    },
    {
      auth: { store },
      specs: { engine },
      operations: { registry, now: () => clock.now },
    },
  );
  apps.push(app);
  await app.ready();
  const inspect = async (operationId: string) =>
    (
      await app.inject({
        method: 'GET',
        url: `/api/specs/create/operations/${operationId}`,
        headers,
      })
    ).json<Record<string, unknown>>();
  const list = async () =>
    (
      await app.inject({ method: 'GET', url: '/api/specs/operations', headers })
    ).json<OperationListResponse>();

  return { registry, stuckJournal, inspect, list };
}

describe('GET /api/specs/create/operations/:id agrees with the operations list', () => {
  it('keeps reporting a failed Create after the registry replay window', async () => {
    const clock = { now: new Date() };
    const { registry, stuckJournal, inspect, list } = await fixture(clock);
    const operationId = await stuckJournal('manifest-writing', 0);
    registry
      .begin({ operationId, kind: 'specification-create', steps: ['reserving'] })
      .fail('COMMIT_FAILED');

    expect(await inspect(operationId)).toMatchObject({ status: 'failed', code: 'COMMIT_FAILED' });
    // The replay window (graceMs) is over; the listing retention (60 min) is not.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(registry.peek(operationId, 'specification-create')).toBeUndefined();
    clock.now = new Date(clock.now.getTime() + 2 * 60_000);

    const inspected = await inspect(operationId);
    const row = (await list()).items.find((item) => item.operationId === operationId);
    expect(inspected).toEqual({
      operationId,
      kind: 'specification-create',
      status: 'failed',
      code: 'COMMIT_FAILED',
    });
    expect(row).toMatchObject({ status: 'failed', code: 'COMMIT_FAILED' });
  });

  it('reports an idle journal without a live writer as recovery-required, like the list', async () => {
    const clock = { now: new Date() };
    const { stuckJournal, inspect, list } = await fixture(clock);
    const idle = await stuckJournal('registry-writing', 10 * 60_000);
    const fresh = await stuckJournal('manifest-writing', 1_000);

    expect(await inspect(idle)).toEqual({
      operationId: idle,
      kind: 'specification-create',
      status: 'recovery-required',
      code: 'OPERATION_INTERRUPTED',
    });
    expect(await inspect(fresh)).toEqual({
      operationId: fresh,
      kind: 'specification-create',
      status: 'in-progress',
    });
    const items = (await list()).items;
    expect(items.find((item) => item.operationId === idle)).toMatchObject({
      status: 'recovery-required',
      code: 'OPERATION_INTERRUPTED',
    });
    expect(items.find((item) => item.operationId === fresh)).toMatchObject({
      status: 'in-progress',
    });
  });
});
