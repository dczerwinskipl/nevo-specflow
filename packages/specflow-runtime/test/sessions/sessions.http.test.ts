import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

let app: FastifyInstance | undefined,
  directory = '';
afterEach(async () => {
  await app?.close();
  app = undefined;
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function setup(scope?: Record<string, string>) {
  directory = await mkdtemp(join(tmpdir(), 'nevo-session-http-'));
  const config = passwordConfig();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: {
        ...config.authentication,
        mode: 'none',
        ...(scope ? { localUserId: 'demo-user' } : {}),
      },
      ...(scope
        ? { authorization: { assignments: [{ userId: 'demo-user', role: 'developer', scope }] } }
        : {}),
      sessions: { enabled: true, providers: { mock: { enabled: true } } },
    },
    { sessions: { storage: { directory, projectId: 'project' } } },
  );
}
describe('managed Session HTTP', () => {
  it('creates an independent chat and exposes bounded durable conversation and Work', async () => {
    await setup();
    const created = await app!.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
    });
    expect(created.statusCode).toBe(201);
    const { sessionId } = created.json<{ sessionId: string }>();
    const payload = { requestId: randomUUID(), message: 'Hello' };
    const start = await app!.inject({
      method: 'POST',
      url: '/api/sessions/' + sessionId + '/turns',
      payload,
    });
    expect(start.statusCode).toBe(202);
    await vi.waitFor(async () => {
      const s = (await app!.inject('/api/sessions/' + sessionId)).json<SessionSnapshot>();
      expect(s.entries.at(-1)?.kind).toBe('outcome');
    });
    const again = await app!.inject({
      method: 'POST',
      url: '/api/sessions/' + sessionId + '/turns',
      payload,
    });
    expect(again.json()).toEqual(start.json());
    const work = await app!.inject(
      '/api/sessions/' + sessionId + '/turns/' + start.json<{ turnId: string }>().turnId + '/work',
    );
    expect(work.statusCode).toBe(200);
    expect(work.json<{ items: unknown[] }>().items).toHaveLength(1);
    const snapshot = (await app!.inject('/api/sessions/' + sessionId)).json<SessionSnapshot>();
    expect(snapshot.session.capabilities.start).toBe(true);
    const ref = snapshot.entries.find((e) => e.kind === 'answer')!.text.content!;
    const content = await app!.inject(
      '/api/sessions/' + sessionId + '/content/' + ref.contentId + '?revision=' + ref.revision,
    );
    expect(content.statusCode).toBe(200);
    expect(content.json()).toMatchObject({ text: 'Mock response: Hello', complete: true });
    expect(
      (await app!.inject('/api/sessions/' + sessionId + '/history?before=forged')).statusCode,
    ).toBe(400);
  });
  it('does not turn a Spec-scoped grant into an independent Session grant', async () => {
    await setup({ specId: 'allowed-spec' });
    const denied = await app!.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
    });
    expect(denied.statusCode).toBe(403);
  });
  it('refuses unknown core association fields and unsafe write mode', async () => {
    await setup();
    const input = { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' };
    expect(
      (
        await app!.inject({
          method: 'POST',
          url: '/api/sessions',
          payload: { ...input, specId: 'spec' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app!.inject({
          method: 'POST',
          url: '/api/sessions',
          payload: { ...input, mode: 'workspace-write' },
        })
      ).statusCode,
    ).toBe(422);
  });
  it('registers a truthful disabled capability without opening storage', async () => {
    const config = passwordConfig();
    app = await createRuntimeApp({
      ...config,
      authentication: { ...config.authentication, mode: 'none' },
    });
    const response = await app.inject('/api/session-providers');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'SESSION_DISABLED' });
  });
});
