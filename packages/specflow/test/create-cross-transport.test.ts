import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  addWorkspace,
  bootstrapProjectHome,
  discoverSpecifications,
  installDefinitionsForTesting,
  openSpecFlowEngine,
  provisionLinkedWorkspaceIdentity,
  seedCatalogueForTesting,
  updateWorkspaceRegistry,
  workspaceRegistryPath,
} from '@nevo/specflow-engine/testing';
import { startRuntime } from '@nevo/specflow-runtime';
import { afterEach, describe, expect, it } from 'vitest';

import { createProgram } from '../src/program';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const seedRevision = (await seedCatalogueForTesting()).revision;

/** The archetype fields of a `POST /api/specs` body: the same selection the CLI test passes. */
function archetypeRequest() {
  return { archetypeId: 'minimal', archetypeVersion: 1, catalogueRevision: seedRevision };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test TCP port missing.');
  }

  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

  return address.port;
}

async function fixture(gitEnabled: boolean, port: number) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-http-cli-Ż space ')));
  roots.push(root);
  git(root, 'init', '-q');
  await mkdir(join(root, '.nevo'));
  const config = [
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
    'git:',
    '  enabled: ' + String(gitEnabled),
    '',
  ].join('\n');
  await writeFile(join(root, '.nevo/config.yaml'), config);
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  git(root, 'add', '.nevo/config.yaml', '.gitignore');
  git(
    root,
    '-c',
    'user.name=SpecFlow Test',
    '-c',
    'user.email=specflow@example.invalid',
    'commit',
    '-qm',
    'bootstrap',
  );
  const engine = await bootstrapProjectHome(root);
  await installDefinitionsForTesting(engine);

  return { root, engine };
}

function cli(cwd: string) {
  const lines: string[] = [];
  const program = createProgram({
    cwd,
    stdout: (line) => lines.push(line),
    stderr: () => undefined,
  });
  const run = (args: string[]) => program.parseAsync(['node', 'nevo-specflow', 'specs', ...args]);

  return { run, lines };
}

interface Created {
  readonly specId: string;
  readonly slug: string;
  readonly workspaceId: string;
  readonly kind: 'specification-create';
  readonly status: 'completed';
  readonly relativeManifestPath: string;
  readonly operationId: string;
}

/**
 * Execute the real Specs Commander adapter in a separate Node/Vitest process.
 * The test worker uses source imports so this test does not depend on a previously
 * bundled CLI artifact; process state and the Engine instance are not shared.
 */
async function createWithIndependentCli(root: string, title: string): Promise<Created> {
  const resultPath = join(root, '.nevo/local', 'live-refresh-' + randomUUID() + '.json');
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const vitestEntry = resolve(
    dirname(fileURLToPath(import.meta.resolve('vitest'))),
    '..',
    'vitest.mjs',
  );
  const child = spawn(
    process.execPath,
    [
      vitestEntry,
      'run',
      'test/fixtures/live-refresh-cli-worker.test.ts',
      '--maxWorkers=1',
      '--testTimeout=120000',
    ],
    {
      cwd: packageRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NEVO_LIVE_REFRESH_ROOT: root,
        NEVO_LIVE_REFRESH_TITLE: title,
        NEVO_LIVE_REFRESH_RESULT: resultPath,
      },
    },
  );
  let log = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream?.setEncoding('utf8');
    stream?.on('data', (chunk: string) => {
      log += chunk;
    });
  }

  const exitCode = await new Promise<number | null>((done, reject) => {
    child.once('error', reject);
    child.once('close', done);
  });
  if (exitCode !== 0) {
    throw new Error('Independent CLI process failed (' + exitCode + '): ' + log);
  }

  return JSON.parse(await readFile(resultPath, 'utf8')) as Created;
}

/** Close through a genuinely independent CLI adapter/Engine process. */
async function closeWithIndependentCli(
  root: string,
  specId: string,
  operationId: string,
): Promise<{ readonly status: string; readonly kind: string; readonly outcome?: string }> {
  const resultPath = join(root, '.nevo/local', 'live-close-' + randomUUID() + '.json');
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const vitestEntry = resolve(
    dirname(fileURLToPath(import.meta.resolve('vitest'))),
    '..',
    'vitest.mjs',
  );
  const child = spawn(
    process.execPath,
    [
      vitestEntry,
      'run',
      'test/fixtures/live-refresh-cli-worker.test.ts',
      '--maxWorkers=1',
      '--testTimeout=120000',
    ],
    {
      cwd: packageRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NEVO_LIVE_REFRESH_ROOT: root,
        NEVO_LIVE_REFRESH_CLOSE_SPEC_ID: specId,
        NEVO_LIVE_REFRESH_CLOSE_OPERATION: operationId,
        NEVO_LIVE_REFRESH_RESULT: resultPath,
      },
    },
  );
  let log = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream?.setEncoding('utf8');
    stream?.on('data', (chunk: string) => {
      log += chunk;
    });
  }

  const exitCode = await new Promise<number | null>((done, reject) => {
    child.once('error', reject);
    child.once('close', done);
  });
  if (exitCode !== 0) {
    throw new Error('Independent CLI close failed (' + exitCode + '): ' + log);
  }

  return JSON.parse(await readFile(resultPath, 'utf8')) as {
    readonly status: string;
    readonly kind: string;
    readonly outcome?: string;
  };
}

describe('E2.T05 — real HTTP and offline CLI share one Engine authority', () => {
  it('H02: HTTP creates while Runtime is running; offline CLI resolves after shutdown', async () => {
    const port = await freePort();
    const { root, engine } = await fixture(false, port);
    const runtime = await startRuntime({
      projectRoot: root,
      projectConfigPath: join(root, '.nevo/config.yaml'),
      localConfigPath: join(root, '.nevo/local/config.yaml'),
      dependencies: { specs: { engine } },
    });

    const operationId = randomUUID();
    let created: Created;
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/api/specs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...archetypeRequest(),
          title: 'Cross transport canonical Spec',
          operationId,
        }),
      });
      expect(response.status).toBe(201);
      created = (await response.json()) as Created;
      expect(created.operationId).toBe(operationId);
      expect(created.workspaceId).toBe(engine.workspace.workspaceId);
    } finally {
      await runtime.close();
    }

    const registryBefore = await readFile(workspaceRegistryPath(engine.context), 'utf8');
    const offline = cli(root);
    await offline.run(['resolve', created.specId, '--json']);
    expect(JSON.parse(offline.lines[0]!)).toMatchObject({
      specId: created.specId,
      status: 'available',
      workspaceId: created.workspaceId,
      specification: { title: 'Cross transport canonical Spec' },
    });
    expect(await readFile(join(root, created.relativeManifestPath), 'utf8')).toContain(
      created.specId,
    );

    const retry = cli(root);
    await retry.run([
      'create',
      '--archetype',
      'minimal',
      '--title',
      'Cross transport canonical Spec',
      '--operation-id',
      operationId,
      '--json',
    ]);
    expect(JSON.parse(retry.lines[0]!)).toEqual(created);
    expect(await readFile(workspaceRegistryPath(engine.context), 'utf8')).toBe(registryBefore);
    expect((await discoverSpecifications(engine)).map((item) => item.specId)).toEqual([
      created.specId,
    ]);
  }, 60000);

  it('C02: offline CLI creates an optional linked Git worktree and resolves its canonical Spec', async () => {
    const { root, engine } = await fixture(true, await freePort());
    const before = git(root, 'rev-parse', 'HEAD');
    const shell = cli(root);
    await shell.run([
      'create',
      '--archetype',
      'minimal',
      '--title',
      'CLI linked checkout',
      '--worktree',
      '--json',
    ]);

    const created = JSON.parse(shell.lines[0]!) as Created;
    expect(created).toMatchObject({ kind: 'specification-create', status: 'completed' });
    expect(created).not.toHaveProperty('workspaceRoot');
    const registered = (await engine.readRegistry()).workspaces.find(
      (item) => item.workspaceId === created.workspaceId,
    );
    if (!registered) {
      throw new Error('Created workspace registration missing.');
    }

    const workspaceRoot = registered.root;
    roots.push(dirname(workspaceRoot));
    expect(workspaceRoot).not.toBe(root);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(before);
    // Create commits its one scaffold commit on the new branch, based on the primary HEAD.
    expect(git(workspaceRoot, 'rev-parse', 'HEAD~1')).toBe(before);
    expect(git(workspaceRoot, 'diff', '--name-only', 'HEAD~1', 'HEAD')).toContain(
      created.relativeManifestPath,
    );
    expect(git(workspaceRoot, 'status', '--porcelain')).toBe('');
    expect(git(root, 'worktree', 'list', '--porcelain').match(/worktree /gu)).toHaveLength(2);

    const linkedEngine = await openSpecFlowEngine({ cwd: workspaceRoot });
    expect(linkedEngine.context.project.homeRoot).toBe(root);
    expect(linkedEngine.workspace.workspaceId).toBe(created.workspaceId);

    const fromLinked = cli(workspaceRoot);
    await fromLinked.run(['resolve', created.specId, '--json']);
    expect(JSON.parse(fromLinked.lines[0]!)).toMatchObject({
      status: 'available',
      specId: created.specId,
      workspaceId: created.workspaceId,
      workspaceRoot: workspaceRoot,
    });
    expect((await engine.readRegistry()).specBindings).toHaveLength(1);
  }, 60000);

  it('rejects cross-transport retry when HTTP and linked CLI select different defaults', async () => {
    const port = await freePort();
    const { root, engine } = await fixture(true, port);
    const linked = await realpath(await mkdtemp(join(tmpdir(), 'specflow-selector-linked-')));
    roots.push(linked);
    git(root, 'worktree', 'add', '-q', '-b', 'spec/selector-checkout', linked);
    const registered = await provisionLinkedWorkspaceIdentity(
      engine.context,
      linked,
      randomUUID(),
      false,
    );
    await updateWorkspaceRegistry(engine.context, (registry) => addWorkspace(registry, registered));

    const runtime = await startRuntime({
      projectRoot: root,
      projectConfigPath: join(root, '.nevo/config.yaml'),
      localConfigPath: join(root, '.nevo/local/config.yaml'),
      dependencies: { specs: { engine } },
    });
    const operationId = randomUUID();
    const title = 'Cross transport selector boundary';
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/api/specs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...archetypeRequest(), title, operationId }),
      });
      expect(response.status).toBe(201);
      const created = (await response.json()) as Created;
      expect(created.workspaceId).toBe(engine.workspace.workspaceId);
      expect(created.workspaceId).not.toBe(registered.workspaceId);
    } finally {
      await runtime.close();
    }

    const registryBefore = await readFile(workspaceRegistryPath(engine.context), 'utf8');
    await expect(
      cli(linked).run([
        'create',
        '--archetype',
        'minimal',
        '--title',
        title,
        '--operation-id',
        operationId,
        '--json',
      ]),
    ).rejects.toMatchObject({ code: 'CREATE_CONFLICT' });
    expect(await readFile(workspaceRegistryPath(engine.context), 'utf8')).toBe(registryBefore);
    expect((await engine.readRegistry()).specBindings).toHaveLength(1);
    expect(await discoverSpecifications(engine)).toHaveLength(1);
  }, 60000);
});

describe('E2.T07 — live canonical refresh', () => {
  it('LC06: warm Runtime current/archive reads refresh after independent CLI primary Close', async () => {
    const port = await freePort();
    const { root, engine } = await fixture(true, port);
    const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
    const configPath = join(root, '.nevo/config.yaml');
    await writeFile(
      configPath,
      (await readFile(configPath, 'utf8')) + '  integrationTargetBranch: ' + branch + '\n',
    );
    git(root, 'add', '--', '.nevo/config.yaml');
    git(
      root,
      '-c',
      'user.name=SpecFlow Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'set explicit primary close target',
    );
    const created = await createWithIndependentCli(root, 'CLI closed while Runtime is live');
    git(
      root,
      'add',
      '--',
      created.relativeManifestPath,
      'specs/active/' + created.slug + '/overview.md',
    );
    // Create commits the scaffold itself when Git is enabled; commit by hand only what is still staged.
    if (git(root, 'diff', '--cached', '--name-only') !== '') {
      git(
        root,
        '-c',
        'user.name=SpecFlow Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '-qm',
        'commit canonical Specification before Close',
      );
    }

    const runtime = await startRuntime({
      projectRoot: root,
      projectConfigPath: configPath,
      localConfigPath: join(root, '.nevo/local/config.yaml'),
      dependencies: { specs: { engine } },
    });
    const current = 'http://127.0.0.1:' + port + '/api/specs/overview?collection=current';
    const archive = 'http://127.0.0.1:' + port + '/api/specs/overview?collection=archive';
    interface Overview {
      readonly revision: string;
      readonly items: readonly { readonly id: string; readonly title: string }[];
    }
    try {
      const currentResponse = await fetch(current);
      const archiveResponse = await fetch(archive);
      expect(currentResponse.status).toBe(200);
      expect(archiveResponse.status).toBe(200);
      expect(currentResponse.headers.get('cache-control')).toBe('no-store');
      expect(archiveResponse.headers.get('cache-control')).toBe('no-store');
      const beforeCurrent = (await currentResponse.json()) as Overview;
      const beforeArchive = (await archiveResponse.json()) as Overview;
      expect(beforeCurrent.items.map((item) => item.id)).toEqual([created.specId]);
      expect(beforeArchive.items).toEqual([]);

      const beforeHead = git(root, 'rev-parse', 'HEAD');
      const closeOperationId = randomUUID();
      const closed = await closeWithIndependentCli(root, created.specId, closeOperationId);
      expect(closed.status).toBe('completed');
      expect(closed.kind).toBe('specification-close');
      expect(closed.outcome).toBe('archived-in-primary');
      expect(git(root, 'rev-parse', 'HEAD')).not.toBe(beforeHead);
      expect(git(root, 'status', '--porcelain')).toBe('');
      // LC28: HTTP retries the very same durable CLI intent without a second commit.
      const retry = await fetch(
        'http://127.0.0.1:' + port + '/api/specs/' + created.specId + '/close',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ operationId: closeOperationId }),
        },
      );
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual({
        operationId: closeOperationId,
        specId: created.specId,
        kind: 'specification-close',
        status: 'completed',
        outcome: 'archived-in-primary',
      });
      expect(closed).toEqual({
        operationId: closeOperationId,
        specId: created.specId,
        kind: 'specification-close',
        status: 'completed',
        outcome: 'archived-in-primary',
      });
      expect(git(root, 'rev-parse', 'HEAD')).not.toBe(beforeHead);
      expect(git(root, 'status', '--porcelain')).toBe('');

      const nextCurrentResponse = await fetch(current);
      const nextArchiveResponse = await fetch(archive);
      expect(nextCurrentResponse.status).toBe(200);
      expect(nextArchiveResponse.status).toBe(200);
      const afterCurrent = (await nextCurrentResponse.json()) as Overview;
      const afterArchive = (await nextArchiveResponse.json()) as Overview;
      expect(afterCurrent.items).toEqual([]);
      expect(afterArchive.items).toMatchObject([
        { id: created.specId, title: 'CLI closed while Runtime is live' },
      ]);
      expect(afterCurrent.revision).not.toBe(beforeCurrent.revision);
      expect(afterArchive.revision).not.toBe(beforeArchive.revision);
      expect((await engine.readRegistry()).specBindings).toHaveLength(1);
      expect((await discoverSpecifications(engine)).map((item) => item.specId)).toEqual([
        created.specId,
      ]);
    } finally {
      await runtime.close();
    }
  }, 150000);

  it('H03: a warm live HTTP read refreshes after a separate CLI process writes canonical state', async () => {
    const port = await freePort();
    const { root, engine } = await fixture(false, port);
    const runtime = await startRuntime({
      projectRoot: root,
      projectConfigPath: join(root, '.nevo/config.yaml'),
      localConfigPath: join(root, '.nevo/local/config.yaml'),
      dependencies: { specs: { engine } },
    });
    const url = 'http://127.0.0.1:' + port + '/api/specs/overview';
    interface Overview {
      readonly revision: string;
      readonly items: readonly { readonly id: string; readonly title: string }[];
    }
    try {
      const warmed = await fetch(url);
      expect(warmed.status).toBe(200);
      expect(warmed.headers.get('cache-control')).toBe('no-store');
      const before = (await warmed.json()) as Overview;
      expect(before.items).toEqual([]);

      // CLI runs in a different OS process, with its own Engine instance,
      // while the HTTP server continues to serve the same listening socket.
      const created = await createWithIndependentCli(root, 'Created by independent CLI');
      const afterCreateResponse = await fetch(url);
      expect(afterCreateResponse.status).toBe(200);
      const afterCreate = (await afterCreateResponse.json()) as Overview;
      expect(afterCreate.items).toMatchObject([
        { id: created.specId, title: 'Created by independent CLI' },
      ]);
      expect(afterCreate.revision).not.toBe(before.revision);

      // Until an edit command exists, the canonical manifest is edited on disk.
      // Every supported HTTP re-read must observe its new bytes without restart.
      const manifestPath = join(root, created.relativeManifestPath);
      const originalManifest = await readFile(manifestPath, 'utf8');
      const editedManifest = originalManifest.replace(
        'title: Created by independent CLI',
        'title: Updated canonical manifest',
      );
      expect(editedManifest).not.toBe(originalManifest);
      await writeFile(manifestPath, editedManifest);
      const afterEditResponse = await fetch(url);
      expect(afterEditResponse.status).toBe(200);
      const afterEdit = (await afterEditResponse.json()) as Overview;
      expect(afterEdit.items[0]?.title).toBe('Updated canonical manifest');
      expect(afterEdit.revision).not.toBe(afterCreate.revision);

      // A corrupt canonical source must never serve a stale cached 200 response.
      const registryBeforeFailure = await readFile(workspaceRegistryPath(engine.context), 'utf8');
      await writeFile(manifestPath, 'title: [invalid');
      const unavailable = await fetch(url);
      expect(unavailable.status).toBe(503);
      expect(await unavailable.json()).toMatchObject({ code: 'SPEC_SOURCE_UNAVAILABLE' });
      expect(unavailable.headers.get('cache-control')).toBe('no-store');
      expect(await readFile(workspaceRegistryPath(engine.context), 'utf8')).toBe(
        registryBeforeFailure,
      );

      await writeFile(manifestPath, editedManifest);
      const recovered = await fetch(url);
      expect(recovered.status).toBe(200);
      const recoveredValue = (await recovered.json()) as Overview;
      expect(recoveredValue.items[0]?.title).toBe('Updated canonical manifest');
      // The HTTP revision also includes source mtime, which can change on recovery.
      expect(recoveredValue.revision).not.toBe(before.revision);
    } finally {
      await runtime.close();
    }
  }, 150000);
});
