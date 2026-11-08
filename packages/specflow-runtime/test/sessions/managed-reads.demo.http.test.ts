import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ProviderCatalogueSchema,
  SessionAssociationReadSchema,
  SessionSnapshotSchema,
  TelemetrySnapshotSchema,
  type SessionListPage,
  type SessionSnapshot,
  type TelemetrySnapshot,
} from '@nevo/specflow-contracts/sessions';
import type { DemoCatalogue, DemoSessionResult } from '@nevo/specflow-contracts/demo';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

/** A well-formed ID that no demo Session, Turn, Work or content has. */
const unknown = '00000000-0000-4000-8000-0000000000ff';
let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function open() {
  const config = passwordConfig();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
      authorization: { assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }] },
    },
    { dataMode: 'demo' },
  );

  return app;
}

async function listed(server: FastifyInstance): Promise<string> {
  const page = await server.inject('/api/sessions?specId=admission');
  expect(page.statusCode, page.body).toBe(200);
  const first = page.json<SessionListPage>().items[0];
  expect(first).toBeDefined();

  return first!.sessionId;
}

describe('demo managed Session reads (read-only, no coordinator)', () => {
  it('opens a listed Session read-only with every read the Session screen makes', async () => {
    const server = await open();
    const sessionId = await listed(server);
    const base = `/api/sessions/${sessionId}`;

    const snapshot = await server.inject(base);
    expect(snapshot.statusCode, snapshot.body).toBe(200);
    const body = snapshot.json<SessionSnapshot>();
    expect(Value.Check(SessionSnapshotSchema, body)).toBe(true);
    expect(body).toMatchObject({
      session: {
        sessionId,
        readiness: 'ready',
        capabilities: { view: true, manage: false, start: false, cancel: false },
      },
      eventSeq: 0,
      entries: [],
      history: { hasOlder: false },
    });
    expect(body.activeTurn).toBeUndefined();

    const providers = await server.inject('/api/session-providers');
    expect(providers.statusCode, providers.body).toBe(200);
    expect(Value.Check(ProviderCatalogueSchema, providers.json())).toBe(true);
    expect(
      providers
        .json<{ items: { providerId: string }[] }>()
        .items.some((item) => item.providerId === body.session.providerId),
    ).toBe(true);

    const telemetry = await server.inject(base + '/telemetry');
    expect(telemetry.statusCode).toBe(200);
    const reading = telemetry.json<TelemetrySnapshot>();
    expect(Value.Check(TelemetrySnapshotSchema, reading)).toBe(true);
    expect(reading.context).toMatchObject({ status: 'unavailable', refreshable: false });

    const association = await server.inject(base + '/association');
    expect(association.statusCode).toBe(200);
    expect(Value.Check(SessionAssociationReadSchema, association.json())).toBe(true);

    expect((await server.inject(base + '/history')).json()).toMatchObject({
      code: 'SESSION_CURSOR_INVALID',
    });
    expect((await server.inject(base + '/history?before=x')).json()).toEqual({
      sessionId,
      eventSeq: 0,
      entries: [],
      history: { hasOlder: false },
    });
    expect((await server.inject(base + '/turns/' + unknown + '/work')).statusCode).toBe(404);
    expect((await server.inject(base + '/work/' + unknown + '/actions')).statusCode).toBe(404);
    expect((await server.inject(base + '/content/' + unknown + '?revision=1')).statusCode).toBe(
      404,
    );
  });

  it('keeps every mutation refused as disabled', async () => {
    const server = await open();
    const base = `/api/sessions/${await listed(server)}`;
    for (const [url, payload] of [
      [base + '/turns', { requestId: randomUUID(), message: 'Hello' }],
      [base + '/rename', { requestId: randomUUID(), title: 'New' }],
      [base + '/archive', { requestId: randomUUID() }],
      [base + '/telemetry/refresh', { requestId: randomUUID(), groups: ['context'] }],
    ] as const) {
      const response = await server.inject({ method: 'POST', url, payload });
      expect(response.json(), url).toMatchObject({ code: 'SESSION_DISABLED' });
    }
  });

  it('reads a Session allocated in this environment and refuses an unknown one', async () => {
    const server = await open();
    const catalogue = (
      await server.inject('/api/demo/specification-creation')
    ).json<DemoCatalogue>();
    const created = await server.inject({
      method: 'POST',
      url: '/api/demo/specs/admission/sessions',
      payload: {
        requestId: 'session-1',
        catalogueRevision: catalogue.revision,
        providerId: 'codex',
        modelId: 'model-a',
        mode: 'agent',
      },
    });
    expect(created.statusCode, created.body).toBe(200);
    const { sessionId } = created.json<DemoSessionResult>();
    const snapshot = await server.inject(`/api/sessions/${sessionId}`);
    expect(snapshot.statusCode, snapshot.body).toBe(200);
    expect(snapshot.json<SessionSnapshot>().session).toMatchObject({
      providerId: 'codex',
      modelId: 'model-a',
      capabilities: { view: true, start: false },
    });
    expect((await server.inject('/api/sessions/' + unknown)).statusCode).toBe(404);
  });

  it('streams only heartbeats and refuses a cursor the demo never issued', async () => {
    const server = await open();
    const sessionId = await listed(server);
    expect((await server.inject(`/api/sessions/${sessionId}/events?after=3`)).json()).toMatchObject(
      { code: 'SESSION_CURSOR_INVALID' },
    );

    await server.listen({ port: 0, host: '127.0.0.1' });
    const { port } = server.server.address() as AddressInfo;
    const controller = new AbortController();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/sessions/${sessionId}/events?after=0`,
      { signal: controller.signal },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value as Uint8Array);
    expect(first).toBe(': connected\n\n');
    controller.abort();
  });
});
