import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchOwnedProcess } from '../../process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { DriverFact } from '../../../persistence/protocol';
import { createAntigravityQuestionBridge } from '../question-bridge';
import { prepareAntigravityPermission } from '../permissions';
import { emptyDiscoveryResult, type DiscoveryResult } from './scan';

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function fixture(
  helperBody?: string,
  realHelper = false,
  launch?: typeof launchOwnedProcess,
) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'f14-transport-')));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  await mkdir(join(workspace, 'nested'), { recursive: true });
  await writeFile(join(workspace, 'nested', 'code.ts'), 'controlled needle');
  const helper = realHelper
    ? fileURLToPath(import.meta.resolve('@nevo/specflow-runtime/antigravity-hook'))
    : join(root, 'controlled.mjs');
  if (!realHelper) {
    await writeFile(
      helper,
      helperBody ??
        `process.stdin.resume(); process.stdin.on('end',()=>console.log(${JSON.stringify(JSON.stringify(emptyDiscoveryResult('complete')))}));`,
    );
  }

  const controller = new AbortController();
  const context = {
    workspace,
    nativeSessionId: 'synthetic-native-session',
    nativeTools: ['call_mcp_tool', 'run_command', 'list_dir', 'grep_search', 'find_by_name'],
    writable: true,
    commandsAllowed: true,
    discoveryEnabled: true,
  };
  const facts: DriverFact[] = [];
  const bridge = await createAntigravityQuestionBridge({
    invocation: { sessionId: randomUUID(), turnId: randomUUID(), invocationId: randomUUID() },
    signal: controller.signal,
    emit: (fact) => {
      facts.push(fact);

      return Promise.resolve();
    },
    permissionContext: () => context,
    discovery: { workspace, temporaryRoot: join(root, 'private'), helper, launch },
  });
  cleanups.push(() => bridge.close());
  const config = bridge.configuration.mcpServers['specflow-discovery']!;
  const client = new Client({ name: 'synthetic-discovery-fixture', version: '1' });
  cleanups.push(() => client.close());
  await client.connect(
    new StreamableHTTPClientTransport(new URL(config.serverUrl), {
      requestInit: { headers: config.headers },
    }),
  );
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { type: string; text: string }[])[0]!.text;

    return { error: result.isError, data: JSON.parse(text) as DiscoveryResult };
  };

  return { root, workspace, controller, context, bridge, config, client, facts, call };
}

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

it('refuses successful tool and bridge settlement when a helper stopped-tree receipt is unknown', async () => {
  const launch: typeof launchOwnedProcess = async (options) => {
    const owner = await launchOwnedProcess(options);

    return {
      ...owner,
      async dispose() {
        const receipt = await owner.dispose();

        return {
          ...receipt,
          process: { state: 'unknown' as const, reason: 'unverified-tree' as const },
        };
      },
    };
  };

  const f = await fixture(undefined, false, launch);
  f.bridge.activate();
  await expect(f.call('find_files', { pattern: '*.ts' })).rejects.toThrow();
  await expect(f.bridge.close()).rejects.toThrow('settlement is unverified');
  expect(f.bridge.processSettlementVerified()).toBe(false);
  // The real controlled process was disposed above; only its receipt was fault-
  // injected. Avoid repeating the deliberately rejected close in fixture cleanup.
  vi.spyOn(f.bridge, 'close').mockResolvedValue();
});

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
