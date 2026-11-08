import { expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import type {
  ProviderDescriptor,
  SessionSnapshot,
  SessionChange,
} from '@nevo/specflow-contracts/sessions';
import { effective, effectiveEvent } from './projection';

const identity = { projectId: 'project', sessionId: 'session' };

function fixture(
  mode: 'read-only' | 'workspace-write' = 'workspace-write',
  write = true,
  manage = true,
) {
  const snapshot: SessionSnapshot = {
    revision: 1,
    eventSeq: 1,
    entries: [],
    history: { hasOlder: false },
    session: {
      sessionId: 'session',
      projectId: 'project',
      providerId: 'controlled',
      mode,
      readiness: 'ready',
      createdAt: 'now',
      updatedAt: 'now',
      capabilities: {
        view: true,
        manage: true,
        start: true,
        cancel: false,
        questions: true,
        permissions: true,
      },
    },
  };
  const request = {
    authz: { resolveCapabilities: () => ({ view: true, manage, 'execute-write': write }) },
  } as unknown as FastifyRequest;
  const provider: ProviderDescriptor = {
    providerId: 'controlled',
    title: 'Controlled',
    readiness: 'ready',
    models: [],
    modes: ['read-only', 'workspace-write'],
    capabilities: {
      questions: true,
      permissions: true,
      cancel: true,
      resume: true,
      modelOverride: false,
      effortOverride: false,
    },
  };

  return {
    snapshot,
    request,
    provider,
    project: () => effective(snapshot, request, () => provider, identity),
  };
}

it('requires ExecuteWrite in addition to Manage for a writable Start', () => {
  const denied = fixture('workspace-write', false);
  expect(denied.project().session.capabilities.start).toBe(false);
  expect(denied.snapshot.session.capabilities.manage).toBe(true);
  expect(fixture('read-only', false).project().session.capabilities.start).toBe(true);
  expect(fixture().project().session.capabilities.start).toBe(true);
  expect(fixture('read-only', true, false).project().session.capabilities.start).toBe(false);
});
it('exposes required external login without replacing an unresolved active Turn', () => {
  const idle = fixture();
  idle.provider.readiness = 'authenticationRequired';
  expect(idle.project().session).toMatchObject({
    readiness: 'authenticationRequired',
    capabilities: { start: false },
  });
  const unresolved = fixture();
  unresolved.provider.readiness = 'authenticationRequired';
  unresolved.snapshot.session.readiness = 'requiresAttention';
  unresolved.snapshot.activeTurn = {
    turnId: 'unknown',
    state: 'unknown',
    revision: 1,
    startedAt: 'now',
  };
  expect(unresolved.project().session.readiness).toBe('requiresAttention');
  expect(unresolved.snapshot.activeTurn.state).toBe('unknown');
});
it.each(['active', 'waitingForUser', 'unknown'] as const)(
  'blocks Start while the active Turn is %s',
  (state) => {
    const f = fixture();
    f.snapshot.activeTurn = { turnId: 'turn', state, revision: 1, startedAt: 'now' };
    expect(f.project().session.capabilities.start).toBe(false);
    expect(f.snapshot.session.capabilities.cancel).toBe(state !== 'unknown');
  },
);
it('applies the same effective Start rule to streamed Turn projections', () => {
  const f = fixture();
  const event: SessionChange = {
    sessionId: 'session',
    eventSeq: 2,
    kind: 'interaction',
    changes: {
      projection: {
        session: f.snapshot.session,
        activeTurn: { turnId: 'turn', state: 'waitingForUser', revision: 1, startedAt: 'now' },
        currentActivity: null,
        interaction: null,
      },
    },
  };
  const projected = effectiveEvent(event, f.request, () => f.provider, identity);
  if (projected.kind !== 'interaction') {
    throw new Error('Wrong fixture event');
  }

  expect(projected.changes.projection.session.capabilities.start).toBe(false);
});
it('requires the pinned native mode to be available even when another mode keeps the provider ready', () => {
  const f = fixture();
  f.snapshot.session.providerModeId = 'agent';
  f.provider.providerModes = [
    {
      modeId: 'agent',
      nativeMode: 'agent',
      title: 'Agent',
      mode: 'workspace-write',
      readiness: 'unavailable',
    },
    { modeId: 'plan', nativeMode: 'plan', title: 'Plan', mode: 'read-only', readiness: 'ready' },
  ];
  expect(f.project().session.capabilities.start).toBe(false);
  expect(f.snapshot.session.readiness).toBe('unavailable');
});
it('keeps an archived Session read-only and projects the separate delete grant', () => {
  const archived = fixture('read-only');
  archived.snapshot.session.archivedAt = 'now';
  expect(archived.project().session.capabilities).toMatchObject({ start: false, manage: true });
  const event: SessionChange = {
    sessionId: 'session',
    eventSeq: 2,
    kind: 'session',
    changes: {
      session: {
        ...archived.snapshot.session,
        capabilities: { ...archived.snapshot.session.capabilities, start: true },
      },
    },
  };
  const projected = effectiveEvent(event, archived.request, () => archived.provider, identity);
  if (projected.kind !== 'session') {
    throw new Error('Wrong fixture event');
  }

  expect(projected.changes.session.capabilities.start).toBe(false);
  const granted = fixture('read-only');
  (
    granted.request.authz as unknown as { resolveCapabilities: () => Record<string, boolean> }
  ).resolveCapabilities = () => ({ view: true, manage: true, delete: true });
  expect(granted.project().session.capabilities).toMatchObject({ start: true, delete: true });
});
it('resolves an associated Session at its Specification scope, but write execution without it', () => {
  const f = fixture();
  const scopes: unknown[] = [];
  const request = {
    authz: {
      resolveCapabilities: ({ scope }: { scope: Record<string, string> }) => {
        scopes.push(scope);

        // A Specification-scoped developer: covers the specId scope only.
        return 'specId' in scope
          ? { view: true, manage: true, delete: true, 'execute-write': true }
          : { view: false, manage: false, delete: false, 'execute-write': false };
      },
    },
  } as unknown as FastifyRequest;
  const projected = effective(f.snapshot, request, () => f.provider, {
    ...identity,
    specId: 'S1',
  });
  expect(scopes).toEqual([
    { projectId: 'project', specId: 'S1', sessionId: 'session' },
    { projectId: 'project', sessionId: 'session' },
  ]);
  expect(projected.session.capabilities).toMatchObject({
    view: true,
    manage: true,
    delete: true,
    executeWrite: false,
    start: false,
  });
});
