import { randomUUID } from 'node:crypto';
import { lstat, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  createInvocationScope,
  createDiagnosticStore,
  launchOwnedProcess,
  projectProviderEnvironment,
} from '../process';

/** Bounded help-only discovery. No prompt, model request, daemon control or
 * interaction bridge registration. This does not certify an execution adapter. */
it.skipIf(process.env.SPECFLOW_LIVE_ANTIGRAVITY !== '1' || process.platform !== 'win32')(
  'inspects installed Antigravity CLI flags through an owned process',
  async () => {
    const executable = join(process.env.LOCALAPPDATA!, 'agy', 'bin', 'agy.exe');
    const stat = await lstat(executable);
    expect(stat.isFile() && !stat.isSymbolicLink() && stat.size < 512 * 1024 * 1024).toBe(true);
    const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-agy-probe-')));
    const invocationId = randomUUID();
    const scope = await createInvocationScope(root, invocationId);
    const diagnostics = createDiagnosticStore({ enabled: true });
    const owner = await launchOwnedProcess({
      executable,
      invocationId,
      scope,
      diagnostics,
      cwd: root,
      args: ['--help'],
      environment: projectProviderEnvironment({
        host: process.env,
        configured: {
          AGY_INTERACTIVE: '0',
          AGY_CLI_DISABLE_AUTO_UPDATE: 'true',
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    const lines: string[] = [];
    let bytes = 0;
    try {
      for await (const line of owner.lines()) {
        bytes += Buffer.byteLength(line);
        if (bytes > 1024 * 1024) throw new Error('Antigravity help exceeded its output budget.');
        lines.push(line);
      }
      expect((await owner.done).code).toBe(0);
      const help = lines.join('\n') + '\n' + (diagnostics.read(invocationId)?.text ?? '');
      expect(help).toContain('--print');
      expect(help).toContain('--output-format');
      expect(help).toContain('--input-format');
      expect(help).toContain('--conversation');
      expect(help).toContain('--sandbox');
    } finally {
      const disposition = await owner.dispose();
      expect(disposition.process.state).toBe('stopped');
      // Exact root allocated above; never an application/provider installation path.
      await rm(root, { recursive: true, force: true });
    }
  },
  15000,
);
