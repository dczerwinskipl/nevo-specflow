import { describe, expect, it } from 'vitest';

import { createAuthorization, defineResource } from '../src/index.js';

const Spec = defineResource({
  name: 'spec',
  capabilities: {
    View: 'view',
    Manage: 'manage',
  },
});

const Session = defineResource({
  name: 'session',
  capabilities: {
    Create: 'create',
  },
});

function authorization() {
  return createAuthorization({
    resources: [Spec, Session],
    roles: {
      viewer: [Spec.capabilities.View],
      developer: [
        Spec.capabilities.View,
        Spec.capabilities.Manage,
        Session.capabilities.Create,
      ],
    },
    assignments: [
      {
        subject: { kind: 'user', id: 'u1' },
        role: 'viewer',
        scope: {},
      },
      {
        subject: { kind: 'user', id: 'u1' },
        role: 'developer',
        scope: { projectId: 'P1' },
      },
    ],
  });
}

describe('authorization resolver', () => {
  it('unions matching roles and filters by explicit resource name', () => {
    const auth = authorization();

    expect(
      auth.resolveCapabilities({
        subject: { kind: 'user', id: 'u1' },
        resource: {
          name: 'spec',
          scope: { projectId: 'P1', specId: 'S1' },
        },
      }),
    ).toEqual({
      capabilities: ['spec.view', 'spec.manage'],
    });

    expect(
      auth.resolveCapabilities({
        subject: { kind: 'user', id: 'u1' },
        resource: {
          name: 'session',
          scope: { projectId: 'P1', specId: 'S1' },
        },
      }),
    ).toEqual({
      capabilities: ['session.create'],
    });
  });

  it('matches broader assignments only inside their scope', () => {
    const auth = authorization();

    expect(
      auth.resolveCapabilities({
        subject: { kind: 'user', id: 'u1' },
        resource: {
          name: 'spec',
          scope: { projectId: 'P2', specId: 'S1' },
        },
      }),
    ).toEqual({
      capabilities: ['spec.view'],
    });
  });

  it('fails fast on capability/resource mismatch', () => {
    expect(() =>
      authorization().can({
        subject: { kind: 'user', id: 'u1' },
        capability: Session.capabilities.Create,
        resource: {
          name: 'spec',
          scope: { projectId: 'P1', specId: 'S1' },
        },
      }),
    ).toThrowError(/does not belong to resource 'spec'/);
  });
});
