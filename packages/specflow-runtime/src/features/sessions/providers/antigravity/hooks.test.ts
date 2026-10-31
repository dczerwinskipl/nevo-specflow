import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rename, realpath, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DriverFact } from '../../persistence/protocol';
import { createAntigravityQuestionBridge } from './question-bridge';
import { runAntigravityHook } from './hook-client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createServer } from 'node:http';

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});
async function fixture(active = true) {
  // Match installation discovery's physical workspace, including macOS /var aliases.
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-native-hook-')));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  await mkdir(workspace);
  const facts: DriverFact[] = [];
  const context = {
    nativeSessionId: 'controlled-native-id',
    workspace,
    writable: true,
    commandsAllowed: true,
  };
  const bridge = await createAntigravityQuestionBridge({
    invocation: { sessionId: randomUUID(), turnId: randomUUID(), invocationId: randomUUID() },
    signal: new AbortController().signal,
    emit: (fact) => {
      facts.push(fact);

      return Promise.resolve();
    },
    permissionContext: () => context,
  });
  cleanups.push(() => bridge.close());
  const configurationPath = join(root, 'hook-private.json');
  await writeFile(configurationPath, JSON.stringify(bridge.nativeHookClientConfiguration));
  if (active) {
    bridge.activate();
  }

  const body = (stepIdx = 0) => ({
    conversationId: context.nativeSessionId,
    workspacePaths: [workspace],
    stepIdx,
    toolCall: {
      name: 'run_command',
      args: {
        CommandLine: 'echo controlled fixture',
        Cwd: workspace,
        WaitMsBeforeAsync: 5000,
        toolSummary: 'Controlled fixture',
        toolAction: 'execute',
      },
    },
  });
  const post = (
    hook: 'pre-tool-use' | 'stop',
    input: unknown,
    signal = new AbortController().signal,
  ) =>
    runAntigravityHook({
      hook,
      configurationPath,
      input: Buffer.from(JSON.stringify(input)),
      signal,
    });
  const permission = async () => {
    await vi.waitFor(() => expect(facts.some((fact) => fact.kind === 'interaction')).toBe(true));

    return facts.find((fact) => fact.kind === 'interaction')!;
  };

  return { root, workspace, context, bridge, facts, configurationPath, body, post, permission };
}

describe('controlled native hook HTTP/helper boundary', () => {
  it('does not consume the MCP request budget for native file hooks', async () => {
    const f = await fixture();
    for (let stepIdx = 0; stepIdx <= 256; stepIdx++) {
      await expect(
        f.post('pre-tool-use', {
          ...f.body(stepIdx),
          toolCall: { name: 'view_file', args: { AbsolutePath: join(f.workspace, 'file.txt') } },
        }),
      ).resolves.toEqual({ decision: 'allow' });
    }

    expect(f.facts.filter((fact) => fact.kind === 'interaction')).toEqual([]);
  });
  it('allows the exact native MCP wrapper then admits its question exactly once through the SDK bridge', async () => {
    const f = await fixture();
    await expect(
      f.post('pre-tool-use', {
        conversationId: f.context.nativeSessionId,
        workspacePaths: [f.workspace],
        stepIdx: 0,
        toolCall: {
          name: 'call_mcp_tool',
          args: {
            ServerName: 'specflow-interactions',
            ToolName: 'ask_user',
            Arguments: { question: 'Controlled question' },
            toolAction: 'ask',
            toolSummary: 'Controlled question',
          },
        },
      }),
    ).resolves.toEqual({ decision: 'allow' });
    expect(f.facts).toEqual([]);
    const configuration = f.bridge.configuration.mcpServers['specflow-interactions'];
    const client = new Client({ name: 'controlled-native-hook-fixture', version: '1' });
    cleanups.push(() => client.close());
    await client.connect(
      new StreamableHTTPClientTransport(new URL(configuration.serverUrl), {
        requestInit: { headers: configuration.headers },
      }),
    );
    const native = client.callTool({
      name: 'ask_user',
      arguments: { question: 'Controlled question' },
    });
    const fact = await f.permission();
    expect(fact.interaction.kind).toBe('question');
    await f.bridge.respond(fact.key, {
      requestId: randomUUID(),
      kind: 'question',
      answer: { optionIds: [], text: 'Controlled answer' },
    });
    expect(await native).toMatchObject({
      content: [
        { type: 'text', text: JSON.stringify({ selections: [], text: 'Controlled answer' }) },
      ],
    });
    expect(f.facts.filter((entry) => entry.kind === 'interaction')).toHaveLength(1);
  });

  it('admits one canonical permission and reports delivery only after exact hook response flush', async () => {
    const f = await fixture();
    const native = f.post('pre-tool-use', f.body());
    const fact = await f.permission();
    expect(fact.interaction.kind).toBe('permission');
    const response = {
      requestId: randomUUID(),
      kind: 'permission' as const,
      decision: 'allow' as const,
    };
    await expect(f.bridge.respond(fact.key, response)).resolves.toEqual({
      deliveredKeys: [fact.key],
    });
    await expect(native).resolves.toEqual({ decision: 'allow' });
    await expect(f.bridge.respond(fact.key, response)).resolves.toEqual({
      deliveredKeys: [fact.key],
    });
    await expect(
      f.bridge.respond(fact.key, { ...response, decision: 'deny' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(f.post('pre-tool-use', f.body())).resolves.toEqual({ decision: 'deny' });
    expect(f.facts.filter((entry) => entry.kind === 'interaction')).toHaveLength(1);
  });

  it('denies before activation, wrong correlation, malformed input and invalid private authorization', async () => {
    const f = await fixture(false);
    await expect(f.post('pre-tool-use', f.body())).resolves.toEqual({ decision: 'deny' });
    f.bridge.activate();
    await expect(
      f.post('pre-tool-use', { ...f.body(), conversationId: 'another' }),
    ).resolves.toEqual({ decision: 'deny' });
    await expect(f.post('pre-tool-use', { nonsense: true })).resolves.toEqual({ decision: 'deny' });
    await writeFile(
      f.configurationPath,
      JSON.stringify({
        ...f.bridge.nativeHookClientConfiguration,
        token: 'Bearer ' + 'x'.repeat(43),
      }),
    );
    await expect(f.post('pre-tool-use', f.body())).resolves.toEqual({ decision: 'deny' });
    expect(f.facts).toEqual([]);
  });

  it('expires a disconnected permission without replaying its answer', async () => {
    const f = await fixture();
    const abort = new AbortController();
    const native = f.post('pre-tool-use', f.body(), abort.signal);
    const fact = await f.permission();
    abort.abort();
    await expect(native).resolves.toEqual({ decision: 'deny' });
    await vi.waitFor(() =>
      expect(f.facts.some((entry) => entry.kind === 'interaction-expired')).toBe(true),
    );
    await expect(
      f.bridge.respond(fact.key, {
        requestId: randomUUID(),
        kind: 'permission',
        decision: 'allow',
      }),
    ).rejects.toMatchObject({ code: 'INTERACTION_EXPIRED' });
  });

  it('rechecks physical cwd immediately before grant', async () => {
    const f = await fixture();
    const cwd = join(f.workspace, 'cwd');
    const outside = join(f.root, 'outside');
    await mkdir(cwd);
    await mkdir(outside);
    const input = f.body();
    input.toolCall.args.Cwd = cwd;
    const native = f.post('pre-tool-use', input);
    const fact = await f.permission();
    await rename(cwd, join(f.workspace, 'original'));
    await symlink(outside, cwd, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(
      f.bridge.respond(fact.key, {
        requestId: randomUUID(),
        kind: 'permission',
        decision: 'allow',
      }),
    ).rejects.toThrow();
    await expect(native).resolves.toEqual({ decision: 'deny' });
    expect(f.facts.some((entry) => entry.kind === 'interaction-expired')).toBe(true);
  });

  it('does not grant after the operation-owned context changes while waiting', async () => {
    const f = await fixture();
    const native = f.post('pre-tool-use', f.body());
    const fact = await f.permission();
    f.context.nativeSessionId = 'changed-native-context';
    await expect(
      f.bridge.respond(fact.key, {
        requestId: randomUUID(),
        kind: 'permission',
        decision: 'allow',
      }),
    ).rejects.toMatchObject({ code: 'INTERACTION_EXPIRED' });
    await expect(native).resolves.toEqual({ decision: 'deny' });
  });

  it('accepts fullyIdle only from a matching native Stop hook', async () => {
    const f = await fixture();
    const controller = new AbortController();
    const waiting = f.bridge.awaitNativeIdle(controller.signal);
    const stop = {
      conversationId: f.context.nativeSessionId,
      workspacePaths: [f.workspace],
      executionNum: 1,
      terminationReason: 'model_stop',
      fullyIdle: false,
    };
    await expect(f.post('stop', stop)).resolves.toEqual({ decision: 'stop' });
    await expect(
      f.post('stop', { ...stop, conversationId: 'other', fullyIdle: true }),
    ).resolves.toEqual({ decision: 'deny' });
    controller.abort(new Error('controlled-stop-not-idle'));
    await expect(waiting).rejects.toThrow('controlled-stop-not-idle');
    await expect(f.post('stop', { ...stop, fullyIdle: true })).resolves.toEqual({
      decision: 'stop',
    });
    await f.bridge.awaitNativeIdle(new AbortController().signal);
  });

  it('revokes idle evidence after another native tool and rejects stale Stop replay', async () => {
    const f = await fixture();
    const stop = {
      conversationId: f.context.nativeSessionId,
      workspacePaths: [f.workspace],
      executionNum: 1,
      terminationReason: 'NO_TOOL_CALL',
      fullyIdle: true,
    };
    await expect(f.post('stop', stop)).resolves.toEqual({ decision: 'stop' });
    const tool = f.body();
    tool.toolCall = {
      name: 'list_dir',
      args: { DirectoryPath: f.workspace },
    } as unknown as typeof tool.toolCall;
    await expect(f.post('pre-tool-use', tool)).resolves.toEqual({ decision: 'allow' });
    await expect(f.post('stop', stop)).resolves.toEqual({ decision: 'deny' });
    const controller = new AbortController();
    const idle = f.bridge.awaitNativeIdle(controller.signal);
    controller.abort(new Error('not-idle'));
    await expect(idle).rejects.toThrow('not-idle');
    await expect(f.post('stop', { ...stop, executionNum: 2 })).resolves.toEqual({
      decision: 'stop',
    });
  });

  it('accepts a final idle Stop after native background continuation within the same execution number', async () => {
    const f = await fixture();
    const stop = {
      conversationId: f.context.nativeSessionId,
      workspacePaths: [f.workspace],
      executionNum: 0,
      terminationReason: 'NO_TOOL_CALL',
      fullyIdle: false,
    };
    await expect(f.post('stop', stop)).resolves.toEqual({ decision: 'stop' });
    await expect(
      f.post('pre-tool-use', {
        conversationId: f.context.nativeSessionId,
        workspacePaths: [f.workspace],
        stepIdx: 1,
        toolCall: { name: 'list_dir', args: { DirectoryPath: f.workspace } },
      }),
    ).resolves.toEqual({ decision: 'allow' });
    await expect(f.post('stop', { ...stop, fullyIdle: true })).resolves.toEqual({
      decision: 'stop',
    });
    await f.bridge.awaitNativeIdle(new AbortController().signal);
    await expect(f.post('stop', stop)).resolves.toEqual({ decision: 'deny' });
  });

  it('denies untrusted client configuration and oversized helper input without external network calls', async () => {
    const f = await fixture();
    await writeFile(
      f.configurationPath,
      JSON.stringify({
        ...f.bridge.nativeHookClientConfiguration,
        baseUrl: 'https://external.invalid',
      }),
    );
    await expect(f.post('pre-tool-use', f.body())).resolves.toEqual({ decision: 'deny' });
    await expect(
      runAntigravityHook({
        hook: 'pre-tool-use',
        configurationPath: f.configurationPath,
        input: Buffer.alloc(65_537),
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ decision: 'deny' });
    expect(f.facts).toEqual([]);
  });

  it('refuses an auto_approve response instead of bypassing native sandbox fallback', async () => {
    const f = await fixture();
    const server = createServer((request, response) => {
      request.resume();
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ decision: 'auto_approve' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Controlled listener unavailable.');
    }

    await writeFile(
      f.configurationPath,
      JSON.stringify({
        ...f.bridge.nativeHookClientConfiguration,
        baseUrl: `http://127.0.0.1:${address.port}`,
      }),
    );
    await expect(f.post('pre-tool-use', f.body())).resolves.toEqual({ decision: 'deny' });
    expect(f.facts).toEqual([]);
  });
});
