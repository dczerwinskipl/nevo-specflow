import { describe, expect, it, vi } from 'vitest';

import { DocumentError, deriveAgentScope, type OwnedExecution } from '@nevo/specflow-engine';

import { createCapabilityRegistry, type CapabilityBinding } from '../capability/registry';
import { createBrokerDispatcher, type BrokerDocuments } from './dispatch';
import { brokerOperationId } from './operation-id';

const commit = { state: 'not-applicable' } as const;

function fixture() {
  const registry = createCapabilityRegistry();
  const save = vi.fn(
    (specId: string, documentId: string, input: { operationId: string }, owned: OwnedExecution) => {
      void specId;
      void owned;

      return Promise.resolve({
        operationId: input.operationId,
        document: { id: documentId, path: 'notes.md', revision: 'r2' },
        commit,
      });
    },
  );
  const workspaceOf = vi.fn((specId: string) =>
    Promise.resolve(specId === 'S1' ? '/work/one' : specId === 'S2' ? '/work/two' : undefined),
  );
  const documents: BrokerDocuments = {
    workspaceOf,
    create: vi.fn(() => Promise.reject(new Error('unused'))),
    save,
    operate: vi.fn(() => Promise.reject(new Error('unused'))),
  };
  const dispatcher = createBrokerDispatcher({ registry, documents });
  const turn = (invocationId: string, specId: string, sessionId = 'session-' + invocationId) => {
    const binding: CapabilityBinding = {
      invocationId,
      sessionId,
      turnId: 'turn-' + invocationId,
      specId,
      workspace: specId === 'S1' ? '/work/one' : '/work/two',
      scope: deriveAgentScope({ kind: 'ad-hoc', specId }),
      actor: { class: 'agent', details: { provider: 'claude', model: 'm1', sessionId } },
    };
    const handle = registry.mint(binding);
    handle.activate();

    return handle;
  };

  const request = (capability: string, operation: object, extra: object = {}) =>
    JSON.stringify({ protocol: 1, capability, requestId: 'request-0001', operation, ...extra });
  const saveOf = (specId = 'S1') => ({
    name: 'documents.save',
    specId,
    documentId: 'notes',
    content: 'text',
    expectedRevision: 'r1',
  });

  return { registry, documents, workspaceOf, save, dispatcher, turn, request, saveOf };
}

describe('agent broker dispatch', () => {
  it('runs an in-scope write as the Turn’s owned execution with a derived operation id', async () => {
    const f = fixture();
    const a = f.turn('inv-a', 'S1');
    const response = await f.dispatcher.handle(f.request(a.value, f.saveOf()));
    expect(response).toMatchObject({ ok: true, value: { operation: 'documents.save' } });
    const [specId, documentId, input, owned] = f.save.mock.calls[0]!;
    expect([specId, documentId]).toEqual(['S1', 'notes']);
    expect(input.operationId).toBe(brokerOperationId('inv-a', 'request-0001'));
    // The actor comes from the binding: the Turn's provider, model and Session.
    expect(owned).toEqual({
      operationId: 'inv-a',
      actor: {
        class: 'agent',
        details: { provider: 'claude', model: 'm1', sessionId: 'session-inv-a' },
      },
    });
  });

  it('answers the Turn’s scope', async () => {
    const f = fixture();
    const a = f.turn('inv-a', 'S1');
    expect(await f.dispatcher.handle(f.request(a.value, { name: 'scope.describe' }))).toEqual({
      ok: true,
      value: {
        operation: 'scope.describe',
        scope: {
          kind: 'ad-hoc',
          specId: 'S1',
          operations: [
            'scope.describe',
            'documents.create',
            'documents.save',
            'documents.classify',
          ],
        },
      },
    });
  });

  it.each([
    ['missing', undefined, 'unknown'],
    ['unknown', 'nvcap_' + 'z'.repeat(43), 'unknown'],
  ])('refuses a %s capability', async (_label, capability, reason) => {
    const f = fixture();
    f.turn('inv-a', 'S1');
    const frame = JSON.stringify({
      protocol: 1,
      ...(capability !== undefined ? { capability } : {}),
      requestId: 'request-0001',
      operation: f.saveOf(),
    });
    expect(await f.dispatcher.handle(frame)).toMatchObject({
      ok: false,
      error: { code: 'AGENT_CAPABILITY_INVALID', details: { reason } },
    });
    expect(f.save).not.toHaveBeenCalled();
  });

  it('refuses a capability before its claim is dispatched and after its Turn ended', async () => {
    const f = fixture();
    const pending = f.registry.mint({
      invocationId: 'inv-p',
      sessionId: 's',
      turnId: 't',
      specId: 'S1',
      workspace: '/work/one',
      scope: deriveAgentScope({ kind: 'ad-hoc', specId: 'S1' }),
      actor: { class: 'agent', details: { provider: 'claude', sessionId: 's' } },
    });
    expect(await f.dispatcher.handle(f.request(pending.value, f.saveOf()))).toMatchObject({
      error: { code: 'AGENT_CAPABILITY_INVALID', details: { reason: 'not-dispatched' } },
    });
    pending.activate();
    await pending.revoke();
    pending.activate();
    expect(await f.dispatcher.handle(f.request(pending.value, f.saveOf()))).toMatchObject({
      error: { code: 'AGENT_CAPABILITY_INVALID', details: { reason: 'ended' } },
    });
    expect(f.save).not.toHaveBeenCalled();
  });

  it('acts only as the invocation whose capability is presented, never as another', async () => {
    const f = fixture();
    f.turn('inv-a', 'S1');
    const b = f.turn('inv-b', 'S2');
    // B's capability cannot reach A's Specification.
    expect(await f.dispatcher.handle(f.request(b.value, f.saveOf('S1')))).toMatchObject({
      error: { code: 'AGENT_SCOPE_REFUSED', details: { reason: 'other-specification' } },
    });
    expect(await f.dispatcher.handle(f.request(b.value, f.saveOf('S2')))).toMatchObject({
      ok: true,
    });
    expect(f.save.mock.calls[0]![3].operationId).toBe('inv-b');
  });

  it.each([
    ['actor', { actor: { class: 'human' } }],
    ['ignoreClaims', { ignoreClaims: true }],
    ['claimId', { operation: { claimId: 'x' } }],
    ['ownedExecution', { operation: { ownedExecution: { operationId: 'x' } } }],
    ['operationId', { operation: { operationId: '00000000-0000-4000-8000-000000000000' } }],
    ['owner', { operation: { documents: [{ owner: 'me' }] } }],
  ])('refuses, not ignores, a body that names %s', async (field, extra) => {
    const f = fixture();
    const a = f.turn('inv-a', 'S1');
    const body = JSON.parse(f.request(a.value, f.saveOf())) as Record<string, unknown>;
    const merged = {
      ...body,
      ...extra,
      ...('operation' in extra
        ? { operation: { ...(body.operation as object), ...(extra.operation as object) } }
        : {}),
    };
    expect(await f.dispatcher.handle(JSON.stringify(merged))).toMatchObject({
      ok: false,
      error: { code: 'AGENT_REQUEST_REFUSED', details: { field } },
    });
    expect(f.save).not.toHaveBeenCalled();
  });

  it('derives another operation id for the same request id under another invocation', async () => {
    const f = fixture();
    const a = f.turn('inv-a', 'S1', 'session-1');
    const b = f.turn('inv-b', 'S1', 'session-2');
    await f.dispatcher.handle(f.request(a.value, f.saveOf()));
    await f.dispatcher.handle(f.request(b.value, f.saveOf()));
    const [first, second] = f.save.mock.calls.map((call) => call[2].operationId);
    expect(first).toBe(brokerOperationId('inv-a', 'request-0001'));
    expect(second).toBe(brokerOperationId('inv-b', 'request-0001'));
    expect(first).not.toBe(second);
    expect(f.save.mock.calls[1]![3].operationId).toBe('inv-b');
  });

  it('refuses a write whose Turn ended while the broker waited, before the Engine runs', async () => {
    const f = fixture();
    const a = f.turn('inv-a', 'S1');
    let release!: (root: string) => void;
    f.workspaceOf.mockImplementationOnce(
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    const pending = f.dispatcher.handle(f.request(a.value, f.saveOf()));
    await vi.waitFor(() => expect(f.workspaceOf).toHaveBeenCalled());
    let revoked = false;
    const revocation = a.revoke().then(() => (revoked = true));
    await Promise.resolve();
    // The call is still counted: the claim must not settle yet.
    expect(revoked).toBe(false);
    release('/work/one');
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: 'AGENT_CAPABILITY_INVALID', details: { reason: 'ended' } },
    });
    await revocation;
    expect(f.save).not.toHaveBeenCalled();
  });

  it('lets a write already in the Engine finish before the revocation resolves', async () => {
    const f = fixture();
    const a = f.turn('inv-a', 'S1');
    const order: string[] = [];
    let finish!: () => void;
    f.save.mockImplementationOnce(
      (_specId, documentId, input) =>
        new Promise((resolve) => {
          finish = () => {
            order.push('engine-done');
            resolve({
              operationId: input.operationId,
              document: { id: documentId, path: 'notes.md', revision: 'r2' },
              commit,
            });
          };
        }),
    );
    const pending = f.dispatcher.handle(f.request(a.value, f.saveOf()));
    await vi.waitFor(() => expect(f.save).toHaveBeenCalled());
    const revocation = a.revoke().then(() => order.push('revoked'));
    finish();
    expect(await pending).toMatchObject({ ok: true });
    await revocation;
    expect(order).toEqual(['engine-done', 'revoked']);
  });

  it("passes the Engine's foreign-author refusal to the agent with its remedy", async () => {
    const f = fixture();
    const a = f.turn('inv-a', 'S1');
    f.save.mockRejectedValueOnce(
      new DocumentError('DOCUMENT_COMMITS_PENDING', 'Ask the owner to commit them first.', {
        cause: 'foreign-uncommitted',
        paths: ['specs/active/one/notes.md'],
      }),
    );
    expect(await f.dispatcher.handle(f.request(a.value, f.saveOf()))).toEqual({
      ok: false,
      error: {
        code: 'DOCUMENT_COMMITS_PENDING',
        message: 'Ask the owner to commit them first.',
        details: { cause: 'foreign-uncommitted', paths: ['specs/active/one/notes.md'] },
      },
    });
  });

  it.each([
    [{ name: 'tasks.create', specId: 'S1' }, 'operation-not-in-scope'],
    [{ name: 'workflow.finish' }, 'operation-not-in-scope'],
  ])('refuses %o as out of scope with an actionable reason', async (operation, reason) => {
    const f = fixture();
    const a = f.turn('inv-a', 'S1');
    const response = await f.dispatcher.handle(f.request(a.value, operation));
    expect(response).toMatchObject({
      ok: false,
      error: { code: 'AGENT_SCOPE_REFUSED', details: { reason } },
    });
    expect(!response.ok && response.error.message).toMatch(/may run only: documents\.create/);
  });

  it('refuses a write once the Specification left the claimed workspace', async () => {
    const f = fixture();
    const a = f.turn('inv-a', 'S1');
    f.workspaceOf.mockResolvedValueOnce('/elsewhere');
    expect(await f.dispatcher.handle(f.request(a.value, f.saveOf()))).toMatchObject({
      error: { code: 'AGENT_SCOPE_REFUSED', details: { reason: 'workspace-changed' } },
    });
    expect(f.save).not.toHaveBeenCalled();
  });

  it('refuses frames that are not requests of the protocol', async () => {
    const f = fixture();
    const a = f.turn('inv-a', 'S1');
    expect(await f.dispatcher.handle('{not json')).toMatchObject({
      error: { code: 'AGENT_REQUEST_INVALID' },
    });
    expect(
      await f.dispatcher.handle(f.request(a.value, { ...f.saveOf(), content: 42 })),
    ).toMatchObject({ error: { code: 'AGENT_REQUEST_INVALID' } });
  });
});
