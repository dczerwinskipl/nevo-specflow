import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

export interface CleanupIssue {
  resource: 'mcp' | 'transport' | 'listener' | 'temporary-files';
  code: 'CLEANUP_FAILED' | 'CLEANUP_TIMEOUT' | 'PROCESS_NOT_STOPPED';
}
export async function createInvocationScope(root: string, invocationId: string) {
  if (
    !isAbsolute(root) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(invocationId)
  )
    throw new Error('Verified provider temporary context is required.');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(root, 'invocation-' + invocationId + '-'));
  const cleanups: { resource: CleanupIssue['resource']; run: () => Promise<void> }[] = [];
  const writes = new Set<Promise<void>>();
  let allocatedBytes = 0,
    files = 0;
  let closing: Promise<readonly CleanupIssue[]> | undefined;
  return {
    directory,
    defer(
      resource: Exclude<CleanupIssue['resource'], 'temporary-files'>,
      run: () => Promise<void>,
    ) {
      if (closing) throw new Error('Provider resource scope is closing.');
      if (cleanups.length >= 64) throw new Error('Provider resource cleanup capacity reached.');
      cleanups.push({ resource, run });
    },
    async temporaryFile(name: string, body: string) {
      if (
        closing ||
        !/^[a-z0-9_-]{1,48}\.(json|txt)$/.test(name) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(name)
      )
        throw new Error('Invalid provider temporary file.');
      const path = join(directory, name);
      const bytes = Buffer.byteLength(body);
      if (++files > 32 || bytes > 1024 * 1024 || (allocatedBytes += bytes) > 4 * 1024 * 1024)
        throw new Error('Provider temporary files exceed their budget.');
      const writing = writeFile(path, body, { flag: 'wx', mode: 0o600 });
      writes.add(writing);
      try {
        await writing;
      } finally {
        writes.delete(writing);
      }
      return path;
    },
    close(processStopped = true) {
      closing ??= (async () => {
        const issues: CleanupIssue[] = [];
        const deadline = performance.now() + 1000;
        for (const cleanup of cleanups.reverse()) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              cleanup.run(),
              new Promise<never>((_resolve, reject) => {
                timer = setTimeout(
                  () => reject(new Error('timeout')),
                  Math.max(0, deadline - performance.now()),
                );
              }),
            ]);
          } catch (error) {
            issues.push({
              resource: cleanup.resource,
              code:
                error instanceof Error && error.message === 'timeout'
                  ? 'CLEANUP_TIMEOUT'
                  : 'CLEANUP_FAILED',
            });
          } finally {
            clearTimeout(timer);
          }
        }
        cleanups.length = 0;
        let writesSettled = true;
        if (writes.size) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              Promise.allSettled([...writes]),
              new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error('timeout')), 1000);
              }),
            ]);
          } catch {
            writesSettled = false;
            issues.push({ resource: 'temporary-files', code: 'CLEANUP_TIMEOUT' });
          } finally {
            clearTimeout(timer);
          }
        }
        if (!processStopped)
          issues.push({ resource: 'temporary-files', code: 'PROCESS_NOT_STOPPED' });
        else if (writesSettled && !issues.some((issue) => issue.code === 'CLEANUP_TIMEOUT'))
          try {
            const target = relative(root, directory);
            if (!target || target.startsWith('..') || isAbsolute(target))
              throw new Error('Invalid temporary cleanup target.');
            await rm(directory, { recursive: true, force: true });
          } catch {
            issues.push({ resource: 'temporary-files', code: 'CLEANUP_FAILED' });
          }
        return issues;
      })();
      return closing;
    },
  };
}
export type InvocationScope = Awaited<ReturnType<typeof createInvocationScope>>;
