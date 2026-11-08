import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rename, symlink, link, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import type Koffi from 'koffi';
import { openWindowsDiscoveryWorkspace, type DiscoveryHandle } from './windows-reader';
import { scanDiscovery } from './scan';
import { parseDiscoveryRequest } from './contract';

const roots: string[] = [];
const handles: DiscoveryHandle[] = [];
afterEach(async () => {
  for (const h of handles.splice(0).reverse()) {
    h.close();
  }

  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'f14-reader-')));
  roots.push(root);
  const workspace = join(root, 'workspace');
  const outside = join(root, 'outside');
  await mkdir(join(workspace, 'nested'), { recursive: true });
  await mkdir(outside);
  await writeFile(join(workspace, 'nested', 'code.ts'), 'controlled needle');
  await writeFile(join(outside, 'secret.txt'), 'EXTERNAL_SECRET');
  const reader = openWindowsDiscoveryWorkspace(workspace);
  handles.push(reader);

  return { root, workspace, outside, reader };
}

const native = it.runIf(process.platform === 'win32' && process.arch === 'x64');

native('reads nested content through real handles and releases all identities', async () => {
  const f = await fixture();
  const result = scanDiscovery(
    f.reader,
    'search_text',
    parseDiscoveryRequest('search_text', { query: 'needle' }),
  );
  expect(result).toMatchObject({
    status: 'complete',
    matches: [{ path: 'nested/code.ts', line: 1, column: 12, text: 'controlled needle' }],
  });
  f.reader.close();
  await rename(f.workspace, join(f.root, 'released'));
});

native('refuses real junctions and hardlinks to outside content', async () => {
  const f = await fixture();
  f.reader.close();
  await symlink(f.outside, join(f.workspace, 'junction'), 'junction');
  await link(join(f.outside, 'secret.txt'), join(f.workspace, 'hardlink.txt'));
  const reader = openWindowsDiscoveryWorkspace(f.workspace);
  handles.push(reader);
  const result = scanDiscovery(
    reader,
    'search_text',
    parseDiscoveryRequest('search_text', { query: 'EXTERNAL_SECRET' }),
  );
  expect(result.status).toBe('partial');
  expect(result.matches).toEqual([]);
  expect(result.counts.errors).toBe(2);
  expect(() => openWindowsDiscoveryWorkspace(join(f.workspace, 'junction'))).toThrow();
});

native('rejects Windows file and directory symbolic links', async ({ skip }) => {
  const f = await fixture();
  f.reader.close();
  try {
    await symlink(join(f.outside, 'secret.txt'), join(f.workspace, 'file-link'), 'file');
    await symlink(f.outside, join(f.workspace, 'dir-link'), 'dir');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      skip('Windows symbolic-link privilege is unavailable; junctions are tested separately.');

      return;
    }

    throw error;
  }

  const reader = openWindowsDiscoveryWorkspace(f.workspace);
  handles.push(reader);
  const result = scanDiscovery(
    reader,
    'search_text',
    parseDiscoveryRequest('search_text', { query: 'EXTERNAL_SECRET' }),
  );
  expect(result.status).toBe('partial');
  expect(result.counts.errors).toBe(2);
  expect(result.matches).toEqual([]);
});

native('does not reopen a replaced directory by its stale name', async () => {
  const f = await fixture();
  const entry = [...f.reader.entries()].find((e) => e.name === 'nested')!;
  await expect(
    rename(join(f.workspace, 'nested'), join(f.workspace, 'moved')),
  ).rejects.toMatchObject({ code: 'EBUSY' });
  f.reader.close();
  await rename(join(f.workspace, 'nested'), join(f.workspace, 'moved'));
  await symlink(f.outside, join(f.workspace, 'nested'), 'junction');
  const reader = openWindowsDiscoveryWorkspace(f.workspace);
  handles.push(reader);
  expect(() => reader.child(entry)).toThrow();
  const result = scanDiscovery(
    reader,
    'search_text',
    parseDiscoveryRequest('search_text', { path: 'nested', query: 'EXTERNAL_SECRET' }),
  );
  expect(result.status).toBe('failed');
  expect(result.matches).toEqual([]);
});

native('rejects an enumerated file moved outside before content read', async () => {
  const f = await fixture();
  const dir = f.reader.child([...f.reader.entries()].find((e) => e.name === 'nested')!);
  handles.push(dir);
  const entry = [...dir.entries()][0]!;
  await rename(join(f.workspace, 'nested', 'code.ts'), join(f.outside, 'moved.ts'));
  await writeFile(join(f.workspace, 'nested', 'code.ts'), 'safe replacement');
  expect(() => dir.child(entry)).toThrow();
  const replacement = dir.child([...dir.entries()][0]!);
  handles.push(replacement);
  expect(replacement.read(Number(replacement.size)).toString()).toBe('safe replacement');
});

native('pins file identities and denies content writers while reading', async () => {
  const f = await fixture();
  const dir = f.reader.child([...f.reader.entries()][0]!);
  handles.push(dir);
  const file = dir.child([...dir.entries()][0]!);
  handles.push(file);
  await expect(
    writeFile(join(f.workspace, 'nested', 'code.ts'), 'replacement'),
  ).rejects.toMatchObject({ code: 'EBUSY' });
  await expect(
    rename(join(f.workspace, 'nested'), join(f.workspace, 'changed')),
  ).rejects.toMatchObject({ code: 'EBUSY' });
  expect(file.read(Number(file.size)).toString()).toBe('controlled needle');
});

native('refuses device namespaces, root path indirection and Win32 aliases', async () => {
  const f = await fixture();
  for (const path of [
    '\\\\?\\' + f.workspace,
    f.workspace + '.',
    f.workspace + ':stream',
    join(f.workspace, '..', 'workspace') + '\\..',
  ]) {
    expect(() => openWindowsDiscoveryWorkspace(path)).toThrow();
  }
});

native(
  'does not follow an in-place junction mutation through an already held directory',
  async () => {
    const f = await fixture();
    await mkdir(join(f.workspace, 'mutating'));
    const koffi = createRequire(import.meta.url)('koffi') as typeof Koffi;
    const kernel = koffi.load(join(process.env.SystemRoot!, 'System32', 'kernel32.dll'));
    const open = kernel.func(
      'void * __stdcall CreateFileW(const char16_t *, uint32_t, uint32_t, void *, uint32_t, uint32_t, void *)',
    );
    const ioctl = kernel.func(
      'int __stdcall DeviceIoControl(void *, uint32_t, void *, uint32_t, void *, uint32_t, _Out_ void *, void *)',
    );
    const close = kernel.func('int __stdcall CloseHandle(void *)');
    // Attribute-only access is deliberately outside share-write exclusion. Prove
    // handle-relative traversal remains safe even when reparse mutation succeeds.
    const attacker: unknown = open(
      join(f.workspace, 'mutating'),
      0x100,
      7,
      null,
      3,
      0x02200000,
      null,
    );
    expect(attacker && koffi.address(attacker) !== 0xffffffffffffffffn).toBeTruthy();
    try {
      const entry = [...f.reader.entries()].find((e) => e.name === 'mutating')!;
      const held = f.reader.child(entry);
      handles.push(held);
      const substitute = Buffer.from('\\??\\' + f.outside, 'utf16le');
      const print = Buffer.from(f.outside, 'utf16le');
      const data = Buffer.alloc(16 + substitute.length + 2 + print.length + 2);
      data.writeUInt32LE(0xa0000003, 0);
      data.writeUInt16LE(data.length - 8, 4);
      data.writeUInt16LE(substitute.length, 10);
      data.writeUInt16LE(substitute.length + 2, 12);
      data.writeUInt16LE(print.length, 14);
      substitute.copy(data, 16);
      print.copy(data, 18 + substitute.length);
      expect(ioctl(attacker, 0x900a4, data, data.length, null, 0, Buffer.alloc(4), null)).toBe(1);
      expect([...held.entries()]).toEqual([]);
      expect(() => f.reader.child(entry)).toThrow();
      const result = scanDiscovery(
        f.reader,
        'search_text',
        parseDiscoveryRequest('search_text', { query: 'EXTERNAL_SECRET' }),
      );
      expect(result.status).toBe('partial');
      expect(result.matches).toEqual([]);
    } finally {
      close(attacker);
    }
  },
);
