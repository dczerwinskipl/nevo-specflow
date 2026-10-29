import type { AddressInfo } from 'node:net';

import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { createRuntimeApp } from '../../src/server/app';
import { noAuthConfig } from '../auth/support/config';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function demo(scenarios: boolean) {
  const app = await createRuntimeApp(
    {
      ...noAuthConfig(),
      authentication: { ...noAuthConfig().authentication, localUserId: undefined },
    },
    { dataMode: 'demo', demoScenarios: scenarios },
  );
  apps.push(app);
  await app.listen({ port: 0, host: '127.0.0.1' });

  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

async function readEvents(response: Response) {
  const text = await response.text();

  return text
    .split('\n\n')
    .map((raw) => ({
      event: /^event: (.+)$/m.exec(raw)?.[1],
      data: /^data: (.+)$/m.exec(raw)?.[1],
    }))
    .filter((frame) => frame.event && frame.data)
    .map((frame) => ({
      event: frame.event!,
      data: JSON.parse(frame.data!) as Record<string, unknown>,
    }));
}

async function createBody(url: string, operationId: string, target?: unknown) {
  const catalogue = (await (
    await fetch(`${url}/api/demo/specification-creation`)
  ).json()) as DemoCatalogue;

  return {
    operationId,
    title: 'Demo progress',
    catalogueRevision: catalogue.revision,
    archetypeId: 'feature',
    archetypeVersion: 1,
    optionalDocumentIds: ['decisions'],
    ...(target ? { target } : {}),
  };
}

const events = (url: string, id: string) =>
  fetch(`${url}/api/demo/specifications/operations/${id}/events`);

describe('demo Runtime mirrors the generic operation progress stream', () => {
  it('replays the steps of a finished demo create to a late subscriber', async () => {
    const url = await demo(false);
    const id = '7f3a91c2-4b6e-4d1a-9c0e-000000000101';
    const created = await fetch(`${url}/api/demo/specifications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(await createBody(url, id)),
    });
    expect(created.status).toBe(201);
    const seen = await readEvents(await events(url, id));
    expect(seen.map((item) => item.event)).toEqual(['snapshot', 'completed']);
    expect(seen.at(-1)?.data.result).not.toHaveProperty('documentIds');
  });

  it('paces the steps when the scenario seam asks for it, so a subscriber sees them live', async () => {
    const url = await demo(true);
    const id = '7f3a91c2-4b6e-4d1a-9c0e-000000000102';
    const watching = events(url, id).then(readEvents);
    const created = await fetch(`${url}/api/demo/specifications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-demo-scenario': 'slow-create' },
      body: JSON.stringify(await createBody(url, id)),
    });
    expect(created.status).toBe(201);
    const seen = await watching;
    expect(seen.filter((item) => item.event === 'step').length).toBeGreaterThanOrEqual(3);
    expect(seen.at(-1)?.event).toBe('completed');
  });

  it('answers 202 with Location for Prefer: respond-async and keeps publishing detached', async () => {
    const url = await demo(true);
    const id = '7f3a91c2-4b6e-4d1a-9c0e-000000000104';
    const accepted = await fetch(`${url}/api/demo/specifications`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-demo-scenario': 'slow-create',
        prefer: 'respond-async',
      },
      body: JSON.stringify(await createBody(url, id)),
    });
    expect(accepted.status).toBe(202);
    expect(accepted.headers.get('location')).toBe(`/api/demo/specifications/operations/${id}`);
    expect(accepted.headers.get('preference-applied')).toBe('respond-async');
    expect(await accepted.json()).toEqual({
      operationId: id,
      kind: 'specification-create',
      status: 'in-progress',
    });
    // The work continues after the response: the stream still ends with the result.
    const seen = await readEvents(await events(url, id));
    expect(seen.at(-1)?.event).toBe('completed');

    // A replay of the same request is answered with the committed result (201).
    const replay = await fetch(`${url}/api/demo/specifications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', prefer: 'respond-async' },
      body: JSON.stringify(await createBody(url, id)),
    });
    expect(replay.status).toBe(201);
  });

  it('publishes a code-only failure for a forced demo failure', async () => {
    const url = await demo(true);
    const id = '7f3a91c2-4b6e-4d1a-9c0e-000000000103';
    const watching = events(url, id).then(readEvents);
    const created = await fetch(`${url}/api/demo/specifications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-demo-scenario': 'branch-taken' },
      body: JSON.stringify(
        await createBody(url, id, { kind: 'new-worktree', baseRef: 'refs/heads/main' }),
      ),
    });
    expect(created.status).toBeGreaterThanOrEqual(400);
    const seen = await watching;
    expect(seen.at(-1)?.event).toBe('failed');
  });
});
