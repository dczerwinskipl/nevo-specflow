import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import {
  createOperationProgressRegistry,
  type OperationProgressRegistry,
} from '../../src/features/operations';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const operationId = '3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60';
const kind = 'specification-create';
const steps = ['reserving', 'writing-specification', 'registering'];
const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function authenticated(role: 'developer' | 'viewer' = 'developer') {
  const store = new InMemoryAuthenticationStore();
  const session = store.createSession({
    userId: 'demo-user',
    authenticatedWith: { kind: 'password' },
  });
  const cookie = authCookieNames(passwordConfig().server.port).session;
  return {
    store,
    role,
    headers: { cookie: cookie + '=' + session },
  };
}

async function listen(
  registry: OperationProgressRegistry,
  options: { role?: 'developer' | 'viewer'; heartbeatMs?: number; waitMs?: number } = {},
) {
  const auth = authenticated(options.role);
  const app = await createRuntimeApp(
    {
      ...passwordConfig(),
      authorization: { assignments: [{ userId: 'demo-user', role: auth.role, scope: {} }] },
    },
    {
      auth: { store: auth.store },
      operations: {
        registry,
        ...(options.heartbeatMs !== undefined ? { heartbeatMs: options.heartbeatMs } : {}),
        ...(options.waitMs !== undefined ? { waitMs: options.waitMs } : {}),
      },
    },
  );
  apps.push(app);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  return { app, url, headers: auth.headers };
}

interface Frame {
  id?: string;
  event?: string;
  data?: unknown;
  comment?: string;
}

async function readFrames(
  response: Response,
  until: (frames: Frame[]) => boolean,
): Promise<Frame[]> {
  const frames: Frame[] = [];
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    while (!until(frames)) {
      const next = await reader.read();
      if (next.done) break;
      buffer += next.value;
      let split: number;
      while ((split = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const frame: Frame = {};
        for (const line of raw.split('\n')) {
          if (line.startsWith(':')) frame.comment = line.slice(1).trim();
          else if (line.startsWith('id: ')) frame.id = line.slice(4);
          else if (line.startsWith('event: ')) frame.event = line.slice(7);
          else if (line.startsWith('data: ')) frame.data = JSON.parse(line.slice(6));
        }
        frames.push(frame);
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return frames;
}

const eventsUrl = (base: string, id = operationId) =>
  `${base}/api/specs/create/operations/${id}/events`;

// The mechanism is shared; the route belongs to the feature (here: Create).
describe('GET /api/specs/create/operations/:operationId/events', () => {
  it('requires authentication and the kind authorization before revealing anything', async () => {
    const registry = createOperationProgressRegistry();
    registry.begin({ operationId, kind, steps });
    const { url, headers } = await listen(registry, { role: 'viewer' });

    expect((await fetch(eventsUrl(url))).status).toBe(401);
    const denied = await fetch(eventsUrl(url), { headers });
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain(operationId);
  });

  it('rejects a malformed id and has no global kind-selected route any more', async () => {
    const { url, headers } = await listen(createOperationProgressRegistry());
    expect((await fetch(eventsUrl(url, 'not-a-uuid'), { headers })).status).toBe(400);
    const legacy = await fetch(`${url}/api/operations/${operationId}/events?kind=${kind}`, {
      headers,
    });
    expect(legacy.status).toBe(404);
  });

  it('does not stream an operation registered under another kind', async () => {
    const registry = createOperationProgressRegistry();
    registry.begin({ operationId, kind: 'other-kind', steps });
    const { url, headers } = await listen(registry, { waitMs: 20 });
    const response = await fetch(eventsUrl(url), { headers });
    const frames = (await readFrames(response, () => false)).filter((frame) => frame.event);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.data).toMatchObject({ type: 'failed', code: 'OPERATION_NOT_FOUND' });
  });

  it('streams snapshot, steps and the terminal result as SSE and then closes', async () => {
    const registry = createOperationProgressRegistry();
    const reporter = registry.begin({ operationId, kind, steps });
    reporter.step('reserving', 'running');
    const { url, headers } = await listen(registry);

    const response = await fetch(eventsUrl(url), { headers });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/);
    expect(response.headers.get('cache-control')).toBe('no-store');

    setTimeout(() => {
      reporter.step('reserving', 'done');
      reporter.complete({ operationId, ok: true });
    }, 30);
    const frames = await readFrames(response, () => false);
    const events = frames.filter((frame) => frame.event);
    expect(events.map((frame) => frame.event)).toEqual([
      'snapshot',
      'step',
      'step',
      'step',
      'completed',
    ]);
    expect(events[0]?.data).toMatchObject({ type: 'snapshot', currentStep: 'reserving' });
    const ids = events.map((frame) => Number(frame.id));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resumes after Last-Event-ID', async () => {
    const registry = createOperationProgressRegistry();
    const reporter = registry.begin({ operationId, kind, steps });
    reporter.step('reserving', 'running');
    reporter.step('reserving', 'done');
    reporter.fail('BRANCH_ALREADY_EXISTS');
    const { url, headers } = await listen(registry);

    const response = await fetch(eventsUrl(url), { headers: { ...headers, 'last-event-id': '1' } });
    const frames = (await readFrames(response, () => false)).filter((frame) => frame.event);
    expect(frames.map((frame) => frame.event)).toEqual(['step', 'failed']);
    expect(frames[1]?.data).toMatchObject({ code: 'BRANCH_ALREADY_EXISTS' });
    expect(JSON.stringify(frames)).not.toMatch(/message|stack/);
  });

  it('holds the subscription of an operation that has not been reserved yet', async () => {
    const registry = createOperationProgressRegistry();
    const { url, headers } = await listen(registry, { waitMs: 5000 });
    const response = await fetch(eventsUrl(url), { headers });
    expect(response.status).toBe(200);

    setTimeout(() => {
      const reporter = registry.begin({ operationId, kind, steps });
      reporter.step('reserving', 'running');
      reporter.complete({});
    }, 40);
    const frames = (await readFrames(response, () => false)).filter((frame) => frame.event);
    expect(frames[0]?.event).toBe('snapshot');
    expect(frames.at(-1)?.event).toBe('completed');
  });

  it('gives up on an operation that never starts with a code-only failure', async () => {
    const { url, headers } = await listen(createOperationProgressRegistry(), { waitMs: 50 });
    const response = await fetch(eventsUrl(url), { headers });
    const frames = (await readFrames(response, () => false)).filter((frame) => frame.event);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.data).toMatchObject({ type: 'failed', code: 'OPERATION_NOT_FOUND' });
    expect(frames[0]?.id).toBeUndefined();
  });

  it('sends heartbeat comments while the operation is quiet', async () => {
    const registry = createOperationProgressRegistry();
    registry.begin({ operationId, kind, steps });
    const { url, headers } = await listen(registry, { heartbeatMs: 20 });
    const response = await fetch(eventsUrl(url), { headers });
    const frames = await readFrames(
      response,
      (seen) => seen.filter((frame) => frame.comment === 'heartbeat').length >= 2,
    );
    expect(frames.filter((frame) => frame.comment === 'heartbeat').length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('ends open streams when the server closes', async () => {
    const registry = createOperationProgressRegistry();
    registry.begin({ operationId, kind, steps });
    const { app, url, headers } = await listen(registry);
    const response = await fetch(eventsUrl(url), { headers });
    const reading = readFrames(response, () => false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await app.close();
    await expect(reading).resolves.toBeDefined();
  });
});
