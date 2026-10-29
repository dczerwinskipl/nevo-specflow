import type { AddressInfo } from 'node:net';

import {
  OperationListResponseSchema,
  type OperationListResponse,
} from '@nevo/specflow-contracts/operations';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import type { FastifyInstance } from 'fastify';
import { Value } from 'typebox/value';
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

const listUrl = (url: string, query = '') => `${url}/api/demo/specifications/operations${query}`;

describe('GET /api/demo/specifications/operations', () => {
  it('is empty before anything was created and lists a demo Create after it', async () => {
    const url = await demo(false);
    const empty = (await (await fetch(listUrl(url))).json()) as OperationListResponse;
    expect(empty).toMatchObject({ items: [], counts: { inProgress: 0, completed: 0 } });

    const catalogue = (await (
      await fetch(`${url}/api/demo/specification-creation`)
    ).json()) as DemoCatalogue;
    const operationId = '7f3a91c2-4b6e-4d1a-9c0e-000000000301';
    const created = await fetch(`${url}/api/demo/specifications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operationId,
        title: 'Listed demo create',
        catalogueRevision: catalogue.revision,
        archetypeId: 'feature',
        archetypeVersion: 1,
        optionalDocumentIds: [],
      }),
    });
    expect(created.status).toBe(201);

    const response = await fetch(listUrl(url));
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as OperationListResponse;
    expect(Value.Check(OperationListResponseSchema, body)).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      operationId,
      kind: 'specification-create',
      status: 'completed',
      title: 'Listed demo create',
    });
    expect(body.counts.completed).toBe(1);

    // Same validator semantics as the real route.
    const etag = response.headers.get('etag')!;
    const again = await fetch(listUrl(url), { headers: { 'if-none-match': etag } });
    expect(again.status).toBe(304);
  });

  it('seeds every status with the operations-panel scenario and passes the strict contract', async () => {
    const url = await demo(true);
    const response = await fetch(listUrl(url, '?demoScenario=operations-panel'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as OperationListResponse;
    expect(Value.Check(OperationListResponseSchema, body)).toBe(true);
    expect(new Set(body.items.map((item) => item.status))).toEqual(
      new Set(['in-progress', 'recovery-required', 'failed', 'completed']),
    );
    expect(body.items.length).toBeGreaterThanOrEqual(6);
    expect(body.items.some((item) => item.steps?.length)).toBe(true);
    expect(body.items.some((item) => item.steps === undefined)).toBe(true);
    expect(body.items.some((item) => (item.title?.length ?? 0) > 100)).toBe(true);
    expect(body.items.map((item) => item.code)).toEqual(
      expect.arrayContaining(['COMMIT_FAILED', 'OPERATION_INTERRUPTED', 'CREATE_JOURNAL_CORRUPT']),
    );
    expect(body.items.map((item) => item.status)).toEqual(
      [...body.items.map((item) => item.status)].sort(
        (a, b) =>
          ['recovery-required', 'failed', 'in-progress', 'completed'].indexOf(a) -
          ['recovery-required', 'failed', 'in-progress', 'completed'].indexOf(b),
      ),
    );
  });

  it('honours limit and status, and rejects a malformed query', async () => {
    const url = await demo(true);
    const scenario = 'demoScenario=operations-panel';
    const limited = (await (
      await fetch(listUrl(url, `?${scenario}&limit=3`))
    ).json()) as OperationListResponse;
    expect(limited.items).toHaveLength(3);
    expect(limited.truncated).toBe(true);
    const failed = (await (
      await fetch(listUrl(url, `?${scenario}&status=failed`))
    ).json()) as OperationListResponse;
    expect(failed.items.map((item) => item.status)).toEqual(['failed']);
    // The same 400 body as the real list route.
    for (const query of ['?status=bogus', '?limit=0']) {
      const invalid = await fetch(listUrl(url, query));
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toEqual({
        error: 'OPERATION_LIST_QUERY_INVALID',
        code: 'OPERATION_LIST_QUERY_INVALID',
      });
    }

    expect((await fetch(listUrl(url, '?demoScenario=nope'))).status).toBe(400);
  });

  it('answers 403 for the forbidden scenario and ignores scenarios when the seam is off', async () => {
    const seam = await demo(true);
    expect((await fetch(listUrl(seam, '?demoScenario=forbidden'))).status).toBe(403);
    const plain = await demo(false);
    const body = (await (
      await fetch(listUrl(plain, '?demoScenario=operations-panel'))
    ).json()) as OperationListResponse;
    expect(body.items).toEqual([]);
  });
});
