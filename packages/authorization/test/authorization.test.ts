import { describe, expect, it } from 'vitest';

import {
  AuthorizationConfigurationError,
  createAuthorization,
  defineResource,
} from '../src/index.js';

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

describe('@nevo/authorization', () => {
  it('qualifies feature-owned capability ids', () => {
    expect(Spec).toMatchObject({
      name: 'spec',
      capabilities: {
        View: 'spec.view',
        Manage: 'spec.manage',
      },
    });
    expect(Spec.capabilityIds).toEqual(['spec.view', 'spec.manage']);
  });

  it('unions matching roles and filters capabilities by explicit resource name', () => {
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

  it('does not match an assignment from another scope', () => {
    expect(
      authorization().resolveCapabilities({
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

  it('fails fast when can() receives a capability for another resource', () => {
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

  it('fails configuration when roles or assignments reference unknown ids', () => {
    expect(() =>
      createAuthorization({
        resources: [Spec],
        roles: { broken: ['missing.capability'] },
        assignments: [],
      }),
    ).toThrowError(AuthorizationConfigurationError);

    expect(() =>
      createAuthorization({
        resources: [Spec],
        roles: { viewer: [Spec.capabilities.View] },
        assignments: [
          {
            subject: { kind: 'user', id: 'u1' },
            role: 'missing-role',
            scope: {},
          },
        ],
      }),
    ).toThrowError(/unknown role 'missing-role'/);
  });
});
