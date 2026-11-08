import type { ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';
import {
  createInvocationScope,
  launchOwnedProcess,
  projectProviderEnvironment,
  ProviderProcessError,
} from '../../process';
import type { AntigravityPermissionContext } from '../permissions';
import { DiscoveryLimits, discoveryTool, discoveryTools, parseDiscoveryRequest } from './contract';
import { emptyDiscoveryResult, type DiscoveryResult } from './scan';

// Shared by every invocation/Session in this Runtime process. No unbounded queue.
let runningSearches = 0;

export function createAntigravityDiscovery(options: {
  workspace: string;
  temporaryRoot: string;
  helper: string;
  signal: AbortSignal;
  admitted(): boolean;
  context(): AntigravityPermissionContext | undefined;
  launch?: typeof launchOwnedProcess;
}) {
  const controllers = new Map<string | number, AbortController>();
  const tasks = new Set<Promise<unknown>>();
  const seen = new Set<string | number>();
  let initialized = false;
  let closed = false;
  let cleanupFailed = false;
  const cancel = () => {
    closed = true;
    for (const controller of controllers.values()) {
      controller.abort();
    }
  };

  options.signal.addEventListener('abort', cancel, { once: true });

  function current(binding: AntigravityPermissionContext) {
    const selected = options.context();

    return (
      !closed &&
      options.admitted() &&
      !options.signal.aborted &&
      selected?.discoveryEnabled === true &&
      selected.workspace === options.workspace &&
      selected.nativeTools.includes('call_mcp_tool') &&
      selected.nativeSessionId === binding.nativeSessionId &&
      selected.workspace === binding.workspace &&
      selected.nativeTools === binding.nativeTools
    );
  }

  async function execute(
    id: string | number,
    tool: unknown,
    args: unknown,
    response: ServerResponse,
  ): Promise<DiscoveryResult> {
    const selected = options.context();
    const binding = selected ? Object.freeze({ ...selected }) : undefined;
    if (!binding || !current(binding) || !discoveryTool(tool)) {
      throw new Error('Discovery is not admitted for this invocation.');
    }

    const request = parseDiscoveryRequest(tool, args);
    if (runningSearches >= DiscoveryLimits.concurrent) {
      return emptyDiscoveryResult('failed', 'runtime-discovery-busy');
    }

    runningSearches++;
    const controller = new AbortController();
    controllers.set(id, controller);
    const onClose = () => {
      if (!response.writableFinished) {
        controller.abort();
      }
    };

    response.once('close', onClose);
    const signal = AbortSignal.any([
      options.signal,
      controller.signal,
      AbortSignal.timeout(DiscoveryLimits.durationMs),
    ]);
    let owner: Awaited<ReturnType<typeof launchOwnedProcess>> | undefined;
    let outcome: DiscoveryResult;
    let verified = true;
    let forced: boolean;
    try {
      const scope = await createInvocationScope(options.temporaryRoot, randomUUID());
      owner = await (options.launch ?? launchOwnedProcess)({
        invocationId: randomUUID(),
        scope,
        executable: process.execPath,
        args: ['--max-old-space-size=128', options.helper, 'workspace-discovery'],
        cwd: options.workspace,
        environment: projectProviderEnvironment({ host: process.env }),
        signal,
        maxFrameBytes: 64 * 1024,
      });
      await owner.write(JSON.stringify({ workspace: options.workspace, tool, request }) + '\n');
      await owner.endInput();
      let result: DiscoveryResult | undefined;
      for await (const line of owner.lines()) {
        if (result) {
          throw new Error('Duplicate discovery result.');
        }

        const value: unknown = JSON.parse(line);
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error('Invalid discovery result.');
        }

        const data = value as DiscoveryResult;
        if (
          !['complete', 'partial', 'truncated', 'cancelled', 'failed'].includes(data.status) ||
          !Array.isArray(data.entries) ||
          !Array.isArray(data.matches) ||
          !Array.isArray(data.issues) ||
          !Array.isArray(data.reasons) ||
          !data.counts ||
          Buffer.byteLength(line) > DiscoveryLimits.outputBytes
        ) {
          throw new Error('Invalid discovery result.');
        }

        result = data;
      }

      const exit = await owner.done;
      if (!current(binding) || signal.aborted) {
        outcome = emptyDiscoveryResult('cancelled', 'discovery-expired');
      } else {
        if (!result || exit.code !== 0 || exit.signal !== null) {
          throw new Error('Discovery did not finish cleanly.');
        }

        outcome = result;
      }
    } catch (error) {
      if (
        error instanceof ProviderProcessError &&
        error.cleanup.some((issue) => issue.code === 'PROCESS_NOT_STOPPED')
      ) {
        cleanupFailed = true;
        verified = false;
      }

      outcome = emptyDiscoveryResult(
        signal.aborted ? 'cancelled' : 'failed',
        signal.aborted ? 'discovery-cancelled-or-time-limit' : 'discovery-process-failed',
      );
    } finally {
      const receipt = await owner?.dispose().catch(() => undefined);
      response.removeListener('close', onClose);
      controllers.delete(id);
      runningSearches--;
      forced = receipt?.process.state === 'stopped' && receipt.process.reason === 'tree-killed';
      if (owner && receipt?.process.state !== 'stopped') {
        cleanupFailed = true;
        verified = false;
      }
    }

    if (!verified) {
      throw new Error('Discovery process settlement is unverified.');
    }

    return forced && !signal.aborted
      ? emptyDiscoveryResult('failed', 'discovery-forced-stop')
      : outcome;
  }

  async function handle(envelope: Record<string, unknown>, response: ServerResponse) {
    const send = (body: object, status = 200) => {
      if (!response.destroyed) {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(body));
      }
    };

    const id = envelope.id;
    if (envelope.jsonrpc !== '2.0' || typeof envelope.method !== 'string') {
      send({ error: 'Invalid discovery RPC.' }, 400);

      return;
    }

    if (id === undefined) {
      if (envelope.method === 'notifications/cancelled') {
        const params = envelope.params as { requestId?: string | number } | undefined;
        if (params?.requestId !== undefined) {
          controllers.get(params.requestId)?.abort();
        }
      }

      response.writeHead(202);
      response.end();

      return;
    }

    if (
      (typeof id !== 'string' && (typeof id !== 'number' || !Number.isSafeInteger(id))) ||
      (typeof id === 'string' && id.length > 128) ||
      closed ||
      seen.has(id) ||
      seen.size >= 256
    ) {
      send({ error: 'Expired or excessive discovery RPC.' }, 409);

      return;
    }

    seen.add(id);
    const fail = (message: string) =>
      send({ jsonrpc: '2.0', id, error: { code: -32602, message } });
    try {
      const params = envelope.params as Record<string, unknown> | undefined;
      if (envelope.method === 'initialize') {
        if (initialized || !SUPPORTED_PROTOCOL_VERSIONS.includes(String(params?.protocolVersion))) {
          throw new Error('Unsupported discovery initialization.');
        }

        initialized = true;
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: params!.protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: 'specflow-discovery', version: '1' },
          },
        });
      } else if (!initialized) {
        throw new Error('Initialize discovery first.');
      } else if (envelope.method === 'tools/list') {
        send({ jsonrpc: '2.0', id, result: { tools: discoveryTools } });
      } else if (envelope.method === 'ping') {
        send({ jsonrpc: '2.0', id, result: {} });
      } else if (envelope.method === 'tools/call') {
        const task = execute(id, params?.name, params?.arguments, response);
        tasks.add(task);
        let result;
        try {
          result = await task;
        } finally {
          tasks.delete(task);
        }

        send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            isError: result.status === 'failed' || result.status === 'cancelled',
          },
        });
      } else {
        throw new Error('Unsupported discovery method.');
      }
    } catch {
      fail('Invalid, unavailable or expired workspace discovery request.');
    }
  }

  return {
    handle,
    cancel,
    processSettlementVerified: () => !cleanupFailed && tasks.size === 0,
    async close() {
      cancel();
      options.signal.removeEventListener('abort', cancel);
      await Promise.allSettled([...tasks]);
      seen.clear();
      if (cleanupFailed) {
        throw new Error('Discovery process settlement is unverified.');
      }
    },
  };
}
