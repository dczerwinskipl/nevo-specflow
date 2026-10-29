import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bootstrapProjectHome, installDefinitionsForTesting } from '@nevo/specflow-engine/testing';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';
import { ARCHETYPE_REQUEST } from '../support/archetype';

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
  if (gitEnabled) {
    git(root, 'branch', '-m', 'develop');
  }

  const engine = await bootstrapProjectHome(root);
  await installDefinitionsForTesting(engine);

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
async function subscribe(
  url: string,
  headers: Record<string, string>,
  operationId: string,
  onEvent?: (event: Seen) => void,
) {
  const response = await fetch(`${url}/api/specs/create/operations/${operationId}/events`, {
    headers,
  });
  expect(response.status).toBe(200);
  const events = (async () => {
    const seen: Seen[] = [];
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const next = await reader.read();
      if (next.done) {
        break;
      }

      buffer += next.value;
      let split: number;
      while ((split = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const event = /^event: (.+)$/m.exec(raw)?.[1];
        const data = /^data: (.+)$/m.exec(raw)?.[1];
        if (event && data) {
          const item = { event, data: JSON.parse(data) as Record<string, unknown> };
          seen.push(item);
          onEvent?.(item);
        }
      }
    }

    return seen;
  })();

  return { events };
}

/** The Create journal of an operation (located by file name: its directory is an Engine detail). */
async function readJournal(root: string, operationId: string): Promise<string | undefined> {
  const walk = async (dir: string): Promise<string | undefined> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = await walk(path);
        if (found !== undefined) {
          return found;
        }
      } else if (entry.name === operationId + '.json') {
        return readFile(path, 'utf8');
      }
    }

    return undefined;
  };

  return walk(join(root, '.nevo'));
}

const trail = (events: Seen[]): string[] =>
  events
    .filter((item) => item.event === 'step')
    .map((item) => `${String(item.data.step)}:${String(item.data.status)}`);

async function post(url: string, headers: Record<string, string>, body: unknown) {
  return fetch(`${url}/api/specs`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ ...ARCHETYPE_REQUEST, ...(body as Record<string, unknown>) }),
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
      { id: 'committing-specification', status: 'pending' },
      { id: 'registering', status: 'pending' },
    ]);
    // The snapshot already shows `reserving` running; the rest streams live.
    expect(trail(events)).toEqual([
      'reserving:done',
      'preparing-workspace:running',
      'preparing-workspace:done',
      'writing-specification:running',
      'writing-specification:done',
      'committing-specification:running',
      'committing-specification:done',
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

  // BE-LONG: the Create work must outlive the HTTP request that started it.
  it('finishes and journals a new-worktree create when the client aborts the POST mid-way', async () => {
    const { root, url, headers } = await server(true);
    const operationId = randomUUID();
    const watching = await subscribe(url, headers, operationId, (event) => {
      // First live step: the request is in flight and the worktree is being prepared.
      if (event.event === 'step') {
        abort.abort();
      }
    });
    const abort = new AbortController();
    const request = fetch(`${url}/api/specs`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        ...ARCHETYPE_REQUEST,
        operationId,
        title: 'Client disconnects',
        target: { kind: 'new-worktree', baseRef: 'HEAD' },
      }),
      signal: abort.signal,
    });
    await expect(request).rejects.toThrow();
    expect(abort.signal.aborted).toBe(true);

    const events = await watching.events;
    expect(events.at(-1)?.event).toBe('completed');
    expect(events.some((item) => item.event === 'recovery-required')).toBe(false);

    const inspection = await fetch(`${url}/api/specs/create/operations/${operationId}`, {
      headers,
    });
    expect(inspection.status).toBe(200);
    const inspected = (await inspection.json()) as Record<string, unknown>;
    expect(inspected.status).toBe('completed');
    expect(typeof inspected.specId).toBe('string');

    // The journal reached `completed` and the worktree really exists.
    const journal = await readJournal(root, operationId);
    expect(journal).toBeDefined();
    expect(JSON.parse(journal!)).toMatchObject({ operationId, stage: 'completed' });
    const worktrees = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(worktrees.match(/^worktree /gm)?.length).toBeGreaterThanOrEqual(2);

    // Replay of the same request returns the completed result, not a conflict.
    const replay = await post(url, headers, {
      operationId,
      title: 'Client disconnects',
      target: { kind: 'new-worktree', baseRef: 'HEAD' },
    });
    expect(replay.status).toBe(201);
    expect(await replay.json()).toMatchObject({ specId: inspected.specId });
  }, 240000);
});
