import { createServer } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { startRuntime } from '../src/index.js';

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
    await writeFile(
      join(cwd, 'nevo-specflow.yaml'),
      [
        'server:',
        '  host: 127.0.0.1',
        `  port: ${port}`,
        '  tls:',
        '    enabled: false',
        'auth:',
        '  mode: none',
        '  providers:',
        '    password:',
        '      enabled: false',
        '    oidc:',
        '      enabled: false',
        '',
      ].join('\n'),
      'utf8',
    );

    const runtime = await startRuntime({ cwd });
    try {
      expect(runtime.address).toContain(`:${port}`);
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/session`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ authenticated: false, availableProviders: [] });
    } finally {
      await runtime.close();
    }
  });
});
