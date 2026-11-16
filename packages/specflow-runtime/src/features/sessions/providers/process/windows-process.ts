import { windowsKernel } from './windows-job';

type Handle = bigint;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const JOB_OBJECT_QUERY = 0x0004;
const ERROR_FILE_NOT_FOUND = 2;
const ERROR_INVALID_PARAMETER = 87;
const STILL_ACTIVE = 259;

let bound: ReturnType<typeof bind> | undefined;
function bind() {
  const { kernel } = windowsKernel();

  return {
    openProcess: kernel.func('void * __stdcall OpenProcess(uint32_t, int, uint32_t)') as (
      access: number,
      inherit: number,
      pid: number,
    ) => Handle | null,
    times: kernel.func(
      'int __stdcall GetProcessTimes(void *, _Out_ void *, _Out_ void *, _Out_ void *, _Out_ void *)',
    ) as (handle: Handle, created: Buffer, exited: Buffer, kernel: Buffer, user: Buffer) => number,
    exitCode: kernel.func('int __stdcall GetExitCodeProcess(void *, _Out_ void *)') as (
      handle: Handle,
      code: Buffer,
    ) => number,
    openJob: kernel.func('void * __stdcall OpenJobObjectW(uint32_t, int, const char16_t *)') as (
      access: number,
      inherit: number,
      name: string,
    ) => Handle | null,
    query: kernel.func(
      'int __stdcall QueryInformationJobObject(void *, int, _Out_ void *, uint32_t, void *)',
    ) as (handle: Handle, info: number, buffer: Buffer, size: number, returned: null) => number,
    // Koffi preserves the last error of the preceding call from Node and V8.
    lastError: kernel.func('uint32_t __stdcall GetLastError()') as () => number,
    close: kernel.func('int __stdcall CloseHandle(void *)') as (handle: Handle) => number,
  };
}

function win32() {
  return (bound ??= bind());
}

function creationTime(api: ReturnType<typeof win32>, handle: Handle): string | undefined {
  const created = Buffer.alloc(8);
  if (!api.times(handle, created, Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(8))) {
    return undefined;
  }

  return created.readBigUInt64LE(0).toString();
}

/** The creation time of a running process, read through a query-only handle. */
export function windowsProcessCreation(pid: number): string | undefined {
  const api = win32();
  const handle = api.openProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (!handle) {
    return undefined;
  }

  try {
    return creationTime(api, handle);
  } finally {
    api.close(handle);
  }
}

/**
 * Whether the exact process (PID and creation time) still runs. `gone`: no process has the PID, a
 * process created at another time holds it (reuse), or the process object has exited. Anything the
 * query cannot establish is `unknown`.
 */
export function windowsRootState(pid: number, createdAt: string): 'present' | 'gone' | 'unknown' {
  const api = win32();
  const handle = api.openProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (!handle) {
    return api.lastError() === ERROR_INVALID_PARAMETER ? 'gone' : 'unknown';
  }

  try {
    const created = creationTime(api, handle);
    if (created === undefined) {
      return 'unknown';
    }

    if (created !== createdAt) {
      return 'gone';
    }

    const code = Buffer.alloc(4);
    if (!api.exitCode(handle, code)) {
      return 'unknown';
    }

    return code.readUInt32LE(0) === STILL_ACTIVE ? 'present' : 'gone';
  } finally {
    api.close(handle);
  }
}

/**
 * The Job Object by its name: `gone` when no such object exists (its last handle closed, which
 * with kill-on-close terminated every member), `empty` with zero active processes.
 */
export function windowsJobState(name: string): 'active' | 'empty' | 'gone' | 'unknown' {
  const api = win32();
  const handle = api.openJob(JOB_OBJECT_QUERY, 0, name);
  if (!handle) {
    return api.lastError() === ERROR_FILE_NOT_FOUND ? 'gone' : 'unknown';
  }

  try {
    const accounting = Buffer.alloc(48); // JOBOBJECT_BASIC_ACCOUNTING_INFORMATION.
    if (!api.query(handle, 1, accounting, accounting.length, null)) {
      return 'unknown';
    }

    return accounting.readUInt32LE(40) === 0 ? 'empty' : 'active';
  } finally {
    api.close(handle);
  }
}
