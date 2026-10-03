import { describe, expect, it } from 'vitest';

import { createAuthorization, defineResource } from '../src/index';

const Order = defineResource({
  name: 'order',
  capabilities: {
    View: 'view',
    Manage: 'manage',
  },
});

const Tenant = defineResource({
  name: 'tenant',
  capabilities: {
    Manage: 'manage',
  },
});

function authorization() {
  return createAuthorization({
    resources: [Order, Tenant],
    roles: {
      reader: [Order.capabilities.View],
      operator: [Order.capabilities.View, Order.capabilities.Manage, Tenant.capabilities.Manage],
    },
    assignments: [
      {
        subject: { kind: 'user', id: 'u1' },
        role: 'reader',
        scope: {},
      },
      {
        subject: { kind: 'user', id: 'u1' },
        role: 'operator',
        scope: { tenantId: 'T1' },
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
          name: 'order',
          scope: { tenantId: 'T1', orderId: 'O1' },
        },
      }),
    ).toEqual({
      capabilities: ['order.view', 'order.manage'],
    });

    expect(
      auth.resolveCapabilities({
        subject: { kind: 'user', id: 'u1' },
        resource: {
          name: 'tenant',
          scope: { tenantId: 'T1' },
        },
      }),
    ).toEqual({
      capabilities: ['tenant.manage'],
    });
  });

  it('matches broader assignments only inside their scope', () => {
    const auth = authorization();

    expect(
      auth.resolveCapabilities({
        subject: { kind: 'user', id: 'u1' },
        resource: {
          name: 'order',
          scope: { tenantId: 'T2', orderId: 'O1' },
        },
      }),
    ).toEqual({
      capabilities: ['order.view'],
    });
  });

  it('fails fast on capability/resource mismatch', () => {
    expect(() =>
      authorization().can({
        subject: { kind: 'user', id: 'u1' },
        capability: Tenant.capabilities.Manage,
        resource: {
          name: 'order',
          scope: { tenantId: 'T1', orderId: 'O1' },
        },
      }),
    ).toThrowError(/does not belong to resource 'order'/);
  });
});
