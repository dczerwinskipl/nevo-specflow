import { describe, expect, it } from 'vitest';

import { hashPassword, isSupportedPasswordHash, verifyPassword } from '../../src/auth/password.js';

const SUPPORTED_HASH =
  '$scrypt$16384$8$1$MDEyMzQ1Njc4OWFiY2RlZg

describe('password hashing', () => {
  it('hashes and verifies a password with the supported scrypt format', async () => {
    const hash = await hashPassword('correct horse battery staple', {
      salt: Buffer.from('0123456789abcdef', 'utf8'),
    });

    expect(hash).toBe(SUPPORTED_HASH);
    expect(isSupportedPasswordHash(hash)).toBe(true);
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  it.each(['$scrypt$32768$8$1', '$scrypt$16384$16$1', '$scrypt$16384$8$2'])(
    'rejects changed scrypt parameters: %s',
    (prefix) => {
      expect(isSupportedPasswordHash(SUPPORTED_HASH.replace('$scrypt$16384$8$1', prefix))).toBe(
        false,
      );
    },
  );

  it('rejects a hash with the wrong salt length', () => {
    const shortSalt = Buffer.alloc(15, 1).toString('base64url');
    const hash = SUPPORTED_HASH.replace('MDEyMzQ1Njc4OWFiY2RlZg', shortSalt);

    expect(isSupportedPasswordHash(hash)).toBe(false);
  });

  it('rejects a hash with the wrong derived key length', () => {
    const shortKey = Buffer.alloc(31, 2).toString('base64url');
    const hash = SUPPORTED_HASH.replace('tjK03tRvEjqCcPwmgtddMkgjlXrk8U_b9rIvfeBMKCc', shortKey);

    expect(isSupportedPasswordHash(hash)).toBe(false);
  });

  it('rejects malformed or non-canonical base64url', () => {
    expect(
      isSupportedPasswordHash(
        SUPPORTED_HASH.replace('MDEyMzQ1Njc4OWFiY2RlZg', 'MDEyMzQ1Njc4OWFiY2RlZg='),
      ),
    ).toBe(false);
    expect(
      isSupportedPasswordHash(
        SUPPORTED_HASH.replace('MDEyMzQ1Njc4OWFiY2RlZg', 'MDEyMzQ1Njc4OWFiY2RlZ*'),
      ),
    ).toBe(false);
  });

  it('rejects malformed or unsupported hashes without throwing', async () => {
    expect(isSupportedPasswordHash('fake')).toBe(false);
    await expect(verifyPassword('password', 'fake')).resolves.toBe(false);
  });

  it('requires the generated salt to match the supported format', async () => {
    await expect(hashPassword('password', { salt: Buffer.alloc(15) })).rejects.toThrowError(
      /exactly 16 bytes/,
    );
  });

  it('rejects empty passwords for hash creation', async () => {
    await expect(hashPassword('')).rejects.toThrowError(/must not be empty/);
  });
});
 + 'tjK03tRvEjqCcPwmgtddMkgjlXrk8U_b9rIvfeBMKCc';

describe('password hashing', () => {
  it('hashes and verifies a password with the supported scrypt format', async () => {
    const hash = await hashPassword('correct horse battery staple', {
      salt: Buffer.from('0123456789abcdef', 'utf8'),
    });

    expect(hash).toBe(SUPPORTED_HASH);
    expect(isSupportedPasswordHash(hash)).toBe(true);
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  it.each([
    '$scrypt$32768$8$1',
    '$scrypt$16384$16$1',
    '$scrypt$16384$8$2',
  ])('rejects changed scrypt parameters: %s', (prefix) => {
    expect(isSupportedPasswordHash(SUPPORTED_HASH.replace('$scrypt$16384$8$1', prefix))).toBe(
      false,
    );
  });

  it('rejects a hash with the wrong salt length', () => {
    const shortSalt = Buffer.alloc(15, 1).toString('base64url');
    const hash = SUPPORTED_HASH.replace('MDEyMzQ1Njc4OWFiY2RlZg', shortSalt);

    expect(isSupportedPasswordHash(hash)).toBe(false);
  });

  it('rejects a hash with the wrong derived key length', () => {
    const shortKey = Buffer.alloc(31, 2).toString('base64url');
    const hash = SUPPORTED_HASH.replace(
      'tjK03tRvEjqCcPwmgtddMkgjlXrk8U_b9rIvfeBMKCc',
      shortKey,
    );

    expect(isSupportedPasswordHash(hash)).toBe(false);
  });

  it('rejects malformed or non-canonical base64url', () => {
    expect(
      isSupportedPasswordHash(
        SUPPORTED_HASH.replace('MDEyMzQ1Njc4OWFiY2RlZg', 'MDEyMzQ1Njc4OWFiY2RlZg='),
      ),
    ).toBe(false);
    expect(
      isSupportedPasswordHash(
        SUPPORTED_HASH.replace('MDEyMzQ1Njc4OWFiY2RlZg', 'MDEyMzQ1Njc4OWFiY2RlZ*'),
      ),
    ).toBe(false);
  });

  it('rejects malformed or unsupported hashes without throwing', async () => {
    expect(isSupportedPasswordHash('fake')).toBe(false);
    await expect(verifyPassword('password', 'fake')).resolves.toBe(false);
  });

  it('requires the generated salt to match the supported format', async () => {
    await expect(hashPassword('password', { salt: Buffer.alloc(15) })).rejects.toThrowError(
      /exactly 16 bytes/,
    );
  });

  it('rejects empty passwords for hash creation', async () => {
    await expect(hashPassword('')).rejects.toThrowError(/must not be empty/);
  });
});
