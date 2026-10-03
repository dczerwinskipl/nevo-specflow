import { describe, expect, it } from 'vitest';

import {
  hashPassword,
  isSupportedPasswordHash,
  verifyPassword,
} from '../../../../src/auth/authentication/password/hash';
import { PASSWORD_MAX_LENGTH } from '../../../../src/auth/authentication/password/policy';

const CURRENT_HASH =
  '$scrypt$16384$8$5$MDEyMzQ1Njc4OWFiY2RlZg$' + 'yMHgG_FDESRF0j5gjhGLotSMPdnfefUcNNFPyNoQtJE';
const WEAKER_HASH =
  '$scrypt$16384$8$1$MDEyMzQ1Njc4OWFiY2RlZg$' + 'tjK03tRvEjqCcPwmgtddMkgjlXrk8U_b9rIvfeBMKCc';

describe('password hashing', () => {
  it('generates and verifies hashes with the current scrypt parameters', async () => {
    const hash = await hashPassword('correct horse battery staple', {
      salt: Buffer.from('0123456789abcdef', 'utf8'),
    });

    expect(hash).toBe(CURRENT_HASH);
    expect(isSupportedPasswordHash(hash)).toBe(true);
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  it('rejects the previous weaker work factor instead of creating a timing class', async () => {
    expect(isSupportedPasswordHash(WEAKER_HASH)).toBe(false);
    await expect(verifyPassword('correct horse battery staple', WEAKER_HASH)).resolves.toBe(false);
  });

  it.each(['$scrypt$32768$8$5', '$scrypt$16384$16$5', '$scrypt$16384$8$2'])(
    'rejects unsupported scrypt parameters: %s',
    (prefix) => {
      expect(isSupportedPasswordHash(CURRENT_HASH.replace('$scrypt$16384$8$5', prefix))).toBe(
        false,
      );
    },
  );

  it('rejects a hash with the wrong salt length', () => {
    const shortSalt = Buffer.alloc(15, 1).toString('base64url');
    const hash = CURRENT_HASH.replace('MDEyMzQ1Njc4OWFiY2RlZg', shortSalt);

    expect(isSupportedPasswordHash(hash)).toBe(false);
  });

  it('rejects a hash with the wrong derived key length', () => {
    const shortKey = Buffer.alloc(31, 2).toString('base64url');
    const hash = CURRENT_HASH.replace('yMHgG_FDESRF0j5gjhGLotSMPdnfefUcNNFPyNoQtJE', shortKey);

    expect(isSupportedPasswordHash(hash)).toBe(false);
  });

  it('rejects malformed or non-canonical base64url', () => {
    expect(
      isSupportedPasswordHash(
        CURRENT_HASH.replace('MDEyMzQ1Njc4OWFiY2RlZg', 'MDEyMzQ1Njc4OWFiY2RlZg='),
      ),
    ).toBe(false);
    expect(
      isSupportedPasswordHash(
        CURRENT_HASH.replace('MDEyMzQ1Njc4OWFiY2RlZg', 'MDEyMzQ1Njc4OWFiY2RlZ*'),
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

  it('rejects password hashes that could not be submitted through the login API', async () => {
    await expect(hashPassword('p'.repeat(PASSWORD_MAX_LENGTH + 1))).rejects.toThrowError(
      new RegExp(`at most ${String(PASSWORD_MAX_LENGTH)} characters`),
    );
  });

  it('rejects empty passwords for hash creation', async () => {
    await expect(hashPassword('')).rejects.toThrowError(/must not be empty/);
  });
  it('uses Unicode code-point length consistently with the HTTP schema', async () => {
    await expect(
      hashPassword('😀'.repeat(PASSWORD_MAX_LENGTH), {
        salt: Buffer.from('0123456789abcdef', 'utf8'),
      }),
    ).resolves.toMatch(/^\$scrypt\$/u);

    await expect(hashPassword('😀'.repeat(PASSWORD_MAX_LENGTH + 1))).rejects.toThrowError(
      new RegExp(`at most ${String(PASSWORD_MAX_LENGTH)} characters`),
    );
  });

  it('rejects over-limit verification input before password derivation', async () => {
    await expect(verifyPassword('😀'.repeat(PASSWORD_MAX_LENGTH + 1), CURRENT_HASH)).resolves.toBe(
      false,
    );
  });
});
