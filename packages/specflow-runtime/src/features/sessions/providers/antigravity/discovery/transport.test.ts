import { expect, it, vi } from 'vitest';
import { mkdir, writeFile, readFile, symlink, link } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareAntigravityPermission } from '../permissions';
import { emptyDiscoveryResult } from './scan';
import { discoveryFixture as fixture } from './transport.fixture';

it('advertises the narrow MCP inventory, rejects unadmitted calls, then runs an owned helper', async () => {
  const f = await fixture();
  expect((await f.client.listTools()).tools.map((t) => t.name)).toEqual([
    'list_directory',
    'find_files',
    'search_text',
  ]);
  await expect(f.call('find_files', { pattern: '*.ts' })).rejects.toThrow();
  f.bridge.activate();
  expect(await f.call('find_files', { pattern: '*.ts' })).toMatchObject({
    error: false,
    data: { status: 'complete' },
  });
  await expect(f.call('search_text', { query: 'needle', IsRegex: true })).rejects.toThrow();
  expect(f.facts).toEqual([]); // Native protocol owns Work/ToolAction, never this transport.
  expect(f.bridge.processSettlementVerified()).toBe(true);
});

it('keeps native recursion and arbitrary MCP denied and commands explicitly approved', async () => {
  const f = await fixture();
  const hook = (name: string, args: object) =>
    prepareAntigravityPermission(
      {
        conversationId: f.context.nativeSessionId,
        workspacePaths: [f.workspace],
        stepIdx: 1,
        toolCall: { name, args },
      },
      f.context,
    );
  for (const name of ['list_dir', 'find_by_name', 'grep_search']) {
    await expect(hook(name, {})).rejects.toThrow();
  }

  const args = {
    ServerName: 'specflow-discovery',
    ToolName: 'find_files',
    Arguments: { pattern: '*.ts' },
    toolAction: 'read',
    toolSummary: 'Find source',
  };
  expect((await hook('call_mcp_tool', args)).decision).toEqual({ decision: 'allow' });
  await expect(hook('call_mcp_tool', { ...args, ServerName: 'untrusted' })).rejects.toThrow();
  f.context.discoveryEnabled = false;
  await expect(hook('call_mcp_tool', args)).rejects.toThrow();
  const command = await hook('run_command', {
    CommandLine: 'echo controlled',
    Cwd: f.workspace,
    WaitMsBeforeAsync: 1,
    toolAction: 'execute',
    toolSummary: 'Controlled command',
  });
  expect(command.interaction?.kind).toBe('permission');
});

it('isolates invocation credentials and cancels expired helpers without returning success', async () => {
  const marker = 'started.json';
  const f = await fixture(
    `import{writeFileSync}from'node:fs';process.stdin.resume();process.stdin.on('end',()=>{writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid}));setInterval(()=>{},1000);});`,
  );
  const other = await fixture();
  f.bridge.activate();
  const unauthorized = await fetch(f.config.serverUrl, {
    method: 'POST',
    headers: { ...other.config.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' }),
  });
  expect(unauthorized.status).toBe(403);
  const pending = f.call('search_text', { query: 'needle' });
  await vi.waitFor(async () =>
    expect(
      (JSON.parse(await readFile(join(f.workspace, marker), 'utf8')) as { pid: number }).pid,
    ).toBeGreaterThan(0),
  );
  f.context.nativeSessionId = 'new-native-session';
  f.controller.abort();
  await pending.catch(() => undefined);
  await f.bridge.close();
  expect(f.bridge.processSettlementVerified()).toBe(true);
  const pid = (JSON.parse(await readFile(join(f.workspace, marker), 'utf8')) as { pid: number })
    .pid;
  expect(() => process.kill(pid, 0)).toThrow();
  expect(f.facts).toEqual([]);
});

it('bounds active searches across Sessions and releases capacity on cancellation', async () => {
  const hold = `import{writeFileSync}from'node:fs';process.stdin.resume();process.stdin.on('end',()=>{writeFileSync('started','ready');setInterval(()=>{},1000);});`;
  const first = await fixture(hold);
  const second = await fixture(hold);
  const third = await fixture();
  for (const f of [first, second, third]) {
    f.bridge.activate();
  }

  const one = first.call('search_text', { query: 'needle' }).catch(() => undefined);
  const two = second.call('search_text', { query: 'needle' }).catch(() => undefined);
  for (const f of [first, second]) {
    await vi.waitFor(async () =>
      expect(await readFile(join(f.workspace, 'started'), 'utf8')).toBe('ready'),
    );
  }

  expect(await third.call('search_text', { query: 'needle' })).toMatchObject({
    error: true,
    data: { status: 'failed', reasons: ['runtime-discovery-busy'] },
  });
  first.controller.abort();
  second.controller.abort();
  await Promise.all([one, two, first.bridge.close(), second.bridge.close()]);
  expect((await third.call('search_text', { query: 'needle' })).data.status).toBe('complete');
}, 15000);

it('discards a completed read after its native identity changes, even with a mutable context getter', async () => {
  const f = await fixture(
    `import{writeFileSync,existsSync}from'node:fs';process.stdin.resume();process.stdin.on('end',()=>{writeFileSync('started','ready');const timer=setInterval(()=>{if(existsSync('release')){clearInterval(timer);console.log(${JSON.stringify(JSON.stringify(emptyDiscoveryResult('complete')))});}},10);});`,
  );
  f.bridge.activate();
  const pending = f.call('search_text', { query: 'needle' });
  await vi.waitFor(async () =>
    expect(await readFile(join(f.workspace, 'started'), 'utf8')).toBe('ready'),
  );
  f.context.nativeSessionId = 'replacement-native-session';
  await writeFile(join(f.workspace, 'release'), 'ready');
  expect(await pending).toMatchObject({
    error: true,
    data: { status: 'cancelled', reasons: ['discovery-expired'] },
  });
});

it.runIf(process.platform === 'win32' && process.arch === 'x64')(
  'applies starting-path filters through MCP with real NTFS reads',
  async () => {
    const f = await fixture(undefined, true);
    await mkdir(join(f.workspace, 'node_modules', 'library'), { recursive: true });
    await writeFile(join(f.workspace, 'node_modules', 'library', 'index.ts'), 'dependency needle');
    f.bridge.activate();
    for (const filters of [{ includes: ['**/*.md'] }, { excludes: ['**/*.ts'] }]) {
      expect(
        await f.call('search_text', { path: 'nested/code.ts', query: 'needle', ...filters }),
      ).toMatchObject({
        error: false,
        data: { status: 'complete', matches: [], counts: { files: 0, bytes: 0 } },
      });
    }

    expect(await f.call('search_text', { path: 'node_modules', query: 'needle' })).toMatchObject({
      error: false,
      data: {
        status: 'complete',
        matches: [],
        counts: { visited: 0, files: 0, bytes: 0, excluded: 1 },
      },
    });
    const explicit = await f.call('search_text', {
      path: 'node_modules',
      query: 'needle',
      includes: ['**/*.ts'],
      excludes: [],
    });
    expect(explicit.data.status).toBe('complete');
    expect(explicit.data.matches).toMatchObject([
      { path: 'node_modules/library/index.ts', text: 'dependency needle' },
    ]);
    expect(
      await f.call('search_text', {
        path: 'node_modules/library/index.ts',
        query: 'needle',
        excludes: ['node_modules'],
      }),
    ).toMatchObject({
      error: false,
      data: { status: 'complete', matches: [], counts: { files: 0, bytes: 0, excluded: 1 } },
    });
    expect(
      await f.call('search_text', { path: '.git/secret', query: 'needle', excludes: [] }),
    ).toMatchObject({
      error: true,
      data: { status: 'failed', matches: [], counts: { files: 0, bytes: 0 } },
    });
  },
  20000,
);

it.runIf(process.platform === 'win32' && process.arch === 'x64')(
  'discovers real nested content over MCP and never reads junction or hardlink targets',
  async () => {
    const f = await fixture(undefined, true);
    const outside = join(f.root, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'secret.txt'), 'EXTERNAL_SECRET');
    await symlink(outside, join(f.workspace, 'junction'), 'junction');
    await link(join(outside, 'secret.txt'), join(f.workspace, 'hardlink.txt'));
    f.bridge.activate();
    const list = await f.call('list_directory', { path: 'nested' });
    expect(list.data).toMatchObject({
      status: 'complete',
      entries: [{ path: 'nested/code.ts', type: 'file' }],
    });
    const found = await f.call('find_files', { pattern: '*.ts' });
    expect(found.data.entries).toEqual([{ path: 'nested/code.ts', type: 'file' }]);
    const searched = await f.call('search_text', { query: 'needle', includes: ['**/*.ts'] });
    expect(searched.data.matches).toMatchObject([
      { path: 'nested/code.ts', text: 'controlled needle' },
    ]);
    const secret = await f.call('search_text', { query: 'EXTERNAL_SECRET' });
    expect(secret.data.status).toBe('partial');
    expect(secret.data.matches).toEqual([]);
    expect(
      (await f.call('search_text', { path: 'junction', query: 'EXTERNAL_SECRET' })).data.status,
    ).toBe('failed');
    expect(f.facts).toEqual([]);
    await f.bridge.close();
    await writeFile(join(f.workspace, 'nested', 'code.ts'), 'editing remains possible');
  },
  20000,
);
