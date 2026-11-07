import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import type Koffi from 'koffi';

export interface NativeFileAccess {
  created: boolean;
  close(): void;
}

let library: ReturnType<typeof Koffi.load> | undefined;

const File = {
  readData: 0x1,
  readAttributes: 0x80,
  shareRead: 0x1,
  shareWrite: 0x2,
  openExisting: 3,
  openAlways: 4,
  openReparsePoint: 0x00200000,
  backupSemantics: 0x02000000,
  directory: 0x10,
  reparsePoint: 0x400,
  alreadyExists: 183,
} as const;

/** Keep path components open through native use. Sharing permits file content
 * writes, while directory replacement and reparse-point mutation remain blocked. */
export function acquireWindowsFileAccess(
  workspace: string,
  target: string,
  options: { directory: boolean; create: boolean },
): NativeFileAccess {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('Native path ownership is unavailable on this platform.');
  }

  const root = resolve(workspace);
  const path = resolve(target);
  const within = relative(root, path);
  if (
    !isAbsolute(workspace) ||
    !isAbsolute(target) ||
    within === '..' ||
    within.startsWith('..' + sep) ||
    isAbsolute(within) ||
    path.startsWith('\\\\') ||
    path.includes('\0') ||
    within.split(sep).some((component) => /[ .]$|:/.test(component))
  ) {
    throw new Error('A local workspace path is required.');
  }

  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (!systemRoot || !isAbsolute(systemRoot)) {
    throw new Error('Windows system directory unavailable.');
  }

  const require = createRequire(import.meta.url);
  const packaged = new URL('./native/koffi/index.cjs', import.meta.url);
  const koffi = require(
    existsSync(packaged) ? fileURLToPath(packaged) : require.resolve('koffi'),
  ) as typeof Koffi;
  const kernel = (library ??= koffi.load(join(systemRoot, 'System32', 'kernel32.dll')));
  const open = kernel.func(
    'void * __stdcall CreateFileW(const char16_t *, uint32_t, uint32_t, void *, uint32_t, uint32_t, void *)',
  );
  const error = kernel.func('uint32_t __stdcall GetLastError()');
  const info = kernel.func('int __stdcall GetFileInformationByHandle(void *, _Out_ void *)');
  const mkdir = kernel.func('int __stdcall CreateDirectoryW(const char16_t *, void *)');
  const close = kernel.func('int __stdcall CloseHandle(void *)');
  const handles: unknown[] = [];
  let closed = false;

  function release() {
    if (closed) {
      return;
    }

    closed = true;
    for (const handle of handles.reverse()) {
      close(handle);
    }
  }

  function pin(value: string, directory: boolean, create: boolean) {
    // FILE_READ_DATA is essential. Attribute-only handles do not prevent rename.
    const handle: unknown = open(
      value,
      File.readData | File.readAttributes,
      directory ? File.shareRead : File.shareRead | File.shareWrite,
      null,
      create ? File.openAlways : File.openExisting,
      File.openReparsePoint | (directory ? File.backupSemantics : 0),
      null,
    );
    const lastError: unknown = error();
    if (!handle || koffi.address(handle) === 0xffffffffffffffffn) {
      throw new Error('Native path ownership could not be acquired.');
    }

    handles.push(handle);
    const details = Buffer.alloc(52);
    if (!info(handle, details)) {
      throw new Error('Native path identity is unavailable.');
    }

    const attributes = details.readUInt32LE(0);
    if (
      attributes & File.reparsePoint ||
      !!(attributes & File.directory) !== directory ||
      (!directory && details.readUInt32LE(40) !== 1)
    ) {
      throw new Error('Native path identity is outside the supported file profile.');
    }

    return create && lastError !== File.alreadyExists;
  }

  try {
    // Pin ancestors before descending. Opening with OPEN_REPARSE_POINT prevents
    // a replacement junction from being followed during acquisition.
    const drive = parse(root).root;
    let current = drive;
    pin(current, true, false);
    for (const component of root.slice(drive.length).split(sep).filter(Boolean)) {
      current = join(current, component);
      pin(current, true, false);
    }

    const components = within.split(sep).filter(Boolean);
    const directories = options.directory ? components : components.slice(0, -1);
    for (const component of directories) {
      current = join(current, component);
      if (options.create && !mkdir(current, null) && error() !== File.alreadyExists) {
        throw new Error('Native target directory could not be created.');
      }

      pin(current, true, false);
    }

    const created = options.directory ? false : pin(path, false, options.create);

    return { created, close: release };
  } catch (failure) {
    release();

    throw failure;
  }
}
