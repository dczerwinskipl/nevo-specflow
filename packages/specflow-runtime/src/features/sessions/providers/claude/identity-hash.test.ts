import { describe, expect, it, vi } from 'vitest';

import { createIdentityHash, type IdentityFiles } from './identity-hash';

/** A fake file system: one executable whose link target, size and modification time a test sets. */
function fakeFiles() {
  const file = { real: 'C:/claude/2.1/claude.exe', size: 300, mtimeMs: 1000, content: 'v1' };
  const hash = vi.fn((_path: string) => Promise.resolve(`sha-of-${file.content}`));
  const files: IdentityFiles = {
    realpath: () => Promise.resolve(file.real),
    stat: () => Promise.resolve({ size: file.size, mtimeMs: file.mtimeMs }),
    hash,
  };

  return { file, files, hash };
}

describe('the executable identity hash', () => {
  it('hashes an unchanged executable once', async () => {
    const { files, hash } = fakeFiles();
    const identityHash = createIdentityHash(files);

    expect(await identityHash('C:/bin/claude.exe')).toBe('sha-of-v1');
    expect(await identityHash('C:/bin/claude.exe')).toBe('sha-of-v1');
    expect(hash).toHaveBeenCalledTimes(1);
  });

  it('hashes again when the binary changed: its time, its size or where the link points', async () => {
    const { file, files, hash } = fakeFiles();
    const identityHash = createIdentityHash(files);
    await identityHash('C:/bin/claude.exe');

    file.content = 'v2';
    file.mtimeMs = 2000;
    expect(await identityHash('C:/bin/claude.exe')).toBe('sha-of-v2');
    file.content = 'v3';
    file.size = 301;
    expect(await identityHash('C:/bin/claude.exe')).toBe('sha-of-v3');
    file.content = 'v4';
    file.real = 'C:/claude/2.2/claude.exe';
    expect(await identityHash('C:/bin/claude.exe')).toBe('sha-of-v4');
    expect(hash).toHaveBeenCalledTimes(4);
  });

  it('keeps no hash of a file that changed while it was hashed, nor a failed hash', async () => {
    const { file, files, hash } = fakeFiles();
    hash.mockImplementationOnce(() => {
      file.mtimeMs = 3000;

      return Promise.resolve('sha-of-torn');
    });
    const identityHash = createIdentityHash(files);
    expect(await identityHash('C:/bin/claude.exe')).toBe('sha-of-torn');
    file.mtimeMs = 1000;
    expect(await identityHash('C:/bin/claude.exe')).toBe('sha-of-v1');

    file.mtimeMs = 4000;
    hash.mockRejectedValueOnce(new Error('EBUSY'));
    await expect(identityHash('C:/bin/claude.exe')).rejects.toThrow('EBUSY');
    expect(await identityHash('C:/bin/claude.exe')).toBe('sha-of-v1');
    expect(hash).toHaveBeenCalledTimes(4);
  });
});
