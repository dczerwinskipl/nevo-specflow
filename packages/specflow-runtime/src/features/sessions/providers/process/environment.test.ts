import { describe, expect, it } from 'vitest';
import { projectProviderEnvironment } from './environment';
describe('provider environment projection', () => {
  it('drops ambient server credentials and runtime injection while admitting explicit auth inputs', () => {
    const projected = projectProviderEnvironment({
      platform: 'linux',
      host: {
        PATH: '/bin',
        HOME: '/home/owner',
        DATABASE_URL: 'server-secret',
        NODE_OPTIONS: '--import=evil',
        AWS_WEB_IDENTITY_TOKEN_FILE: '/auth/token',
        AWS_ROLE_ARN: 'role',
      },
      inherit: ['AWS_WEB_IDENTITY_TOKEN_FILE', 'AWS_ROLE_ARN'],
      secrets: { API_KEY: 'provider-secret' },
      runtime: { NEVO_INVOCATION_ID: 'invocation' },
    });
    expect(projected.values).toEqual({
      PATH: '/bin',
      HOME: '/home/owner',
      AWS_WEB_IDENTITY_TOKEN_FILE: '/auth/token',
      AWS_ROLE_ARN: 'role',
      API_KEY: 'provider-secret',
      NEVO_INVOCATION_ID: 'invocation',
    });
    expect(JSON.stringify(projected.sources)).not.toContain('provider-secret');
    expect(projected.sources.API_KEY).toBe('secret');
  });
  it('normalizes Windows casing and refuses ambiguous host values', () => {
    expect(
      projectProviderEnvironment({
        platform: 'win32',
        host: { Path: 'system-path', SystemRoot: 'C:\\Windows', SERVER_SECRET: 'private' },
      }).values,
    ).toEqual({ PATH: 'system-path', SYSTEMROOT: 'C:\\Windows' });
    expect(() =>
      projectProviderEnvironment({ platform: 'win32', host: { Path: 'one', PATH: 'two' } }),
    ).toThrow('Ambiguous');
  });
  it('keeps Runtime correlation reserved and validates byte budgets', () => {
    for (const options of [
      { configured: { nevo_session_id: 'spoof' } },
      { inherit: ['NEVO_SESSION_ID'] },
      { secrets: { NEVO_SESSION_ID: 'spoof' } },
    ])
      expect(() => projectProviderEnvironment({ host: {}, ...options })).toThrow('Reserved');
    expect(() => projectProviderEnvironment({ host: {}, configured: { BROKEN: '\0' } })).toThrow(
      'Invalid',
    );
    expect(() =>
      projectProviderEnvironment({ host: {}, configured: { LARGE: 'x'.repeat(32769) } }),
    ).toThrow('Invalid');
  });
});
