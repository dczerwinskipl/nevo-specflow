import { afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { launchOwnedProcess } from '../../process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { DriverFact } from '../../../persistence/protocol';
import { createAntigravityQuestionBridge } from '../question-bridge';
import { emptyDiscoveryResult, type DiscoveryResult } from './scan';

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

export async function discoveryFixture(
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
