import { mkdir, readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { rpcObject } from './rpc';
import type { CodexPeer } from './connection';
import { codexSandbox, codexModes } from './modes';

/** Exercise only a trusted fixed program in owned scratch, never the project.
 * A denied write alone is insufficient: the program must run, and the writer
 * control must positively create the expected file using the requested boundary. */
export async function probeCodexBoundary(
  peer: Pick<CodexPeer, 'request'>,
  directory: string,
  signal: AbortSignal,
) {
  const root = join(directory, 'boundary');
  await mkdir(root, { recursive: true });
  const denied = join(root, 'read-only.txt');
  const writable = join(root, 'write.txt');
  const outside = join(directory, 'outside-write-root.txt');
  const program = [
    "const fs=require('node:fs');process.stdout.write('specflow-probe-start\\n');",
    "try{fs.writeFileSync(process.argv[1],'specflow-probe');process.stdout.write('written');process.exitCode=42;}",
    "catch(error){process.stdout.write(['EACCES','EPERM','EROFS'].includes(error.code)?'denied':'unexpected');process.exitCode=23;}",
  ].join('');
  async function run(mode: (typeof codexModes)[number], path: string) {
    return rpcObject(
      await peer.request(
        'command/exec',
        {
          command: [process.execPath, '-e', program, path],
          cwd: root,
          sandboxPolicy: codexSandbox(root, mode),
          timeoutMs: 7000,
        },
        signal,
      ),
    );
  }
  let readOnly = false,
    write = false;
  try {
    const result = await run(codexModes[1], denied);
    let absent = false;
    try {
      await lstat(denied);
    } catch (error) {
      absent = (error as NodeJS.ErrnoException).code === 'ENOENT';
    }
    readOnly = result.exitCode === 23 && result.stdout === 'specflow-probe-start\ndenied' && absent;
  } catch {
    /* Missing enforcement is unavailable, never a permission fallback. */
  }
  try {
    const result = await run(codexModes[0], writable);
    const permitted =
      result.exitCode === 42 &&
      result.stdout === 'specflow-probe-start\nwritten' &&
      (await readFile(writable, 'utf8')) === 'specflow-probe';
    const refused = await run(codexModes[0], outside);
    let absent = false;
    try {
      await lstat(outside);
    } catch (error) {
      absent = (error as NodeJS.ErrnoException).code === 'ENOENT';
    }
    write =
      permitted &&
      refused.exitCode === 23 &&
      refused.stdout === 'specflow-probe-start\ndenied' &&
      absent;
  } catch {
    /* A native sandbox/setup failure must not enable writable mode. */
  }
  return { readOnly, write };
}
