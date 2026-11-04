import { expect, it, vi } from 'vitest';
import { createSessionRequest } from './request';
import type { CreateSession } from '@nevo/specflow-contracts/sessions';
import { ApiError } from '../../../../api';

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

const refused = () =>
  new ApiError({
    kind: 'validation',
    operation: 'sessions',
    outcome: 'not-applied',
    retryable: false,
    status: 400,
  });

it('releases a definitely refused create so the form can be edited, and keeps an unknown one', async () => {
  const storage = storageFixture();
  const request = createSessionRequest('alice', storage);
  await expect(request.send(body, () => Promise.reject(refused()))).rejects.toThrow();
  expect(request.pending()).toBeUndefined();
  expect(createSessionRequest('alice', storage).pending()).toBeUndefined();
  const send = vi.fn<(input: CreateSession) => Promise<{ sessionId: string }>>();
  send.mockResolvedValue({ sessionId: 'created' });
  await request.send({ ...body, modelId: 'edited' }, send);
  expect(send.mock.calls[0]?.[0]).toMatchObject({ modelId: 'edited' });
  const unknown = createSessionRequest('bob', storage);
  await expect(unknown.send(body, () => Promise.reject(new Error('Lost')))).rejects.toThrow();
  expect(unknown.pending()).toBeDefined();
});

it.each(['write-ignored', 'readback-throws'] as const)(
  'sends nothing when the create could not be read back from storage: %s',
  async (failure) => {
    const storage = storageFixture();
    let written = false;
    const blocked = {
      ...storage,
      setItem: (key: string, value: string) => {
        written = true;
        if (failure !== 'write-ignored') {
          storage.setItem(key, value);
        }
      },
      getItem: (key: string) => {
        if (written && failure === 'readback-throws') {
          throw new Error('Storage read denied');
        }

        return storage.getItem(key);
      },
    };
    const request = createSessionRequest('alice', blocked);
    const send = vi.fn();
    await expect(request.send(body, send)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
    expect(request.pending()).toBeUndefined();
  },
);

it('blocks on an unreadable create record until it is discarded explicitly', async () => {
  const storage = storageFixture();
  storage.setItem('nevo:session-create:alice', '{broken');
  const request = createSessionRequest('alice', storage);
  expect(request.state()).toBe('unreadable');
  const send = vi.fn(() => Promise.resolve({ sessionId: 'created' }));
  await expect(request.send(body, send)).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
  expect(storage.getItem('nevo:session-create:alice')).toBe('{broken');
  expect(request.discard()).toBe(true);
  expect(request.state()).toBe('ready');
  await request.send(body, send);
  expect(send).toHaveBeenCalledOnce();
});

it('keeps blocking, with no discard, while storage itself is unavailable', async () => {
  const request = createSessionRequest('alice', {
    getItem: () => {
      throw new Error('Storage denied');
    },
    setItem: () => undefined,
    removeItem: () => undefined,
  });
  expect(request.state()).toBe('unavailable');
  expect(request.discard()).toBe(false);
  await expect(request.send(body, vi.fn())).rejects.toThrow();
});
