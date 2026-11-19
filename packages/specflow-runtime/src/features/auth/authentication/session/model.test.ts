import { userInfo } from 'node:os';

import { describe, expect, it } from 'vitest';

import type { RuntimeAuthenticationConfig } from '../configuration/model';
import {
  authenticatedSession,
  configuredLoginMethods,
  localActor,
  unauthenticatedSession,
} from './model';

const auth: RuntimeAuthenticationConfig = {
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
      instances: {
        company: {
          name: 'Company SSO',
          enabled: true,
          issuer: 'https://issuer.example.test',
          clientId: 'client-id',
          clientSecret: 'secret',
          allowedEmails: { 'demo@example.com': 'demo-user' },
        },
      },
    },
  },
};

describe('authentication session model', () => {
  it('reports password capability and enabled OIDC instances', () => {
    expect(configuredLoginMethods(auth)).toEqual({
      password: { enabled: true },
      oidc: [{ id: 'company', name: 'Company SSO' }],
    });
  });

  it('keeps trusted local identity explicitly unauthenticated and login-free', () => {
    const localAuth: RuntimeAuthenticationConfig = {
      mode: 'none',
      localUserId: 'demo-user',
      users: auth.users,
      providers: {
        password: { enabled: false, accounts: {} },
        oidc: { instances: {} },
      },
    };

    expect(unauthenticatedSession(localAuth)).toEqual({
      authenticationRequired: false,
      authenticated: false,
      user: { id: 'demo-user', name: 'Demo User' },
      loginMethods: { password: { enabled: false }, oidc: [] },
      localActorId: `local:${userInfo().username}`,
    });
  });

  it('names the local CLI actor only when authentication is not required', () => {
    const local = { ...auth, mode: 'none' } as const;

    expect(localActor(local, () => 'ann')).toEqual({ localActorId: 'local:ann' });
    expect(localActor(auth, () => 'ann')).toEqual({});
    expect(localActor(local, () => '')).toEqual({});
    expect(
      localActor(local, () => {
        throw new Error('no passwd entry');
      }),
    ).toEqual({});
  });

  it('projects OIDC profile data from the authenticated session', () => {
    expect(
      authenticatedSession(
        auth,
        'demo-user',
        { kind: 'oidc', providerId: 'company' },
        'OIDC Display Name',
      ),
    ).toEqual({
      authenticationRequired: true,
      authenticated: true,
      user: { id: 'demo-user', name: 'OIDC Display Name' },
      authenticatedWith: { kind: 'oidc', providerId: 'company' },
      loginMethods: {
        password: { enabled: true },
        oidc: [{ id: 'company', name: 'Company SSO' }],
      },
    });
  });
});
