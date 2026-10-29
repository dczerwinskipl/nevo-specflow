import { createServer } from 'node:net';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DocumentQueueScheduler, SpecFlowEngine } from '@nevo/specflow-engine';
import { afterEach, describe, expect, it } from 'vitest';

import { startRuntime } from '../src/index';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a test port.');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

describe('startRuntime', () => {
  it('loads configuration, starts the HTTP server, and closes explicitly', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'nevo-runtime-'));
    dirs.push(cwd);
    const port = await freePort();
    await mkdir(join(cwd, '.nevo'), { recursive: true });
    await writeFile(
      join(cwd, '.nevo/config.yaml'),
      [
        'runtime:',
        '  server:',
        '    host: 127.0.0.1',
        `    port: ${port}`,
        '    tls:',
        '      enabled: false',
        '  authentication:',
        '    mode: none',
        '    providers:',
        '      password:',
        '        enabled: false',
        '      oidc:',
        '        instances: {}',
        '',
      ].join('\n'),
      'utf8',
    );

    const runtime = await startRuntime({
      projectRoot: cwd,
      projectConfigPath: join(cwd, '.nevo/config.yaml'),
      localConfigPath: join(cwd, '.nevo/local/config.yaml'),
    });
    try {
      expect(runtime.address).toContain(`:${port}`);
      const root = await fetch(`http://127.0.0.1:${port}/`);
      expect(root.status).toBe(200);
      expect(await root.json()).toEqual({
        service: 'Nevo SpecFlow Runtime API',
        status: 'ok',
        message: 'This address serves the Runtime API, not the SpecFlow web UI.',
      });

      const response = await fetch(`http://127.0.0.1:${port}/api/auth/session`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        authenticationRequired: false,
        authenticated: false,
        loginMethods: { password: { enabled: false }, oidc: [] },
      });
    } finally {
      await runtime.close();
    }
  });

  describe('document commit scheduler', () => {
    async function projectDir(): Promise<{ cwd: string; port: number }> {
      const cwd = await mkdtemp(join(tmpdir(), 'nevo-runtime-'));
      dirs.push(cwd);
      const port = await freePort();
      await mkdir(join(cwd, '.nevo'), { recursive: true });
      await writeFile(
        join(cwd, '.nevo/config.yaml'),
        [
          'runtime:',
          '  server:',
          '    host: 127.0.0.1',
          '    port: ' + port,
          '    tls:',
          '      enabled: false',
          '  authentication:',
          '    mode: none',
          '    providers:',
          '      password:',
          '        enabled: false',
          '      oidc:',
          '        instances: {}',
          '',
        ].join('\n'),
        'utf8',
      );
      return { cwd, port };
    }

    function recordingScheduler(calls: string[]): DocumentQueueScheduler {
      return {
        running: false,
        start: () => {
          calls.push('start');
          return Promise.resolve();
        },
        wake: () => Promise.resolve(),
        whenIdle: () => Promise.resolve(),
        recentEvents: () => [],
        stop: (options) => {
          calls.push('stop ' + JSON.stringify(options));
          return Promise.resolve({ complete: true, timedOut: false, remaining: 0 });
        },
      };
    }

    it('starts with a project Runtime and flushes within the deadline when it closes', async () => {
      const { cwd } = await projectDir();
      const calls: string[] = [];
      const runtime = await startRuntime({
        projectRoot: cwd,
        projectConfigPath: join(cwd, '.nevo/config.yaml'),
        localConfigPath: join(cwd, '.nevo/local/config.yaml'),
        dependencies: { specs: { engine: {} as SpecFlowEngine } },
        documentQueue: { scheduler: recordingScheduler(calls) },
      });
      expect(calls).toEqual(['start']);
      await runtime.close();
      expect(calls).toEqual(['start', 'stop {"flush":true,"deadlineMs":10000}']);
    });

    it('takes the shutdown deadline from the options', async () => {
      const { cwd } = await projectDir();
      const calls: string[] = [];
      const runtime = await startRuntime({
        projectRoot: cwd,
        projectConfigPath: join(cwd, '.nevo/config.yaml'),
        localConfigPath: join(cwd, '.nevo/local/config.yaml'),
        dependencies: { specs: { engine: {} as SpecFlowEngine } },
        documentQueue: { scheduler: recordingScheduler(calls), shutdownDeadlineMs: 2500 },
      });
      await runtime.close();
      expect(calls.at(-1)).toBe('stop {"flush":true,"deadlineMs":2500}');
    });

    it('does not start one without an Engine or when it is turned off', async () => {
      const { cwd } = await projectDir();
      const calls: string[] = [];
      const withoutEngine = await startRuntime({
        projectRoot: cwd,
        projectConfigPath: join(cwd, '.nevo/config.yaml'),
        localConfigPath: join(cwd, '.nevo/local/config.yaml'),
        documentQueue: { scheduler: recordingScheduler(calls) },
      });
      await withoutEngine.close();
      const second = await projectDir();
      const off = await startRuntime({
        projectRoot: second.cwd,
        projectConfigPath: join(second.cwd, '.nevo/config.yaml'),
        localConfigPath: join(second.cwd, '.nevo/local/config.yaml'),
        dependencies: { specs: { engine: {} as SpecFlowEngine } },
        documentQueue: { scheduler: false },
      });
      await off.close();
      expect(calls).toEqual([]);
    });
  });
});
