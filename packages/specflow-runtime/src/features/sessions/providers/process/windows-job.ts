import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type Koffi from 'koffi';
import type { ChildProcess } from 'node:child_process';
import type { ProcessDisposition } from './termination';

let kernelLibrary: ReturnType<typeof Koffi.load> | undefined;

// The bootstrap cannot start a provider before joining the Runtime-owned job. Its
// temporary handle is closed before dispatch, leaving Runtime as the sole owner.
// Unlike assigning an already running provider, this leaves no unowned dispatch gap.
const bootstrap = String.raw`
const { spawn } = require('node:child_process');
const koffi = require(process.argv[1]);
const kernel = koffi.load(process.argv[2]);
const open = kernel.func('void * __stdcall OpenJobObjectW(uint32_t, int, const char16_t *)');
const assign = kernel.func('int __stdcall AssignProcessToJobObject(void *, void *)');
const current = kernel.func('void * __stdcall GetCurrentProcess()');
const close = kernel.func('int __stdcall CloseHandle(void *)');
const job = open(1, 0, process.argv[3]);
if (!job) process.exit(125);
const assigned = assign(job, current());
close(job);
if (!assigned || !process.connected) process.exit(125);
process.once('disconnect', () => process.exit(125));
process.once('message', message => {
  if (message?.type !== 'start') process.exit(125);
  const child = spawn(process.argv[4], process.argv.slice(5), {
    shell: false, windowsHide: true, stdio: 'inherit',
    env: message.environment,
  });
  child.once('error', error => {
    process.send(error.code === 'ENOENT' ? 'unavailable' : 'failed', () => process.exit(126));
  });
  child.once('spawn', () => process.send('started'));
  child.once('exit', code => process.exit(code ?? 1));
});
process.send('owned');
`;

/** Job ownership is process liveness evidence, not an OS security sandbox. */
export function createWindowsJob(executable: string, args: readonly string[]) {
  const require = createRequire(import.meta.url);
  const packaged = new URL('./native/koffi/index.cjs', import.meta.url);
  const koffiPath = existsSync(packaged) ? fileURLToPath(packaged) : require.resolve('koffi');
  const koffi = require(koffiPath) as typeof Koffi;
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (!systemRoot || !isAbsolute(systemRoot))
    throw new Error('Windows system directory unavailable.');
  const kernelPath = join(systemRoot, 'System32', 'kernel32.dll');
  const kernel = (kernelLibrary ??= koffi.load(kernelPath));
  const create = kernel.func('void * __stdcall CreateJobObjectW(void *, const char16_t *)') as (
    security: null,
    name: string,
  ) => bigint | null;
  const configure = kernel.func(
    'int __stdcall SetInformationJobObject(void *, int, void *, uint32_t)',
  ) as (handle: bigint, info: number, buffer: Buffer, size: number) => number;
  const query = kernel.func(
    'int __stdcall QueryInformationJobObject(void *, int, _Out_ void *, uint32_t, void *)',
  ) as (handle: bigint, info: number, buffer: Buffer, size: number, returned: null) => number;
  const terminate = kernel.func('int __stdcall TerminateJobObject(void *, uint32_t)') as (
    handle: bigint,
    code: number,
  ) => number;
  const close = kernel.func('int __stdcall CloseHandle(void *)') as (handle: bigint) => number;
  const name = 'Local\\NevoSession-' + randomUUID();
  const job = create(null, name);
  if (!job) throw new Error('Windows job creation failed.');
  // JOBOBJECT_EXTENDED_LIMIT_INFORMATION: 144 bytes on Windows x64/arm64,
  // 112 on ia32. LimitFlags follows two LARGE_INTEGER fields at offset 16.
  const limits = Buffer.alloc(process.arch === 'ia32' ? 112 : 144);
  limits.writeUInt32LE(0x2000, 16); // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE; no breakaway.
  if (!configure(job, 9, limits, limits.length)) {
    close(job);
    throw new Error('Windows job configuration failed.');
  }
  let closed = false;
  let settlement: Promise<ProcessDisposition> | undefined;
  function active() {
    const accounting = Buffer.alloc(48); // JOBOBJECT_BASIC_ACCOUNTING_INFORMATION.
    if (!query(job!, 1, accounting, accounting.length, null)) return undefined;
    return accounting.readUInt32LE(40);
  }
  return {
    executable: process.execPath,
    // A configured NODE_OPTIONS/NODE_PATH must only reach the owned provider,
    // never the trusted Node bootstrap before membership is established.
    environment: { SystemRoot: systemRoot },
    args: ['-e', bootstrap, koffiPath, kernelPath, name, executable, ...args],
    ready(child: ChildProcess, environment: Readonly<Record<string, string>>) {
      if (closed || child.exitCode !== null || child.signalCode !== null)
        return Promise.reject(new Error('Windows job bootstrap is unavailable.'));
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => finish(new Error('Windows job startup timed out.')), 5000);
        const onExit = () => finish(new Error('Windows job bootstrap failed.'));
        let owned = false;
        const onMessage = (message: unknown) => {
          if (message === 'unavailable' || message === 'failed')
            return finish(
              Object.assign(new Error('Provider process could not start.'), {
                code: message === 'unavailable' ? 'UNAVAILABLE' : 'START_FAILED',
              }),
            );
          if (message === 'started' && owned) return finish();
          if (message !== 'owned' || owned)
            return finish(new Error('Invalid Windows job handshake.'));
          if (closed || active() !== 1)
            return finish(new Error('Windows job ownership unavailable.'));
          owned = true;
          child.send({ type: 'start', environment }, (error) => {
            if (error) finish(error);
          });
        };
        function finish(error?: Error) {
          clearTimeout(timeout);
          child.removeListener('message', onMessage);
          child.removeListener('exit', onExit);
          child.removeListener('error', onExit);
          if (error) reject(error);
          else resolve();
        }
        child.on('message', onMessage);
        child.once('exit', onExit);
        child.once('error', onExit);
      });
    },
    stop(): Promise<ProcessDisposition> {
      settlement ??= (async () => {
        try {
          if (active() === 0) return { state: 'stopped', reason: 'group-exited' } as const;
          if (!terminate(job, 1)) return { state: 'unknown', reason: 'unverified-tree' } as const;
          const deadline = performance.now() + 2000;
          do {
            if (active() === 0) return { state: 'stopped', reason: 'tree-killed' } as const;
            await delay(20);
          } while (performance.now() < deadline);
          return { state: 'unknown', reason: 'unverified-tree' } as const;
        } finally {
          closed = true;
          close(job);
        }
      })();
      return settlement;
    },
  };
}
