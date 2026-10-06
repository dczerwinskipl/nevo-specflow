import { describe, expect, it } from 'vitest';

import { AuthorizationConfigurationError, createAuthorization, defineResource } from '../src/index';

const Order = defineResource({
  name: 'order',
  actions: {
    View: 'view',
  },
});

describe('authorization configuration', () => {
  it('rejects roles that reference unknown capabilities', () => {
    expect(() =>
      createAuthorization({
        resources: [Order],
        roles: { broken: ['missing.capability'] },
        assignments: [],
      }),
    ).toThrowError(AuthorizationConfigurationError);
  });

  it('rejects assignments that reference unknown roles', () => {
    expect(() =>
      createAuthorization({
        resources: [Order],
        roles: { reader: [Order.capabilities.View] },
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

  it('rejects duplicate resource names', () => {
    expect(() =>
      createAuthorization({
        resources: [Order, Order],
        roles: {},
        assignments: [],
      }),
    ).toThrowError(/Duplicate authorization resource 'order'/);
  });

  it('rejects manually constructed resource definitions with foreign capabilities', () => {
    expect(() =>
      createAuthorization({
        resources: [
          {
            name: 'order',
            actions: { Manage: 'manage' },
            capabilities: { Manage: 'tenant.manage' },
          },
        ],
        roles: {},
        assignments: [],
      }),
    ).toThrowError(/must equal 'order.manage'/);
  });

  it('rejects manually constructed resource definitions whose action and capability keys drift', () => {
    expect(() =>
      createAuthorization({
        resources: [
          {
            name: 'order',
            actions: { View: 'view' },
            capabilities: { Manage: 'order.manage' },
          },
        ],
        roles: {},
        assignments: [],
      }),
    ).toThrowError(/actions and capabilities must contain the same keys/);
  });

  it('snapshots caller-owned assignments at construction time', () => {
    const assignment = {
      subject: { kind: 'user', id: 'u1' },
      role: 'reader',
      scope: { tenantId: 'T1' },
    };
    const authorization = createAuthorization({
      resources: [Order],
      roles: { reader: [Order.capabilities.View] },
      assignments: [assignment],
    });

    assignment.subject.id = 'attacker';
    assignment.scope.tenantId = 'T2';

    expect(
      authorization.can({
        subject: { kind: 'user', id: 'u1' },
        capability: Order.capabilities.View,
        resource: { name: 'order', scope: { tenantId: 'T1', orderId: 'O1' } },
      }),
    ).toBe(true);
  });
});
