import { describe, expect, it } from 'vitest';
import { createAuthorization, defineResource } from '@nevo/authorization';

import { AuthenticationRequiredError, AuthorizationForbiddenError } from './errors';
import { createRequestAuthorization } from './request-authorization';

const Order = defineResource({
  name: 'order',
  actions: {
    View: 'view',
    Manage: 'manage',
  },
});

const authorization = createAuthorization({
  resources: [Order],
  roles: {
    reader: [Order.capabilities.View],
    manager: [Order.capabilities.View, Order.capabilities.Manage],
  },
  assignments: [
    {
      subject: { kind: 'user', id: 'u1' },
      role: 'reader',
      scope: {},
    },
    {
      subject: { kind: 'user', id: 'u1' },
      role: 'manager',
      scope: { orderId: 'O1' },
    },
  ],
});

describe('request authorization', () => {
  it('projects all resource actions as booleans for a concrete scope', () => {
    const authz = createRequestAuthorization(
      { mode: 'subject', subject: { kind: 'user', id: 'u1' } },
      authorization,
    );

    expect(
      authz.resolveCapabilities({
        resource: Order,
        scope: { orderId: 'O1' },
      }),
    ).toEqual({ view: true, manage: true });

    expect(
      authz.resolveCapabilities({
        resource: Order,
        scope: { orderId: 'O2' },
      }),
    ).toEqual({ view: true, manage: false });
  });

  it('supports named projection targets without exposing scopes to the consumer', () => {
    const authz = createRequestAuthorization(
      { mode: 'subject', subject: { kind: 'user', id: 'u1' } },
      authorization,
    );

    expect(
      authz.withCapabilities(
        { id: 'O1' },
        {
          globalOrders: { resource: Order },
          order: { resource: Order, scope: { orderId: 'O1' } },
        },
      ),
    ).toEqual({
      id: 'O1',
      capabilities: {
        globalOrders: { view: true, manage: false },
        order: { view: true, manage: true },
      },
    });
  });

  it('checks whether a capability exists in any possessed scope', () => {
    const authz = createRequestAuthorization(
      { mode: 'subject', subject: { kind: 'user', id: 'u1' } },
      authorization,
    );

    expect(
      authz.hasCapabilityInAnyScope({
        resource: Order,
        capability: Order.capabilities.Manage,
      }),
    ).toBe(true);

    const missing = createRequestAuthorization(
      { mode: 'subject', subject: { kind: 'user', id: 'u2' } },
      authorization,
    );
    expect(
      missing.hasCapabilityInAnyScope({
        resource: Order,
        capability: Order.capabilities.View,
      }),
    ).toBe(false);
    expect(() =>
      missing.requireCapabilityInAnyScope({
        resource: Order,
        capability: Order.capabilities.View,
      }),
    ).toThrowError(AuthorizationForbiddenError);
  });

  it('maps missing authentication to an authentication error and missing capability to forbidden', () => {
    const anonymous = createRequestAuthorization({ mode: 'unauthenticated' }, authorization);
    expect(() => anonymous.requireAccess()).toThrowError(AuthenticationRequiredError);
    expect(() =>
      anonymous.hasCapabilityInAnyScope({
        resource: Order,
        capability: Order.capabilities.View,
      }),
    ).toThrowError(AuthenticationRequiredError);

    const authz = createRequestAuthorization(
      { mode: 'subject', subject: { kind: 'user', id: 'u1' } },
      authorization,
    );
    expect(() =>
      authz.require({
        resource: Order,
        capability: Order.capabilities.Manage,
        scope: { orderId: 'O2' },
      }),
    ).toThrowError(AuthorizationForbiddenError);
  });

  it('allows every registered capability when access control is disabled', () => {
    const authz = createRequestAuthorization({ mode: 'disabled' }, authorization);

    expect(authz.resolveCapabilities({ resource: Order, scope: { orderId: 'O9' } })).toEqual({
      view: true,
      manage: true,
    });
    expect(
      authz.hasCapabilityInAnyScope({
        resource: Order,
        capability: Order.capabilities.Manage,
      }),
    ).toBe(true);
  });
});
