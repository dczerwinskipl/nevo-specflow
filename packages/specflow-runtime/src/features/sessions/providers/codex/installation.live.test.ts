import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { inspectCodexInstallation } from './installation';
import { probeCodex } from './probe';
const observation = vi.hoisted(() => ({ results: [] as unknown[] }));
vi.mock('../process', async (importOriginal) => {
  const original = await importOriginal<typeof import('../process')>();
  return {
    ...original,
    async launchOwnedProcess(options: Parameters<typeof original.launchOwnedProcess>[0]) {
      const owner = await original.launchOwnedProcess(options);
      return {
        ...owner,
        async *lines() {
          for await (const line of owner.lines()) {
            try {
              const frame = JSON.parse(line) as {
                result?: { exitCode?: number; stdout?: string; stderr?: string };
              };
              if (frame.result?.exitCode !== undefined)
                observation.results.push({
                  exitCode: frame.result.exitCode,
                  started: frame.result.stdout?.startsWith('specflow-probe-start\n'),
                  written: frame.result.stdout === 'specflow-probe-start\nwritten',
                  denied: frame.result.stdout === 'specflow-probe-start\ndenied',
                  stderr: Boolean(frame.result.stderr),
                });
            } catch {
              /* Pretty-printed startup config. */
            }
            yield line;
          }
        },
      };
    },
  };
});

/** Explicit local CLI inspection and execution-boundary tests; no model request. */
it.skipIf(process.env.SPECFLOW_LIVE_CODEX !== '1' || process.platform !== 'win32')(
  'identifies an unpinned installed Codex and verifies native execution restrictions',
  async () => {
    const parent = join(homedir(), '.nevo', 'runtime', 'provider-acceptance');
    await mkdir(parent, { recursive: true, mode: 0o700 });
    const root = await realpath(await mkdtemp(join(parent, 'codex-')));
    try {
      const workspace = join(root, 'workspace');
      await mkdir(workspace);
      execFileSync('git', ['init', '-q'], { cwd: workspace, windowsHide: true, stdio: 'pipe' });
      const installation = await inspectCodexInstallation({
        workspace,
        homeRoot: join(root, 'native-home'),
        temporaryRoot: join(workspace, '.nevo', 'provider-temporary'),
        signal: AbortSignal.timeout(30000),
      });
      expect(installation.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(installation.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(installation.home.startsWith(join(root, 'native-home'))).toBe(true);
      const profile = await probeCodex({
        ...installation,
        workspace,
        temporaryRoot: join(workspace, '.nevo', 'provider-temporary'),
        signal: AbortSignal.timeout(30000),
      });
      expect(profile.models.length).toBeGreaterThan(0);
      expect(profile.modes).toEqual(expect.arrayContaining(['default', 'plan']));
      expect(profile.boundary, JSON.stringify(observation.results)).toEqual({
        readOnly: true,
        write: true,
      });
    } finally {
      // root is the exact directory returned by mkdtemp under the owned acceptance parent.
      await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
    }
  },
  45000,
);
