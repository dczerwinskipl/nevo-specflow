import { describe, expect, it } from 'vitest';

import {
  hashPassword,
  isSupportedPasswordHash,
  verifyPassword,
} from '../../src/auth/password.js';

describe('password hashing', () => {
  it('hashes and verifies a password with the supported scrypt format', async () => {
    const hash = await hashPassword('correct horse battery staple', {
      salt: Buffer.from('0123456789abcdef', 'utf8'),
    });

    expect(hash).toBe(
      '$scrypt$16384$8$1$MDEyMzQ1Njc4OWFiY2RlZg$' +
        'tjK03tRvEjqCcPwmgtddMkgjlXrk8U_b9rIvfeBMKCc',
    );
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  it('rejects malformed or unsupported hashes without throwing', async () => {
    expect(isSupportedPasswordHash('fake')).toBe(false);
    await expect(verifyPassword('password', 'fake')).resolves.toBe(false);
  });

  it('rejects empty passwords for hash creation', async () => {
    await expect(hashPassword('')).rejects.toThrowError(/must not be empty/);
  });
});
