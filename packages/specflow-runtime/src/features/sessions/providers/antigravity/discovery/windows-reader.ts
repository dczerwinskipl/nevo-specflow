import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join, win32 } from 'node:path';
import type Koffi from 'koffi';
import { assertWindowsPathComponent as component } from '../../process/windows-path';

export interface DiscoveryEntry {
  name: string;
  id: bigint;
  directory: boolean;
  reparse: boolean;
}
export interface DiscoveryHandle {
  directory: boolean;
  size: bigint;
  entries(): Iterable<DiscoveryEntry>;
  child(entry: DiscoveryEntry): DiscoveryHandle;
  read(maxBytes: number): Buffer;
  close(): void;
}

/** No descendant is opened by path. Enumerated IDs are opened without reparsing,
 * then checked against their expected normalized volume-GUID path before use.
 * Handles deny content writes/delete and stay open through reads/enumeration. */
export function openWindowsDiscoveryWorkspace(workspace: string): DiscoveryHandle {
  if (
    process.platform !== 'win32' ||
    process.arch !== 'x64' ||
    !/^[a-z]:\\/i.test(workspace) ||
    win32.normalize(workspace) !== workspace
  ) {
    throw new Error('Discovery requires a physical local Windows workspace.');
  }

  const segments = workspace.slice(3).split('\\').filter(Boolean);
  segments.forEach(component);
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (!systemRoot || !isAbsolute(systemRoot)) {
    throw new Error('Windows system directory unavailable.');
  }

  const require = createRequire(import.meta.url);
  const packaged = new URL('./native/koffi/index.cjs', import.meta.url);
  const koffi = require(
    existsSync(packaged) ? fileURLToPath(packaged) : require.resolve('koffi'),
  ) as typeof Koffi;
  const kernel = koffi.load(join(systemRoot, 'System32', 'kernel32.dll'));
  const open = kernel.func(
    'void * __stdcall CreateFileW(const char16_t *, uint32_t, uint32_t, void *, uint32_t, uint32_t, void *)',
  );
  const byId = kernel.func(
    'void * __stdcall OpenFileById(void *, void *, uint32_t, uint32_t, void *, uint32_t)',
  );
  const info = kernel.func('int __stdcall GetFileInformationByHandle(void *, _Out_ void *)');
  const enumerate = kernel.func(
    'int __stdcall GetFileInformationByHandleEx(void *, int, _Out_ void *, uint32_t)',
  );
  const finalPath = kernel.func(
    'uint32_t __stdcall GetFinalPathNameByHandleW(void *, _Out_ void *, uint32_t, uint32_t)',
  );
  const read = kernel.func(
    'int __stdcall ReadFile(void *, _Out_ void *, uint32_t, _Out_ void *, void *)',
  );
  const close = kernel.func('int __stdcall CloseHandle(void *)');
  const lastError = kernel.func('uint32_t __stdcall GetLastError()');
  const volumeInfo = kernel.func(
    'int __stdcall GetVolumeInformationByHandleW(void *, void *, uint32_t, void *, void *, void *, _Out_ void *, uint32_t)',
  );
  const flags = 0x02000000 | 0x00200000; // BACKUP_SEMANTICS | OPEN_REPARSE_POINT
  const ancestors: DiscoveryHandle[] = [];

  function wrap(raw: unknown, expected?: string): DiscoveryHandle {
    if (!raw || koffi.address(raw) === 0xffffffffffffffffn) {
      throw new Error('Discovery handle unavailable.');
    }

    let closed = false;
    const release = () => {
      if (!closed) {
        closed = true;
        close(raw);
      }
    };

    try {
      if (expected === undefined) {
        const filesystem = Buffer.alloc(64);
        if (
          !volumeInfo(raw, null, 0, null, null, null, filesystem, 32) ||
          filesystem.toString('utf16le').split('\0')[0] !== 'NTFS'
        ) {
          throw new Error('Confined discovery requires a local NTFS volume.');
        }
      }

      const details = Buffer.alloc(52);
      const pathBytes = Buffer.alloc(65536);
      const length = finalPath(raw, pathBytes, pathBytes.length / 2, 1) as number;
      if (!info(raw, details) || !length || length >= pathBytes.length / 2) {
        throw new Error('Discovery identity unavailable.');
      }

      const path = pathBytes.subarray(0, length * 2).toString('utf16le');
      const attributes = details.readUInt32LE(0);
      const directory = !!(attributes & 0x10);
      if (
        !path.startsWith('\\\\?\\Volume{') ||
        (expected !== undefined && path !== expected) ||
        attributes & 0x400 ||
        (!directory && details.readUInt32LE(40) !== 1)
      ) {
        throw new Error('Discovery identity is not a confined ordinary entry.');
      }

      return {
        directory,
        size: (BigInt(details.readUInt32LE(32)) << 32n) | BigInt(details.readUInt32LE(36)),
        *entries() {
          if (closed || !directory) {
            throw new Error('Discovery directory is closed.');
          }

          const bytes = Buffer.alloc(64 * 1024);
          let first = true;
          for (;;) {
            const ok: unknown = enumerate(raw, first ? 11 : 10, bytes, bytes.length);
            first = false;
            if (!ok) {
              if (lastError() === 18) {
                return;
              } // ERROR_NO_MORE_FILES

              throw new Error('Discovery directory enumeration failed.');
            }

            let offset = 0;
            for (;;) {
              if (offset + 104 > bytes.length) {
                throw new Error('Invalid native directory record.');
              }

              const next = bytes.readUInt32LE(offset);
              const nameBytes = bytes.readUInt32LE(offset + 60);
              if (
                nameBytes % 2 ||
                nameBytes > 510 ||
                offset + 104 + nameBytes > bytes.length ||
                (next && (next < 104 + nameBytes || next % 8 || offset + next >= bytes.length))
              ) {
                throw new Error('Invalid native directory name.');
              }

              const name = bytes
                .subarray(offset + 104, offset + 104 + nameBytes)
                .toString('utf16le');
              if (name !== '.' && name !== '..') {
                component(name);
                const attr = bytes.readUInt32LE(offset + 56);
                yield {
                  name,
                  id: bytes.readBigInt64LE(offset + 96),
                  directory: !!(attr & 0x10),
                  reparse: !!(attr & 0x400),
                };
              }

              if (!next) {
                break;
              }

              offset += next;
            }
          }
        },
        child(entry) {
          if (closed || !directory || entry.reparse) {
            throw new Error('Discovery child is not admissible.');
          }

          component(entry.name);
          const descriptor = Buffer.alloc(24);
          descriptor.writeUInt32LE(24, 0);
          descriptor.writeInt32LE(0, 4); // FileIdType (NTFS 64-bit ID)
          descriptor.writeBigInt64LE(entry.id, 8);

          return wrap(
            byId(raw, descriptor, 0x81, 1, null, flags),
            path.replace(/\\$/, '') + '\\' + entry.name,
          );
        },
        read(maxBytes) {
          if (
            closed ||
            directory ||
            !Number.isSafeInteger(maxBytes) ||
            maxBytes < 0 ||
            maxBytes > 256 * 1024
          ) {
            throw new Error('Invalid discovery read.');
          }

          const bytes = Buffer.alloc(maxBytes);
          const received = Buffer.alloc(4);
          if (!read(raw, bytes, maxBytes, received, null)) {
            throw new Error('Discovery file read failed.');
          }

          return bytes.subarray(0, received.readUInt32LE(0));
        },
        close: release,
      };
    } catch (error) {
      release();

      throw error;
    }
  }

  try {
    let current = wrap(open(workspace.slice(0, 3), 0x81, 1, null, 3, flags, null));
    ancestors.push(current);
    if (segments.length > 64) {
      throw new Error('Discovery workspace path is too deep.');
    }

    for (const segment of segments) {
      // Locate a long-name entry on the held parent; short-name aliases are not followed.
      let entry: DiscoveryEntry | undefined;
      let visited = 0;
      for (const candidate of current.entries()) {
        if (++visited > 10000) {
          throw new Error('Discovery ancestor lookup exceeds its budget.');
        }

        if (candidate.name === segment) {
          entry = candidate;
          break;
        }
      }

      if (!entry?.directory) {
        throw new Error('Physical discovery workspace unavailable.');
      }

      current = current.child(entry);
      ancestors.push(current);
    }

    const root = current;
    // The captured root object is the authority from here on. Descendants are
    // opened by ID and checked against its captured GUID path, never by walking
    // ancestor names again. Do not retain locks on unrelated ancestor trees.
    for (const ancestor of ancestors.splice(0, ancestors.length - 1).reverse()) {
      ancestor.close();
    }

    return {
      ...root,
      close() {
        for (const handle of ancestors.splice(0).reverse()) {
          handle.close();
        }
      },
    };
  } catch (error) {
    for (const handle of ancestors.reverse()) {
      handle.close();
    }

    throw error;
  }
}
