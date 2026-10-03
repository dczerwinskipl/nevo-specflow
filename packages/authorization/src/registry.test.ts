import { describe, expect, it } from 'vitest';

import { AuthorizationConfigurationError } from './errors';
import { createAuthorizationRegistry } from './registry';
import { defineResource } from './resource';

const Order = defineResource({
  name: 'order',
  capabilities: {
    View: 'view',
  },
});

describe('createAuthorizationRegistry', () => {
  it('rejects roles that reference unknown capabilities', () => {
    expect(() =>
      createAuthorizationRegistry([Order], { broken: ['missing.capability'] }, []),
    ).toThrowError(AuthorizationConfigurationError);
  });

  it('rejects assignments that reference unknown roles', () => {
    expect(() =>
      createAuthorizationRegistry([Order], { reader: [Order.capabilities.View] }, [
        {
          subject: { kind: 'user', id: 'u1' },
          role: 'missing-role',
          scope: {},
        },
      ]),
    ).toThrowError(/unknown role 'missing-role'/);
  });

  it('rejects duplicate resource names', () => {
    expect(() => createAuthorizationRegistry([Order, Order], {}, [])).toThrowError(
      /Duplicate authorization resource 'order'/,
    );
  });

  it('rejects manually constructed resource definitions with foreign capabilities', () => {
    expect(() =>
      createAuthorizationRegistry(
        [
          {
            name: 'order',
            capabilities: { Manage: 'tenant.manage' },
            capabilityIds: ['tenant.manage'],
          },
        ],
        {},
        [],
      ),
    ).toThrowError(/Capability 'tenant.manage' does not belong to resource 'order'/);
  });

  it('rejects manually constructed resource definitions whose capability views drift', () => {
    expect(() =>
      createAuthorizationRegistry(
        [
          {
            name: 'order',
            capabilities: { View: 'order.view' },
            capabilityIds: ['order.manage'],
          },
        ],
        {},
        [],
      ),
    ).toThrowError(/capabilities and capabilityIds must contain the same unique capability ids/);
  });

  it('snapshots caller-owned assignments at construction time', () => {
    const assignment = {
      subject: { kind: 'user', id: 'u1' },
      role: 'reader',
      scope: { tenantId: 'T1' },
    };
    const registry = createAuthorizationRegistry([Order], { reader: [Order.capabilities.View] }, [
      assignment,
    ]);

    assignment.subject.id = 'attacker';
    assignment.scope.tenantId = 'T2';

    expect(registry.assignments).toEqual([
      {
        subject: { kind: 'user', id: 'u1' },
        role: 'reader',
        scope: { tenantId: 'T1' },
      },
    ]);
  });
});
