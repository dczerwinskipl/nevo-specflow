import { expect, it } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Invocation } from '../../driver';
import type { DriverFact } from '../../../persistence/protocol';
import {
  createInvocationScope,
  launchOwnedProcess,
  projectProviderEnvironment,
} from '../../process';
import { createAntigravityQuestionBridge } from '../question-bridge';
import { createAntigravityOperation } from '../operation';
import { antigravityHooks } from '../hook-launcher';

// Explicit opt-in selects only an executable. HOME, credentials and inference
// are always synthetic; no installed personal profile is consulted.
const executable = process.env.NEVO_TEST_ANTIGRAVITY_EXE;
it.runIf(process.platform === 'win32' && process.arch === 'x64' && !!executable)(
  'uses native MCP discovery and existing file reads in one production operation without duplicate actions',
  async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'f14-native-')));
    const home = join(root, 'home');
    const workspace = join(root, 'workspace');
    await mkdir(join(home, '.gemini', 'config'), { recursive: true });
    await mkdir(join(home, '.gemini', 'antigravity-cli'), { recursive: true });
    await mkdir(join(workspace, 'nested'), { recursive: true });
    const target = join(workspace, 'nested', 'code.txt');
    await writeFile(target, 'controlled needle');
    const helper = fileURLToPath(import.meta.resolve('@nevo/specflow-runtime/antigravity-hook'));
    const controller = new AbortController();
    const facts: DriverFact[] = [];
    const emit = (fact: DriverFact) => {
      facts.push(fact);

      return Promise.resolve();
    };

    let nativeSessionId = '';
    let nativeTools: readonly string[] = [];
    const invocation: Invocation = {
      sessionId: randomUUID(),
      turnId: randomUUID(),
      invocationId: randomUUID(),
      request: {
        requestId: randomUUID(),
        message: 'Controlled local protocol test. Complete the requested project discovery.',
      },
      selection: {
        providerId: 'antigravity',
        mode: 'workspace-write',
        providerModeId: 'accept-edits',
      },
      executionContext: {
        kind: 'workspace-write',
        workspace,
        temporaryRoot: root,
        workspaceIdentity: 'synthetic-workspace',
        admission: { operationId: randomUUID(), scope: 'project' },
      },
      providerContext: { nativeSessionId: randomUUID(), resume: false },
      beforeDispatch: () => Promise.resolve(),
    };
    const bridge = await createAntigravityQuestionBridge({
      invocation,
      emit,
      signal: controller.signal,
      discovery: { workspace, temporaryRoot: root, helper },
      permissionContext: () =>
        nativeSessionId
          ? {
              nativeSessionId,
              nativeTools,
              workspace,
              writable: true,
              commandsAllowed: true,
              discoveryEnabled: true,
            }
          : undefined,
    });
    const requests = [
      {
        name: 'call_mcp_tool',
        args: {
          ServerName: 'specflow-discovery',
          ToolName: 'list_directory',
          Arguments: { path: 'nested' },
        },
      },
      {
        name: 'call_mcp_tool',
        args: {
          ServerName: 'specflow-discovery',
          ToolName: 'find_files',
          Arguments: { pattern: '*.txt' },
        },
      },
      {
        name: 'call_mcp_tool',
        args: {
          ServerName: 'specflow-discovery',
          ToolName: 'search_text',
          Arguments: { query: 'needle', includes: ['**/*.txt'] },
        },
      },
      {
        name: 'view_file',
        args: { AbsolutePath: target, StartLine: 1, EndLine: 1 },
      },
    ];
    let proposed = 0;
    let backendCalls = 0;
    let inventoryAdvertised = false;
    const respond = async (request: IncomingMessage, response: ServerResponse) => {
      let body = '';
      for await (const chunk of request) {
        body += String(chunk);
      }

      if (!request.url?.includes('streamGenerateContent') || ++backendCalls > 12) {
        response.writeHead(404);
        response.end();

        return;
      }

      const payload = JSON.parse(body) as {
        tools?: { functionDeclarations?: { name: string }[] }[];
        systemInstruction?: unknown;
      };
      const toolNames =
        payload.tools?.flatMap((t) => t.functionDeclarations?.map((t) => t.name) ?? []) ?? [];
      const next = requests[proposed];
      if (proposed === 0 && toolNames.includes('call_mcp_tool')) {
        const prompt = JSON.stringify(payload.systemInstruction);
        inventoryAdvertised = [
          'specflow-discovery',
          'list_directory',
          'find_files',
          'search_text',
        ].every((name) => prompt.includes(name));
      }

      const call = next && toolNames.includes(next.name) ? requests[proposed++] : undefined;
      const parts = call
        ? [
            {
              functionCall: {
                name: call.name,
                args: {
                  ...call.args,
                  toolAction: call.name === 'write_to_file' ? 'write' : 'read',
                  toolSummary: 'Controlled protocol fixture',
                },
              },
            },
          ]
        : [{ text: 'Controlled protocol fixture complete.' }];
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(
        'data: ' +
          JSON.stringify({
            candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP', index: 0 }],
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
          }) +
          '\n\n',
      );
    };

    const server = createServer((request, response) => {
      void respond(request, response).catch(() => response.destroy());
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const configurationPath = join(root, 'hook-client.json');
    await writeFile(configurationPath, JSON.stringify(bridge.nativeHookClientConfiguration));
    await writeFile(
      join(home, '.gemini', 'config', 'mcp_config.json'),
      JSON.stringify(bridge.configuration),
    );
    await writeFile(
      join(home, '.gemini', 'config', 'hooks.json'),
      JSON.stringify(
        antigravityHooks({ systemRoot: process.env.SystemRoot!, node: process.execPath, helper }),
      ),
    );
    await writeFile(
      join(home, '.gemini', 'antigravity-cli', 'settings.json'),
      JSON.stringify({
        trustedWorkspaces: [workspace],
        modelProvider: 'gemini',
        model: 'f14-local',
        customModelsConfig: {
          customModels: {
            'f14-local': {
              modelName: `gemini-api://${base}/models/f14-local`,
              label: 'f14-local',
              toolFormatterType: 'TOOL_FORMATTER_TYPE_NONE',
            },
          },
        },
        toolPermission: 'proceed-in-sandbox',
        allowNonWorkspaceAccess: false,
        enableTerminalSandbox: true,
        permissions: { allow: bridge.discoveryPermissionRules },
      }),
    );
    const environment = projectProviderEnvironment({
      host: process.env,
      configured: {
        HOME: home,
        USERPROFILE: home,
        APPDATA: join(home, 'appdata'),
        LOCALAPPDATA: join(home, 'local'),
        NO_COLOR: '1',
        AGY_CLI_DISABLE_AUTO_UPDATE: 'true',
        GOOGLE_GEMINI_BASE_URL: base,
      },
      secrets: { GEMINI_API_KEY: 'synthetic-f14-key' },
      runtime: { NEVO_ANTIGRAVITY_HOOK_CONFIG: configurationPath },
    });
    const operation = createAntigravityOperation(invocation, emit, controller.signal, {
      launch: async (signal) => ({
        owner: await launchOwnedProcess({
          invocationId: invocation.invocationId,
          scope: await createInvocationScope(root, randomUUID()),
          executable: executable!,
          args: [
            '--input-format',
            'stream-json',
            '--output-format',
            'stream-json',
            '--disable-slash-commands',
            '--sandbox',
            '--mode',
            'accept-edits',
            '--model',
            'f14-local',
          ],
          cwd: workspace,
          environment,
          signal,
        }),
        interactions: bridge,
      }),
      beforeInput: (init) => {
        nativeSessionId = init.conversationId;
        nativeTools = init.tools;

        return Promise.resolve();
      },
    });
    const deadline = setTimeout(() => controller.abort(), 25000);
    try {
      await operation.done;
      expect(proposed).toBe(4);
      expect(inventoryAdvertised).toBe(true);
      expect(await operation.settlement).toMatchObject({
        process: 'stopped',
        source: 'native-result',
        result: { outcome: 'completed' },
      });
      expect(await readFile(target, 'utf8')).toBe('controlled needle');
      const outputs = facts.filter((f) => f.kind === 'text' && f.channel === 'tool-output');
      expect(JSON.stringify(outputs)).toContain('nested/code.txt');
      expect(JSON.stringify(outputs)).toContain('controlled needle');
      expect(facts.filter((f) => f.kind === 'work-open' && f.workKind === 'tool')).toHaveLength(4);
      expect(facts.filter((f) => f.kind === 'action-open')).toHaveLength(4);
      expect(facts.filter((f) => f.kind === 'interaction')).toEqual([]);
    } finally {
      clearTimeout(deadline);
      controller.abort();
      await operation.done;
      await bridge.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  },
  30000,
);
