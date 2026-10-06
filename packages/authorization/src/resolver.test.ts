import { describe, expect, it } from 'vitest';

import { defineResource } from './resource';
import { createAuthorization } from './resolver';

const Order = defineResource({
  name: 'order',
  actions: {
    View: 'view',
    Manage: 'manage',
  },
});

const Tenant = defineResource({
  name: 'tenant',
  actions: {
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

describe('createAuthorization', () => {
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

  it('lets broader possessed scopes cover narrower required scopes only', () => {
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

    expect(
      auth.resolveCapabilities({
        subject: { kind: 'user', id: 'u1' },
        resource: {
          name: 'order',
          scope: {},
        },
      }),
    ).toEqual({
      capabilities: ['order.view'],
    });

    expect(
      auth.resolveCapabilities({
        subject: { kind: 'user', id: 'u1' },
        resource: {
          name: 'order',
          scope: { tenantId: 'T1' },
        },
      }),
    ).toEqual({
      capabilities: ['order.view', 'order.manage'],
    });
  });

  it('does not let a specific grant satisfy a broader required scope', () => {
    const scoped = createAuthorization({
      resources: [Order],
      roles: { operator: [Order.capabilities.Manage] },
      assignments: [
        {
          subject: { kind: 'user', id: 'u1' },
          role: 'operator',
          scope: { tenantId: 'T1', orderId: 'O1' },
        },
      ],
    });

    expect(
      scoped.can({
        subject: { kind: 'user', id: 'u1' },
        capability: Order.capabilities.Manage,
        resource: { name: 'order', scope: { tenantId: 'T1', orderId: 'O1' } },
      }),
    ).toBe(true);

    expect(
      scoped.can({
        subject: { kind: 'user', id: 'u1' },
        capability: Order.capabilities.Manage,
        resource: { name: 'order', scope: { tenantId: 'T1' } },
      }),
    ).toBe(false);

    expect(
      scoped.can({
        subject: { kind: 'user', id: 'u1' },
        capability: Order.capabilities.Manage,
        resource: { name: 'order', scope: {} },
      }),
    ).toBe(false);
  });

  it('detects a capability grant in any possessed scope without widening can()', () => {
    const scoped = createAuthorization({
      resources: [Order],
      roles: { reader: [Order.capabilities.View] },
      assignments: [
        {
          subject: { kind: 'user', id: 'u1' },
          role: 'reader',
          scope: { orderId: 'O1' },
        },
      ],
    });

    expect(
      scoped.hasCapabilityInAnyScope({
        subject: { kind: 'user', id: 'u1' },
        resource: Order.name,
        capability: Order.capabilities.View,
      }),
    ).toBe(true);

    expect(
      scoped.can({
        subject: { kind: 'user', id: 'u1' },
        resource: { name: Order.name, scope: {} },
        capability: Order.capabilities.View,
      }),
    ).toBe(false);

    expect(
      scoped.hasCapabilityInAnyScope({
        subject: { kind: 'user', id: 'u2' },
        resource: Order.name,
        capability: Order.capabilities.View,
      }),
    ).toBe(false);
  });

  it('rejects unsafe scope dimension identifiers at the generic boundary', () => {
    const auth = authorization();
    const prototypeSensitiveKey = ['__', 'proto__'].join('');
    const unsafeScope = Object.fromEntries([[prototypeSensitiveKey, 'value']]);

    expect(() =>
      auth.resolveCapabilities({
        subject: { kind: 'user', id: 'u1' },
        resource: { name: 'order', scope: unsafeScope },
      }),
    ).toThrowError(/must contain only letters/);
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

    expect(() =>
      authorization().hasCapabilityInAnyScope({
        subject: { kind: 'user', id: 'u1' },
        resource: 'order',
        capability: Tenant.capabilities.Manage,
      }),
    ).toThrowError(/does not belong to resource 'order'/);
  });
});
