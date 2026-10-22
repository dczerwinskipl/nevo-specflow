import { describe, it, expect } from 'vitest';
import { retainRequest, sendRetained } from './retainedRequest';
describe('retainRequest', () => {
  it('keeps a stage key for identical retries and replaces it when the body changes', () => {
    const holder: {
      current: { signature: string; input: { requestId: string; branch: string } } | null;
    } = { current: null };
    let i = 0;
    const id = () => `key-${++i}`;
    const first = retainRequest(holder, { branch: 'spec/one' }, id);
    expect(retainRequest(holder, { branch: 'spec/one' }, id)).toBe(first);
    expect(retainRequest(holder, { branch: 'spec/two' }, id).requestId).toBe('key-2');
  });
  it('keeps one operationId for a repeated create body and a new one for a changed target', () => {
    const holder: {
      current: { signature: string; input: { operationId: string; title: string } } | null;
    } = { current: null };
    let i = 0;
    const id = () => `op-${++i}`;
    const first = retainRequest(holder, { title: 'A' }, id, 'operationId');
    expect(first.operationId).toBe('op-1');
    expect(retainRequest(holder, { title: 'A' }, id, 'operationId')).toBe(first);
    expect(retainRequest(holder, { title: 'B' }, id, 'operationId').operationId).toBe('op-2');
  });
});

describe('sendRetained', () => {
  it('reuses the key after a failed attempt but issues a new one once the same body succeeded', async () => {
    const holder: { current: never } = { current: null } as never;
    const seen: string[] = [];
    let fail = true;
    const send = (input: { requestId: string }) => {
      seen.push(input.requestId);
      return fail ? Promise.reject(new Error('timeout')) : Promise.resolve('ok');
    };
    const body = { folders: ['x'], documents: [] };
    await expect(sendRetained(holder, body, send)).rejects.toThrow();
    fail = false;
    await sendRetained(holder, body, send);
    await sendRetained(holder, body, send); // add, delete, add again
    expect(seen[1]).toBe(seen[0]);
    expect(seen[2]).not.toBe(seen[1]);
  });

  it('releases the key of a definite refusal but keeps it for an unconfirmed failure', async () => {
    const holder: { current: never } = { current: null } as never;
    const seen: string[] = [];
    const refuse = new Error('refused');
    let failure: Error = new Error('timeout');
    const send = (input: { requestId: string }) => {
      seen.push(input.requestId);
      return Promise.reject(failure);
    };
    const definite = (error: unknown) => error === refuse;
    const body = { name: 'a' };
    await expect(sendRetained(holder, body, send, 'requestId', definite)).rejects.toThrow();
    await expect(sendRetained(holder, body, send, 'requestId', definite)).rejects.toThrow();
    expect(seen[1]).toBe(seen[0]);
    failure = refuse;
    await expect(sendRetained(holder, body, send, 'requestId', definite)).rejects.toThrow();
    await expect(sendRetained(holder, body, send, 'requestId', definite)).rejects.toThrow();
    expect(seen[2]).toBe(seen[0]);
    expect(seen[3]).not.toBe(seen[2]);
  });
});
