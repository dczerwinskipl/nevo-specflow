import { collect } from './framing.test-support';
import { mkdtemp, rm, access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchOwnedProcess } from './owned-process';
import { createInvocationScope } from './scope';
import { projectProviderEnvironment } from './environment';
import { createDiagnosticStore } from './diagnostics';
let root = '';
let running: Awaited<ReturnType<typeof launchOwnedProcess>> | undefined;
afterEach(async () => {
  await running?.dispose();
  running = undefined;
  if (root) {
    await rm(root, { recursive: true, force: true });
  }
});
async function setup() {
  root = await mkdtemp(join(tmpdir(), 'provider-process-'));
  const invocationId = randomUUID();

  return {
    invocationId,
    scope: await createInvocationScope(root, invocationId),
    executable: process.execPath,
    cwd: root,
    environment: projectProviderEnvironment({
      host: process.env,
      secrets: { PROVIDER_TEST_KEY: 'resolved-private-secret' },
    }),
    signal: new AbortController().signal,
  };
}

describe('owned provider process', () => {
  it('drains a native result after graceful EOF without treating EOF as cancellation', async () => {
    const input = await setup();
    running = await launchOwnedProcess({
      ...input,
      args: [
        '-e',
        `
        let received = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => { received += chunk; });
        process.stdin.on('end', () => {
          process.stdout.write(JSON.stringify({ result: received.trim() }) + '\\n');
        });
      `,
      ],
    });
    const reader = running.lines();
    await running.write('fixture-input\n');
    await running.endInput();
    expect((await reader.next()).value).toBe(JSON.stringify({ result: 'fixture-input' }));
    expect((await reader.next()).done).toBe(true);
    expect((await running.done).code).toBe(0);
    expect((await running.dispose()).process.state).toBe('stopped');
    await running.endInput();
    await expect(running.write('second-input')).rejects.toThrow();
  });

  it.runIf(process.platform === 'win32')(
    'does not run provider Node preloads outside the owned job',
    async () => {
      const input = await setup();
      const pidFile = join(root, 'preload-child.pid');
      const preload = `
      import {spawn} from 'node:child_process';
      import {writeFileSync} from 'node:fs';
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        detached: true, stdio: 'ignore', env: {SystemRoot: process.env.SystemRoot},
      });
      child.once('spawn', () => writeFileSync(${JSON.stringify(pidFile)}, String(child.pid)));
    `;
      running = await launchOwnedProcess({
        ...input,
        environment: projectProviderEnvironment({
          host: process.env,
          configured: {
            NODE_OPTIONS:
              '--import=data:text/javascript;base64,' + Buffer.from(preload).toString('base64'),
          },
        }),
        args: ['-e', `console.log('ready'); setInterval(() => {}, 1000);`],
      });
      const reader = running.lines();
      expect((await reader.next()).value).toBe('ready');
      let pid = 0;
      await vi.waitFor(async () => {
        pid = Number(await readFile(pidFile, 'utf8'));
        expect(pid).toBeGreaterThan(0);
      });
      expect((await running.dispose()).process.state).toBe('stopped');
      await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow());
      await reader.return(undefined);
    },
  );
  it.runIf(process.platform === 'win32')(
    'settles descendants after their provider root exits',
    async () => {
      const input = await setup();
      const script = `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: 'ignore', detached: true,
      });
      child.once('spawn', () => {
        process.stdout.write(String(child.pid) + '\\n', () => process.exit(0));
      });
    `;
      running = await launchOwnedProcess({ ...input, args: ['-e', script] });
      const reader = running.lines();
      const pid = Number((await reader.next()).value);
      expect(pid).toBeGreaterThan(0);
      await running.done;
      expect((await running.dispose()).process.state).toBe('stopped');
      await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow());
      await reader.return(undefined);
    },
  );
  it.runIf(process.platform === 'win32')(
    'verifies the owned job after natural root exit',
    async () => {
      const input = await setup();
      running = await launchOwnedProcess({ ...input, args: ['-e', 'process.exit(0)'] });
      await running.done;
      expect((await running.dispose()).process.state).toBe('stopped');
    },
  );
  it.runIf(process.platform === 'win32')(
    'preserves a terminal frame and verifies settlement after immediate exit',
    async () => {
      const input = await setup();
      const script = `
        process.stdout.write(JSON.stringify({ type: 'result', result: 'authoritative' }) + '\\n', () => {
          process.exit(0);
        });
      `;
      running = await launchOwnedProcess({ ...input, args: ['-e', script] });
      const reader = running.lines();
      const frame: unknown = (await reader.next()).value;
      expect(typeof frame).toBe('string');
      expect(JSON.parse(frame as string)).toEqual({
        type: 'result',
        result: 'authoritative',
      });
      await running.done;
      expect((await running.dispose()).process.state).toBe('stopped');
      await reader.return(undefined);
    },
  );
  it('rolls back resources if diagnostic acquisition fails before spawn', async () => {
    const input = await setup();
    const diagnostics = createDiagnosticStore({ enabled: true });
    for (let n = 0; n < 1024; n++) {
      diagnostics.open(String(n));
    }

    const close = vi.fn(() => Promise.resolve());
    input.scope.defer('mcp', close);
    await expect(launchOwnedProcess({ ...input, diagnostics, args: [] })).rejects.toMatchObject({
      code: 'START_FAILED',
    });
    expect(close).toHaveBeenCalledOnce();
    await expect(access(input.scope.directory)).rejects.toThrow();
  });
  it.runIf(process.platform === 'linux')(
    'terminates the retained POSIX group after its root exits',
    async () => {
      const input = await setup();
      const script = `
        const { spawn } = require('node:child_process');
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
        child.once('spawn', () => {
          console.log(child.pid);
          process.exit(0);
        });
      `;
      running = await launchOwnedProcess({ ...input, args: ['-e', script] });
      const reader = running.lines();
      const pid = Number((await reader.next()).value);
      expect(pid).toBeGreaterThan(0);
      await running.done;
      await running.dispose();
      await vi.waitFor(async () => {
        let state: string;
        try {
          state = await readFile('/proc/' + pid + '/stat', 'utf8');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return;
          }

          throw error;
        }

        // Container PID1 may not reap an orphan immediately. A zombie cannot execute further work.
        expect(state.slice(state.lastIndexOf(')') + 2, state.lastIndexOf(')') + 3)).toBe('Z');
      });
      await reader.return(undefined);
    },
  );
  it('rolls back a partial start without exposing native exception details', async () => {
    const input = await setup();
    const close = vi.fn(() => Promise.resolve());
    input.scope.defer('mcp', close);
    await input.scope.temporaryFile('mcp.json', '{}');
    await expect(
      launchOwnedProcess({
        ...input,
        executable: join(root, 'private-missing-executable'),
        args: [],
      }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE', message: 'Provider process could not start.' });
    expect(close).toHaveBeenCalledOnce();
    await expect(access(input.scope.directory)).rejects.toThrow();
  });
  it('does not spawn on an already aborted invocation', async () => {
    const input = await setup();
    await expect(
      launchOwnedProcess({ ...input, signal: AbortSignal.abort(), args: [] }),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    await expect(access(input.scope.directory)).rejects.toThrow();
  });
  it('streams protocol frames, uses projected secrets and captures only redacted diagnostics', async () => {
    const input = await setup();
    const diagnostics = createDiagnosticStore({ enabled: true });
    running = await launchOwnedProcess({
      ...input,
      diagnostics,
      args: [
        '-e',
        `
          process.stderr.write(process.env.PROVIDER_TEST_KEY + '\\n');
          process.stdout.write(JSON.stringify({ ok: true, leaked: process.env.DATABASE_URL ?? null }) + '\\n');
        `,
      ],
    });
    const lines = await collect(running.lines());
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([{ ok: true, leaked: null }]);
    expect((await running.done).code).toBe(0);
    expect(diagnostics.read(input.invocationId)?.text).toContain('[redacted]');
    expect(diagnostics.read(input.invocationId)?.text).not.toContain('resolved-private-secret');
  });
  it('terminates a live process tree on cancellation and closes MCP/temp resources once', async () => {
    const input = await setup(),
      controller = new AbortController(),
      close = vi.fn(() => Promise.resolve());
    input.scope.defer('mcp', close);
    await input.scope.temporaryFile('mcp.json', '{}');
    const script = `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      process.on('SIGINT', () => {
        child.once('exit', () => process.exit(0));
      });
      console.log(child.pid);
      setInterval(() => {}, 1000);
    `;
    running = await launchOwnedProcess({
      ...input,
      signal: controller.signal,
      args: ['-e', script],
    });
    const reader = running.lines();
    const pid = Number((await reader.next()).value);
    expect(pid).toBeGreaterThan(0);
    controller.abort();
    const result = await running.dispose();
    expect(result.process.state).toBe('stopped');
    expect(result.cleanup).toEqual([]);
    expect(close).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow());
    await expect(access(input.scope.directory)).rejects.toThrow();
    await reader.return(undefined);
  });
  it('fails oversized protocol output and cleans up the active process', async () => {
    const input = await setup();
    running = await launchOwnedProcess({
      ...input,
      maxFrameBytes: 32,
      args: ['-e', `process.stdout.write('x'.repeat(100));setInterval(()=>{},1000)`],
    });
    await expect(collect(running.lines())).rejects.toMatchObject({
      code: 'PROTOCOL_FAILED',
    });
    expect((await running.dispose()).process.state).toBe('stopped');
  });
});
