import { describe, expect, it } from 'vitest';

import type { RuntimeAuthConfig } from '../../../../src/auth/authentication/config/model';
import {
  authenticatedSession,
  configuredAuthProviders,
  unauthenticatedSession,
} from '../../../../src/auth/authentication/session/model';

const auth: RuntimeAuthConfig = {
  mode: 'required',
  users: { 'demo-user': { name: 'Demo User' } },
  providers: {
    password: {
      enabled: true,
      accounts: {
        demo: { userId: 'demo-user', passwordHash: 'unused-in-model-test' },
      },
    },
    oidc: {
      enabled: true,
      issuer: 'https://issuer.example.test',
      clientId: 'client-id',
      clientSecret: 'secret',
      allowedEmails: { 'demo@example.com': 'demo-user' },
    },
  },
};

describe('authentication session model', () => {
  it('reports enabled providers in stable order', () => {
    expect(configuredAuthProviders(auth)).toEqual(['password', 'oidc']);
  });

  it('keeps trusted local identity explicitly unauthenticated', () => {
    const localAuth: RuntimeAuthConfig = {
      mode: 'none',
      localUserId: 'demo-user',
      users: auth.users,
      providers: {
        password: { enabled: false, accounts: {} },
        oidc: { enabled: false, allowedEmails: {} },
      },
    };

    expect(unauthenticatedSession(localAuth)).toEqual({
      authenticated: false,
      user: { id: 'demo-user', name: 'Demo User' },
      availableProviders: [],
    });
  });

  it('projects authenticated sessions without provider-private state', () => {
    expect(authenticatedSession(auth, 'demo-user', 'oidc')).toEqual({
      authenticated: true,
      user: { id: 'demo-user', name: 'Demo User' },
      provider: 'oidc',
      availableProviders: ['password', 'oidc'],
    });
  });
});
