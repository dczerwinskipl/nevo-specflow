import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import { bootstrapProjectHome } from '@nevo/specflow-engine/testing';
import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const fixture = vi.hoisted(() => ({ home: '', entry: '' }));
// Substitute installation/capability evidence and the executable only. Runtime,
// assigned-context correlation, Engine claims, owned processes, SQLite and HTTP
// remain real. This is controlled-process evidence, never native certification.
vi.mock('../../src/features/sessions/providers/codex/installation', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../../src/features/sessions/providers/codex/installation')
    >();
  return {
    ...original,
    inspectCodexInstallation: () =>
      Promise.resolve({
        executable: process.execPath,
        home: fixture.home,
        accountScope: 'controlled-account',
        sha256: 'a'.repeat(64),
        fingerprint: 'a'.repeat(64),
        platform: 'win32',
        architecture: 'x64',
        secrets: [],
        environment: { values: {}, sources: {} },
      }),
  };
});
vi.mock('../../src/features/sessions/providers/codex/probe', () => ({
  probeCodex: () =>
    Promise.resolve({
      models: [{ modelId: 'controlled-model', title: 'Controlled', efforts: ['low'] }],
      modes: ['default', 'plan'],
      boundary: { readOnly: true, write: true },
    }),
}));
vi.mock('../../src/features/sessions/providers/process', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/features/sessions/providers/process')>();
  return {
    ...original,
    launchOwnedProcess: (options: Parameters<typeof original.launchOwnedProcess>[0]) =>
      original.launchOwnedProcess({
        ...options,
        args: [fixture.entry, fixture.home, ...options.args],
      }),
  };
});

it('preserves assigned Codex context, Engine settlement and canonical history across Runtime restart', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-codex-http-')));
  const workspace = join(root, 'workspace');
  let app: Awaited<ReturnType<typeof createRuntimeApp>> | undefined;
  try {
    await mkdir(workspace);
    await mkdir(join(workspace, '.nevo'));
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: workspace, windowsHide: true, stdio: 'pipe' });
    git('init', '-q');
    await writeFile(join(workspace, '.gitignore'), '.nevo/local/\n');
    await writeFile(join(workspace, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: false\n');
    git('add', '.gitignore', '.nevo/config.yaml');
    git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'initial',
    );
    fixture.home = join(root, 'native');
    await mkdir(fixture.home);
    fixture.entry = fileURLToPath(new URL('./fixtures/codex-rpc.fixture.mjs', import.meta.url));
    const engine = await bootstrapProjectHome(workspace);
    const config = passwordConfig();
    const open = () =>
      createRuntimeApp(
        {
          ...config,
          authentication: { ...config.authentication, mode: 'none' },
          sessions: {
            enabled: true,
            providers: { mock: { enabled: false }, codex: { enabled: true } },
          },
        },
        { specs: { engine } },
      );
    app = await open();
    const createId = randomUUID();
    const create = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        requestId: createId,
        providerId: 'codex',
        mode: 'workspace-write',
        providerModeId: 'default',
        modelId: 'controlled-model',
        effort: 'low',
      },
    });
    expect(create.statusCode, create.body).toBe(201);
    const { sessionId } = create.json<{ sessionId: string }>();
    async function turn(message: string) {
      const requestId = randomUUID();
      const response = await app!.inject({
        method: 'POST',
        url: '/api/sessions/' + sessionId + '/turns',
        payload: { requestId, message },
      });
      expect(response.statusCode, response.body).toBe(202);
      const { turnId } = response.json<{ turnId: string }>();
      const retry = await app!.inject({
        method: 'POST',
        url: '/api/sessions/' + sessionId + '/turns',
        payload: { requestId, message },
      });
      expect(retry.json<{ turnId: string }>().turnId).toBe(turnId);
      let snapshot: SessionSnapshot | undefined;
      await vi.waitFor(
        async () => {
          snapshot = (await app!.inject('/api/sessions/' + sessionId)).json<SessionSnapshot>();
          expect(snapshot.activeTurn, JSON.stringify(snapshot.entries.slice(-3))).toBeUndefined();
          expect(snapshot.entries.at(-1)?.text.text).toBe('completed');
        },
        { timeout: 15000, interval: 50 },
      );
      return { snapshot: snapshot!, turnId };
    }
    const token = randomUUID();
    await turn('write:' + token);
    expect(await readFile(join(workspace, 'controlled-agent.txt'), 'utf8')).toBe(token);
    await app.close();
    app = undefined;
    await rm(join(workspace, 'controlled-agent.txt'));
    app = await open();
    const resumed = await turn('recall');
    expect(
      resumed.snapshot.entries
        .filter((entry) => entry.turnId === resumed.turnId && entry.kind === 'answer')
        .at(-1)?.text.text,
    ).toBe(token);
    expect(resumed.snapshot.entries.filter((entry) => entry.kind === 'outcome')).toHaveLength(2);
  } finally {
    await app?.close();
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
  }
}, 60000);
