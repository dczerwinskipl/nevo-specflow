import { describe, expect, it } from 'vitest';

import {
  AuthorizationConfigurationError,
  createAuthorization,
  defineResource,
} from '../src/index.js';

const Order = defineResource({
  name: 'order',
  capabilities: {
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
            capabilities: { Manage: 'tenant.manage' },
            capabilityIds: ['tenant.manage'],
          },
        ],
        roles: {},
        assignments: [],
      }),
    ).toThrowError(/Capability 'tenant.manage' does not belong to resource 'order'/);
  });

  it('rejects manually constructed resource definitions whose capability views drift', () => {
    expect(() =>
      createAuthorization({
        resources: [
          {
            name: 'order',
            capabilities: { View: 'order.view' },
            capabilityIds: ['order.manage'],
          },
        ],
        roles: {},
        assignments: [],
      }),
    ).toThrowError(/capabilities and capabilityIds must contain the same unique capability ids/);
  });
});
