import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bootstrapProjectHome } from '@nevo/specflow-engine/testing';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const roots: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd });
}

async function server(gitEnabled: boolean) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-create-progress-Ż ')));
  roots.push(root);
  git(root, 'init', '-q');
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    gitEnabled
      ? 'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: develop\n'
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
  const engine = await bootstrapProjectHome(root);

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
    { auth: { store }, specs: { engine } },
  );
  apps.push(app);
  await app.listen({ port: 0, host: '127.0.0.1' });
  return {
    root,
    headers,
    url: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`,
  };
}

interface Seen {
  event: string;
  data: Record<string, unknown>;
}

/** Connects first and resolves `events` when the server closes the stream after its terminal event. */
async function subscribe(url: string, headers: Record<string, string>, operationId: string) {
  const response = await fetch(
    `${url}/api/operations/${operationId}/events?kind=specification-create`,
    { headers },
  );
  expect(response.status).toBe(200);
  const events = (async () => {
    const seen: Seen[] = [];
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      buffer += next.value;
      let split: number;
      while ((split = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const event = /^event: (.+)$/m.exec(raw)?.[1];
        const data = /^data: (.+)$/m.exec(raw)?.[1];
        if (event && data) seen.push({ event, data: JSON.parse(data) as Record<string, unknown> });
      }
    }
    return seen;
  })();
  return { events };
}

const trail = (events: Seen[]): string[] =>
  events
    .filter((item) => item.event === 'step')
    .map((item) => `${String(item.data.step)}:${String(item.data.status)}`);

async function post(url: string, headers: Record<string, string>, body: unknown) {
  return fetch(`${url}/api/specs`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Create progress over the generic operations stream (real Git)', () => {
  it('streams named steps of a new worktree create to a subscriber that connected first', async () => {
    const { root, url, headers } = await server(true);
    const operationId = randomUUID();
    const watching = await subscribe(url, headers, operationId);

    const response = await post(url, headers, {
      operationId,
      title: 'Live progress',
      target: { kind: 'new-worktree', baseRef: 'HEAD' },
    });
    expect(response.status).toBe(201);
    const created = (await response.json()) as Record<string, unknown>;

    const events = await watching.events;
    expect(events[0]?.event).toBe('snapshot');
    expect(events[0]?.data.steps).toEqual([
      { id: 'reserving', status: 'running' },
      { id: 'preparing-workspace', status: 'pending' },
      { id: 'writing-specification', status: 'pending' },
      { id: 'registering', status: 'pending' },
    ]);
    // The snapshot already shows `reserving` running; the rest streams live.
    expect(trail(events)).toEqual([
      'reserving:done',
      'preparing-workspace:running',
      'preparing-workspace:done',
      'writing-specification:running',
      'writing-specification:done',
      'registering:running',
      'registering:done',
    ]);
    expect(events.at(-1)?.event).toBe('completed');
    expect(events.at(-1)?.data.result).toEqual(created);

    const wire = JSON.stringify(events);
    expect(wire).not.toContain(root);
    expect(wire).not.toMatch(/git-initiated|manifest-writing|registry-linked|journal/);
  }, 240000);

  it('omits the workspace step for an existing target and replays to a late subscriber', async () => {
    const { url, headers } = await server(false);
    const operationId = randomUUID();
    const response = await post(url, headers, { operationId, title: 'Existing progress' });
    expect(response.status).toBe(201);

    const late = await subscribe(url, headers, operationId);
    const events = await late.events;
    expect(events.map((item) => item.event)).toEqual(['snapshot', 'completed']);
    expect(events[0]?.data).toMatchObject({
      status: 'completed',
      steps: [
        { id: 'reserving', status: 'done' },
        { id: 'writing-specification', status: 'done' },
        { id: 'registering', status: 'done' },
      ],
    });
  }, 240000);

  it('publishes a code-only failure when the create is rejected', async () => {
    const { url, headers } = await server(false);
    const operationId = randomUUID();
    const watching = await subscribe(url, headers, operationId);
    const response = await post(url, headers, {
      operationId,
      title: 'Rejected',
      target: { kind: 'existing', workspaceId: randomUUID() },
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    const events = await watching.events;
    const last = events.at(-1);
    expect(last?.event).toBe('failed');
    expect(Object.keys(last?.data ?? {}).sort()).toEqual([
      'at',
      'code',
      'kind',
      'operationId',
      'type',
    ]);
  }, 240000);
});
