// The real process boundary: build + pack the product with the repository-pinned
// pnpm, install THAT tarball into an isolated prefix outside the workspace, and
// run the installed `nevo-specflow` **through its generated executable shim**.
//
// Nothing here resolves through the repository's own node_modules — the prefix
// lives in the OS temp dir and is installed with `--ignore-workspace`, and the
// bundle itself has no dependencies to resolve. Every `pnpm` runs from the repo
// root (which carries `packageManager`) so Corepack never downloads "latest".

import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const sh = process.platform === 'win32';

const pinnedPnpm = (
  JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { packageManager: string }
).packageManager.replace(/^pnpm@/, '');

let tarball = '';
let version = '';
let prefix = '';
let binDir = '';
let runEnv: NodeJS.ProcessEnv = {};

beforeAll(() => {
  // pack via the tool (already built by the nevo-repo-product#test turbo edge).
  const out = execFileSync('node', ['tools/product/dist/bin.js', 'pack', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: sh,
  });
  const parsed = JSON.parse(out.trim().split(/\r?\n/).filter(Boolean).pop() ?? '{}') as {
    tarball: string;
    version: string;
  };
  tarball = parsed.tarball;
  version = parsed.version;

  prefix = mkdtempSync(join(tmpdir(), 'nevo-specflow-smoke-'));
  writeFileSync(
    join(prefix, 'package.json'),
    JSON.stringify({ name: 'nevo-specflow-smoke-host', version: '0.0.0', private: true }),
  );
  // pnpm run from repoRoot (pinned), directed at the prefix with --dir.
  execFileSync('pnpm', ['--dir', prefix, '--ignore-workspace', 'add', tarball], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: sh,
  });

  binDir = join(prefix, 'node_modules', '.bin');
  runEnv = { ...process.env, PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}` };
}, 180_000);

afterAll(() => {
  if (prefix) rmSync(prefix, { recursive: true, force: true });
});

interface Run {
  code: number;
  stdout: string;
}
/** Invoke the installed `nevo-specflow` shim from the isolated prefix's .bin, via PATH. */
function nevoSpec(args: string[], input?: string): Run {
  try {
    return {
      code: 0,
      stdout: execFileSync('nevo-specflow', args, {
        cwd: prefix,
        env: runEnv,
        encoding: 'utf8',
        shell: sh,
        ...(input === undefined ? {} : { input }),
      }),
    };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not allocate a test port.');
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

function installedManifest(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(prefix, 'node_modules', '@nevo', 'specflow', 'package.json'), 'utf8'),
  ) as Record<string, unknown>;
}

describe('packaged @nevo/specflow — isolated tarball install', () => {
  it('was packed with the repository-pinned pnpm', () => {
    const v = execFileSync('pnpm', ['--version'], {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: sh,
    }).trim();
    expect(v).toBe(pinnedPnpm);
    expect(pinnedPnpm.startsWith('10.')).toBe(true);
  });

  it('installs a manifest with the packed version, correct engines, no deps, no scripts, no workspace:', () => {
    const pj = installedManifest();
    expect(pj.name).toBe('@nevo/specflow');
    expect(pj.version).toBe(version);
    expect((pj.bin as Record<string, string>)['nevo-specflow']).toBe('./dist/bin.js');
    expect((pj.engines as Record<string, string>).node).toBe('>=24.20.0 <25');
    expect(pj.dependencies ?? {}).toEqual({});
    expect(pj.devDependencies ?? {}).toEqual({});
    expect(pj.scripts ?? {}).toEqual({});
    expect(JSON.stringify(pj)).not.toContain('workspace:');
  });

  // `tar` from cwd + basename so the archive name has no drive-letter colon
  // (GNU tar would otherwise read `D:\…` as a remote host).
  const tarArgs = (flags: string, ...rest: string[]): string =>
    execFileSync('tar', [flags, basename(tarball), ...rest], {
      cwd: dirname(tarball),
      encoding: 'utf8',
    });

  it('ships exactly the intended files (incl. THIRD_PARTY_NOTICES.txt), nothing else', () => {
    const listing = tarArgs('-tzf').split(/\r?\n/).filter(Boolean).sort();
    expect(listing).toEqual([
      'package/LICENSE',
      'package/README.md',
      'package/THIRD_PARTY_NOTICES.txt',
      'package/dist/bin.js',
      'package/package.json',
    ]);
  });

  it('THIRD_PARTY_NOTICES.txt carries licenses for third-party code embedded in the bundle', () => {
    const notices = tarArgs('-xzOf', 'package/THIRD_PARTY_NOTICES.txt');
    expect(notices).toMatch(/commander 15\.0\.0/);
    expect(notices).toMatch(/MIT License/i);
    expect(notices).toMatch(/Copyright \(c\) 2011 TJ Holowaychuk/);
    expect(notices).toMatch(/yaml 2\.9\.1 \(ISC\)/);
    expect(notices).toMatch(/Copyright Eemeli Aro <eemeli@gmail\.com>/);
    expect(notices).toMatch(/fastify 5\.12\.5/);
    expect(notices).toMatch(/openid-client 6\.8\.8/);
    // esbuild is build-only — its code is not in the bundle, so it is not listed.
    expect(notices).not.toMatch(/esbuild/i);
  });

  it('A. nevo-specflow --help — exit 0, names the CLI and the start command (via the shim)', () => {
    const r = nevoSpec(['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('nevo-specflow');
    expect(r.stdout).toContain('start');
  });

  it('B. nevo-specflow --version — exit 0, equals the packed package version (via the shim)', () => {
    const r = nevoSpec(['--version']);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(version);
  });

  it('C. nevo-specflow start --help — exposes the real Runtime server command (via the shim)', () => {
    const r = nevoSpec(['start', '--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Runtime server/i);
  });

  it('D. generates a password hash through the installed auth utility', () => {
    const r = nevoSpec(
      ['auth', 'hash-password', '--password-stdin'],
      'correct horse battery staple\n',
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\$scrypt\$16384\$8\$5\$/u);
  });

  it('E. starts the packaged Runtime, serves HTTP, and shuts down cleanly', async () => {
    const port = await freePort();
    writeFileSync(
      join(prefix, 'nevo-specflow.yaml'),
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

    const child = spawn('nevo-specflow', ['start'], {
      cwd: prefix,
      env: runEnv,
      shell: sh,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Packaged Runtime did not start. stdout=${stdout} stderr=${stderr}`));
        }, 10_000);

        const onData = () => {
          if (stdout.includes(`Runtime listening at http://127.0.0.1:${port}`)) {
            clearTimeout(timeout);
            child.stdout.off('data', onData);
            resolve();
          }
        };
        child.stdout.on('data', onData);
        child.once('exit', (code, signal) => {
          clearTimeout(timeout);
          reject(
            new Error(
              `Packaged Runtime exited before startup: code=${String(code)} signal=${String(signal)} stderr=${stderr}`,
            ),
          );
        });
      });

      const response = await fetch(`http://127.0.0.1:${port}/api/auth/session`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        authenticated: false,
        availableProviders: [],
      });

      child.kill('SIGTERM');
      const [code, signal] = (await once(child, 'exit')) as [number | null, NodeJS.Signals | null];
      expect(signal).toBeNull();
      expect(code).toBe(0);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
      }
    }
  }, 30_000);

  it('an unknown command still exits non-zero after install', () => {
    expect(nevoSpec(['definitely-not-a-command']).code).not.toBe(0);
  });

  it('the isolated prefix holds only @nevo/* — no repo packages leaked in', () => {
    const mods = readdirSync(join(prefix, 'node_modules')).filter((m) => !m.startsWith('.'));
    expect(mods).toEqual(['@nevo']);
  });
});
