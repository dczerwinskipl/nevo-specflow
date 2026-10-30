import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Koffi from 'koffi';

export const MAX_NATIVE_CREDENTIAL_BYTES = 16_384;
const NATIVE_TARGET = 'gemini:antigravity';

/** Exact native consumer profile; never enumerates or falls back to another account. */
export function readAntigravityWindowsCredential(): Buffer {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('Antigravity native account inspection requires Windows x64.');
  }

  const require = createRequire(import.meta.url);
  const packaged = new URL('./native/koffi/index.cjs', import.meta.url);
  const koffi = require(existsSync(packaged) ? fileURLToPath(packaged) : 'koffi') as typeof Koffi;
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (!systemRoot || !isAbsolute(systemRoot)) {
    throw new Error('Windows credential service unavailable.');
  }

  const library = koffi.load(join(systemRoot, 'System32', 'advapi32.dll'));
  const read = library.func(
    'int __stdcall CredReadW(const char16_t *, uint32_t, uint32_t, _Out_ void **)',
  ) as (target: string, type: number, flags: number, output: unknown[]) => number;
  const free = library.func('void __stdcall CredFree(void *)') as (pointer: unknown) => void;
  const output: unknown[] = [null];
  if (!read(NATIVE_TARGET, 1, 0, output) || !output[0]) {
    throw new Error('Antigravity native account unavailable.');
  }

  try {
    // CREDENTIALW Windows x64 offsets; borrowed memory stays owned by CredFree.
    const type: unknown = koffi.decode(output[0], 4, 'uint32_t');
    const size: unknown = koffi.decode(output[0], 32, 'uint32_t');
    if (type !== 1 || typeof size !== 'number' || size < 1 || size > MAX_NATIVE_CREDENTIAL_BYTES) {
      throw new Error('Antigravity native credential exceeds supported bounds.');
    }

    const pointer: unknown = koffi.decode(output[0], 40, 'void *');
    if (!pointer) {
      throw new Error('Antigravity native credential unavailable.');
    }

    // Copy before freeing the OS allocation. Caller clears this owned copy.
    return Buffer.from(new Uint8Array(koffi.view(pointer, size)));
  } finally {
    free(output[0]);
  }
}
