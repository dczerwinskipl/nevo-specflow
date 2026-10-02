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
  },
});

describe('authorization configuration', () => {
  it('rejects roles that reference unknown capabilities', () => {
    expect(() =>
      createAuthorization({
        resources: [Spec],
        roles: { broken: ['missing.capability'] },
        assignments: [],
      }),
    ).toThrowError(AuthorizationConfigurationError);
  });

  it('rejects assignments that reference unknown roles', () => {
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

  it('rejects duplicate resource names', () => {
    expect(() =>
      createAuthorization({
        resources: [Spec, Spec],
        roles: {},
        assignments: [],
      }),
    ).toThrowError(/Duplicate authorization resource 'spec'/);
  });
});
