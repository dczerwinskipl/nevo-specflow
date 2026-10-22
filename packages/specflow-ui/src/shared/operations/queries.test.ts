import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  operationsListQueryOptions,
  nextPollInterval,
  idlePollMs,
  maxBackoffPollMs,
  operationsKeys,
  runningPollMs,
  type OperationsListData,
} from './queries';
import {
  operationItem,
  operationList,
  operationsStub,
} from '../../../test-support/operations/fixtures';

const running = { list: operationList([operationItem({ status: 'in-progress' })]) };
const idle = { list: operationList([operationItem({ status: 'completed' })]) };

describe('nextPollInterval', () => {
  it('polls every 3 s while a row runs and every 15 s otherwise', () => {
    expect(nextPollInterval(running, 0)).toBe(runningPollMs);
    expect(nextPollInterval(idle, 0)).toBe(idlePollMs);
    expect(nextPollInterval(undefined, 0)).toBe(idlePollMs);
  });

  it('backs off exponentially while reads fail, up to 60 s', () => {
    expect([1, 2, 3, 4, 5, 9].map((failures) => nextPollInterval(running, failures))).toEqual([
      6_000,
      12_000,
      24_000,
      48_000,
      maxBackoffPollMs,
      maxBackoffPollMs,
    ]);
  });

  it('stops for good when the Runtime serves no list', () => {
    expect(nextPollInterval({ unavailable: true }, 0)).toBe(false);
  });
});

describe('operationsListQueryOptions', () => {
  const url = '/api/specs/operations';
  const run = (
    api: ReturnType<typeof operationsStub>,
    client = new QueryClient(),
    failures = { current: 0 },
  ) => client.fetchQuery({ ...operationsListQueryOptions(api, url, failures), staleTime: 0 });

  it('stores the list and clears the failure count', async () => {
    const failures = { current: 3 };
    const data = await run(operationsStub(running.list), new QueryClient(), failures);
    expect(data.list?.items).toHaveLength(1);
    expect(failures.current).toBe(0);
  });

  it('counts a failed read and rethrows it', async () => {
    const failures = { current: 0 };
    await expect(
      run(operationsStub(new Error('boom')), new QueryClient(), failures),
    ).rejects.toThrow('boom');
    expect(failures.current).toBe(1);
  });

  it('keeps the previous list on 304 and sends its tag', async () => {
    const client = new QueryClient();
    const previous: OperationsListData = { ...idle, etag: 'W/"1"' };
    client.setQueryData(operationsKeys.list(url), previous);
    const api = operationsStub({ kind: 'not-modified' });
    expect(await run(api, client)).toBe(previous);
    expect(api.calls).toEqual([{ url, etag: 'W/"1"' }]);
  });

  it('records an unavailable list instead of failing', async () => {
    expect(await run(operationsStub({ kind: 'unavailable' }))).toEqual({ unavailable: true });
  });
});
