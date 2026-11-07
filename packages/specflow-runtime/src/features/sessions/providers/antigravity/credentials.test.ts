import { describe, expect, it, vi } from 'vitest';
import { inspectAntigravityAccount } from './credentials';

const audience = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
function fixture(overrides: Record<string, unknown> = {}, claims: Record<string, unknown> = {}) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

  return Buffer.from(
    JSON.stringify({
      auth_method: 'consumer',
      token: {
        access_token: 'synthetic-access',
        refresh_token: 'synthetic-refresh',
        token_type: 'Bearer',
      },
      id_token: `${encode({ alg: 'RS256' })}.${encode({ iss: 'https://accounts.google.com', aud: audience, azp: audience, sub: 'synthetic-subject', exp: 1, ...claims })}.synthetic`,
      ...overrides,
    }),
  );
}

function inspect(bytes: Buffer, signal = new AbortController().signal) {
  return inspectAntigravityAccount({ signal }, { readCredential: () => bytes });
}

describe('Antigravity native account binding (synthetic credentials only)', () => {
  it('returns only non-secret binding and clears its owned credential copy', async () => {
    const bytes = fixture();
    const result = await inspect(bytes);
    expect(Object.keys(result).sort()).toEqual([
      'accountScope',
      'authenticationFingerprint',
      'authenticationMode',
      'source',
    ]);
    expect(result.accountScope).toMatch(/^[a-f0-9]{64}$/);
    expect(result.authenticationFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.source).toBe('windows-keyring');
    expect(result.authenticationMode).toBe('consumer');
    expect(JSON.stringify(result)).not.toContain('synthetic');
    expect(bytes.every((byte) => byte === 0)).toBe(true);
  });

  it('keeps the account across native token rotation and detects account switches', async () => {
    const initial = await inspect(fixture());
    const rotated = await inspect(
      fixture({
        token: {
          access_token: 'synthetic-rotated',
          refresh_token: 'synthetic-refresh',
          token_type: 'Bearer',
        },
      }),
    );
    const switched = await inspect(fixture({}, { sub: 'synthetic-other-subject' }));
    expect(rotated.accountScope).toBe(initial.accountScope);
    expect(rotated.authenticationFingerprint).not.toBe(initial.authenticationFingerprint);
    expect(switched.accountScope).not.toBe(initial.accountScope);
  });

  it('normalizes Google issuer aliases and leaves refresh to the native CLI', async () => {
    expect((await inspect(fixture({}, { iss: 'accounts.google.com', exp: 1 }))).accountScope).toBe(
      (await inspect(fixture())).accountScope,
    );
  });

  it.each([
    () => fixture({ auth_method: 'wif' }),
    () => fixture({ wif_provider: 'synthetic-provider' }),
    () => fixture({ project_id: 'synthetic-project' }),
    () => fixture({ token: { access_token: 'synthetic', token_type: 'Bearer' } }),
    () =>
      fixture({
        token: { access_token: 'synthetic', refresh_token: 'synthetic', token_type: 'Basic' },
      }),
    () => fixture({}, { sub: '' }),
    () => fixture({}, { iss: 'https://untrusted.invalid' }),
    () => fixture({}, { aud: 'different-client' }),
    () => fixture({}, { azp: 'different-client' }),
    () => fixture({ id_token: 'malformed' }),
    () => Buffer.from('{"token":"synthetic-secret",'),
    () => Buffer.alloc(16_385),
  ])(
    'rejects unsupported profiles and malformed credentials without leaking values',
    async (make) => {
      const bytes = make();
      await expect(inspect(bytes)).rejects.toMatchObject({ code: 'PROVIDER_AUTH_REQUIRED' });
      expect(bytes.every((byte) => byte === 0)).toBe(true);
    },
  );

  it('does not read native credentials when already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    const readCredential = vi.fn(() => fixture());
    await expect(
      inspectAntigravityAccount({ signal: controller.signal }, { readCredential }),
    ).rejects.toThrow('cancelled');
    expect(readCredential).not.toHaveBeenCalled();
  });

  it('re-reads the selected exact source rather than caching successful authentication', async () => {
    const readCredential = vi
      .fn()
      .mockImplementationOnce(() => fixture())
      .mockImplementationOnce(() => {
        throw new Error('synthetic-native-error');
      });
    const options = { signal: new AbortController().signal };
    await inspectAntigravityAccount(options, { readCredential });
    await expect(inspectAntigravityAccount(options, { readCredential })).rejects.toMatchObject({
      code: 'PROVIDER_AUTH_REQUIRED',
    });
    expect(readCredential).toHaveBeenCalledTimes(2);
  });
});
