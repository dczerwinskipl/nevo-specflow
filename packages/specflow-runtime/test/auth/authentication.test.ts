import { describe, expect, it } from 'vitest';

import { authenticatePassword } from '../../src/auth/password-auth.js';
import {
  authenticatedSession,
  configuredAuthProviders,
  unauthenticatedSession,
} from '../../src/auth/session.js';
import type { RuntimeAuthConfig } from '../../src/config/types.js';

const auth: RuntimeAuthConfig = {
  mode: 'required',
  users: {
    'demo-user': { name: 'Demo User' },
  },
  providers: {
    password: {
      enabled: true,
      accounts: {
        demo: {
          userId: 'demo-user',
          passwordHash:
            '$scrypt$16384$8$1$MDEyMzQ1Njc4OWFiY2RlZg$tjK03tRvEjqCcPwmgtddMkgjlXrk8U_b9rIvfeBMKCc',
        },
      },
    },
    google: {
      enabled: true,
      clientId: 'example.apps.googleusercontent.com',
      clientSecret: 'fake-local-secret',
      allowedEmails: {
        'demo@example.com': 'demo-user',
      },
    },
  },
};

describe('authentication model', () => {
  it('reports enabled login providers in stable order', () => {
    expect(configuredAuthProviders(auth)).toEqual(['password', 'google']);
  });

  it('keeps trusted local identity explicitly unauthenticated', () => {
    const localAuth: RuntimeAuthConfig = {
      ...auth,
      mode: 'none',
      localUserId: 'demo-user',
    };

    expect(unauthenticatedSession(localAuth)).toEqual({
      authenticated: false,
      user: { id: 'demo-user', name: 'Demo User' },
      availableProviders: ['password', 'google'],
    });
  });

  it('projects authenticated sessions without provider tokens', () => {
    expect(authenticatedSession(auth, 'demo-user', 'google')).toEqual({
      authenticated: true,
      user: { id: 'demo-user', name: 'Demo User' },
      provider: 'google',
      availableProviders: ['password', 'google'],
    });
  });

  it('authenticates a configured password account', async () => {
    await expect(
      authenticatePassword(auth, 'demo', 'correct horse battery staple'),
    ).resolves.toEqual({
      id: 'demo-user',
      name: 'Demo User',
    });
  });

  it('returns null for an unknown username or invalid password', async () => {
    await expect(authenticatePassword(auth, 'missing', 'wrong password')).resolves.toBeNull();
    await expect(authenticatePassword(auth, 'demo', 'wrong password')).resolves.toBeNull();
  });
});
