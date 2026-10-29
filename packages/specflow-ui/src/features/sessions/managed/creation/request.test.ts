import { expect, it, vi } from 'vitest';
import { createSessionRequest } from './request';
import type { CreateSession } from '@nevo/specflow-contracts/sessions';

function storageFixture() {
  const records = new Map<string, string>();

  return {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    },
    removeItem: (key: string) => {
      records.delete(key);
    },
  };
}

const body = { providerId: 'claude', modelId: 'default', mode: 'read-only' as const };
it('retains the exact writable native mode across an uncertain acknowledgement and remount', async () => {
  const storage = storageFixture();
  const first = createSessionRequest('alice', storage);
  const input = {
    providerId: 'claude',
    mode: 'workspace-write' as const,
    providerModeId: 'acceptEdits',
  };
  await expect(first.send(input, () => Promise.reject(new Error('Lost')))).rejects.toThrow('Lost');
  const next = createSessionRequest('alice', storage);
  expect(next.pending()).toMatchObject(input);
  const send = vi.fn(() => Promise.resolve({ sessionId: 'created' }));
  await next.send({ ...input, providerModeId: 'plan' }, send);
  expect(send).toHaveBeenCalledWith(first.pending());
});

it('reuses the exact create after a lost response and remount, then clears confirmed success', async () => {
  const storage = storageFixture();
  const first = createSessionRequest('alice', storage);
  const send = vi
    .fn<(input: CreateSession) => Promise<{ sessionId: string }>>()
    .mockRejectedValueOnce(new Error('Lost response'))
    .mockResolvedValue({ sessionId: 'created' });
  await expect(first.send(body, send)).rejects.toThrow('Lost response');
  const request = first.pending();
  const remounted = createSessionRequest('alice', storage);
  expect(remounted.pending()).toEqual(request);
  await remounted.send({ ...body, providerId: 'changed-discovery' }, send);
  expect(send.mock.calls[1]?.[0]).toEqual(request);
  expect(remounted.pending()).toBeUndefined();
  expect(createSessionRequest('alice', storage).pending()).toBeUndefined();
  await remounted.send(body, send);
  expect(send.mock.calls[2]?.[0].requestId).not.toBe(request?.requestId);
});

it('isolates identities and refuses to dispatch without retained storage', async () => {
  const storage = storageFixture();
  const alice = createSessionRequest('alice', storage);
  await expect(alice.send(body, () => Promise.reject(new Error('Lost')))).rejects.toThrow('Lost');
  expect(createSessionRequest('bob', storage).pending()).toBeUndefined();
  const send = vi.fn();
  await expect(createSessionRequest('bob', undefined).send(body, send)).rejects.toThrow();
  const failing = {
    ...storage,
    setItem: () => {
      throw new Error('Quota');
    },
  };
  await expect(createSessionRequest('bob', failing).send(body, send)).rejects.toThrow('Quota');
  expect(send).not.toHaveBeenCalled();
  expect(createSessionRequest('alice', storage).pending()).toEqual(alice.pending());
});
