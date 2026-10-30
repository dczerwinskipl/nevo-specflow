import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import type { RespondInteraction } from '@nevo/specflow-contracts/sessions';
import type { EmitFact, Invocation } from '../driver';
import { SessionError } from '../../errors';
import type { DriverFact } from '../../persistence/protocol';
import {
  prepareAntigravityPermission,
  validateAntigravityHookBinding,
  type AntigravityPermissionContext,
} from './permissions';
import {
  antigravityQuestionSchema,
  prepareAntigravityQuestion,
  antigravityQuestionAnswer,
} from './questions';

import { AntigravityBridgeLimits } from './bridge-limits';
export { AntigravityBridgeLimits } from './bridge-limits';
const serverName = 'specflow-interactions';
const toolName = 'ask_user';
type RpcId = string | number;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // A connection may disappear before the canonical respond operation consumes it.
  // Keep the original rejected promise observable without an unhandled rejection.
  void promise.catch(() => undefined);

  return { promise, resolve, reject };
}

interface PendingQuestion {
  key: string;
  question: Extract<DriverFact, { kind: 'interaction' }>['interaction'];
  revalidate?: () => Promise<void>;
  response: ServerResponse;
  answer: ReturnType<typeof deferred<string>>;
  delivery: ReturnType<typeof deferred<{ deliveredKeys: readonly string[] }>>;
  state: 'pending' | 'responding' | 'delivered' | 'expired';
  responseFingerprint?: string;
  deliveryTimer?: ReturnType<typeof setTimeout>;
  humanTimer?: ReturnType<typeof setTimeout>;
}

/** Invocation-private transport, not a Session driver or a second lifecycle owner.
 * The caller supplies the invocation's existing serialized/backpressured fact sink. */
export async function createAntigravityQuestionBridge(options: {
  invocation: Pick<Invocation, 'sessionId' | 'turnId' | 'invocationId'>;
  emit: EmitFact;
  signal: AbortSignal;
  permissionContext?: () => AntigravityPermissionContext | undefined;
}) {
  options.signal.throwIfAborted();
  const binding = Object.freeze({ ...options.invocation });
  if (Object.values(binding).some((id) => !id || Buffer.byteLength(id) > 256)) {
    throw new SessionError('SESSION_INPUT_INVALID', 'Invalid interaction invocation binding.');
  }

  const authorization = Buffer.from('Bearer ' + randomBytes(32).toString('base64url'));
  const pending = new Map<string, PendingQuestion>();
  const wireRequests = new Map<RpcId, ServerResponse>();
  const seenRequests = new Set<RpcId>();
  const nativeSteps = new Set<number>();
  let idle = deferred<void>();
  let nativeIdle = false;
  let hookGeneration = 0;
  let lastStop: { execution: number; generation: number; fullyIdle: boolean } | undefined;
  const done = deferred<void>();
  let active = false;
  let closed = false;
  let inFlight = 0;
  let host = '';
  let closing: Promise<void> | undefined;
  const rpc = new Server({ name: serverName, version: '1.0.0' }, { capabilities: { tools: {} } });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    enableJsonResponse: true,
  });

  function expired() {
    return new SessionError('INTERACTION_EXPIRED', 'The Antigravity question transport expired.');
  }

  async function expire(entry: PendingQuestion) {
    if (entry.state === 'expired' || entry.state === 'delivered') {
      return;
    }

    entry.state = 'expired';
    clearTimeout(entry.deliveryTimer);
    clearTimeout(entry.humanTimer);
    entry.answer.reject(expired());
    entry.delivery.reject(expired());
    await options.emit({ kind: 'interaction-expired', key: entry.key });
  }

  function fail(error: unknown) {
    done.reject(error);
    void close().catch(() => undefined);
  }

  function nativeBusy() {
    hookGeneration++;
    if (nativeIdle) {
      nativeIdle = false;
      idle = deferred<void>();
    }
  }

  rpc.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: toolName,
        description:
          'Ask the user a question and wait for their answer. This does not authorize tool execution.',
        inputSchema: antigravityQuestionSchema,
      },
    ],
  }));
  rpc.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (!active || closed || request.params.name !== toolName) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Interaction transport is not active for this request.',
      );
    }

    if (
      pending.size >= AntigravityBridgeLimits.interactions ||
      [...pending.values()].filter(
        (entry) => entry.state === 'pending' || entry.state === 'responding',
      ).length >= AntigravityBridgeLimits.pendingQuestions
    ) {
      throw new McpError(ErrorCode.InvalidRequest, 'Interaction capacity exceeded.');
    }

    const response = wireRequests.get(extra.requestId);
    if (!response) {
      throw new McpError(ErrorCode.InvalidRequest, 'Missing live interaction transport.');
    }

    let question: ReturnType<typeof prepareAntigravityQuestion>;
    try {
      question = prepareAntigravityQuestion(request.params.arguments);
    } catch {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid question.');
    }

    const entry: PendingQuestion = {
      key: 'antigravity-question-' + randomUUID(),
      question,
      response,
      answer: deferred<string>(),
      delivery: deferred<{ deliveredKeys: readonly string[] }>(),
      state: 'pending',
    };
    nativeBusy();
    pending.set(entry.key, entry);
    entry.humanTimer = setTimeout(() => {
      void expire(entry).catch(fail);
    }, AntigravityBridgeLimits.humanResponseMs);
    const onAbort = () => {
      void expire(entry).catch(fail);
    };

    extra.signal.addEventListener('abort', onAbort, { once: true });
    response.once('close', () => {
      if (!response.writableFinished) {
        onAbort();
      }
    });
    response.once('finish', () => {
      if (entry.state !== 'responding') {
        return;
      }

      entry.state = 'delivered';
      clearTimeout(entry.deliveryTimer);
      clearTimeout(entry.humanTimer);
      entry.delivery.resolve({ deliveredKeys: [entry.key] });
    });
    try {
      await options.emit({ kind: 'interaction', key: entry.key, interaction: question });
      if (extra.signal.aborted || closed || response.destroyed) {
        await expire(entry);

        throw expired();
      }

      const text = await entry.answer.promise;

      return { content: [{ type: 'text' as const, text }] };
    } catch (error) {
      await expire(entry).catch(fail);
      if (!(error instanceof SessionError)) {
        fail(error);
      }

      throw new McpError(ErrorCode.InternalError, 'The question could not be delivered.');
    } finally {
      extra.signal.removeEventListener('abort', onAbort);
    }
  });
  const server = createServer((request, response) => {
    void handle(request, response).catch((error) => {
      fail(error);
      if (!response.headersSent) {
        response.writeHead(500);
      }

      response.end();
    });
  });
  server.maxConnections = AntigravityBridgeLimits.concurrentRequests * 2;
  server.headersTimeout = AntigravityBridgeLimits.receiveMs;
  server.requestTimeout = AntigravityBridgeLimits.receiveMs;
  server.keepAliveTimeout = 1000;
  server.on('error', fail);

  function deny(response: ServerResponse, status: number) {
    response.writeHead(status, { connection: 'close', 'cache-control': 'no-store' });
    response.end();
  }

  async function handle(request: IncomingMessage, response: ServerResponse) {
    response.setHeader('cache-control', 'no-store');
    const credential = Buffer.from(request.headers.authorization ?? '');
    if (
      closed ||
      !['/mcp', '/hooks/pre-tool-use', '/hooks/stop'].includes(request.url ?? '') ||
      request.headers.host !== host ||
      request.headers.origin !== undefined ||
      credential.length !== authorization.length ||
      !timingSafeEqual(credential, authorization)
    ) {
      deny(response, 403);

      return;
    }

    if (inFlight >= AntigravityBridgeLimits.concurrentRequests) {
      deny(response, 429);

      return;
    }

    if (request.method !== 'POST') {
      deny(response, 405);

      return;
    }

    inFlight++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        inFlight--;
      }
    };

    response.once('close', release);
    response.once('finish', release);
    const body = await new Promise<Buffer | undefined>((resolve) => {
      let bytes = 0;
      const chunks: Buffer[] = [];
      let finished = false;
      const timer = setTimeout(() => finish(undefined, 408), AntigravityBridgeLimits.receiveMs);
      function finish(value?: Buffer, status?: number) {
        if (finished) {
          return;
        }

        finished = true;
        clearTimeout(timer);
        if (status) {
          deny(response, status);
          request.resume();
        }

        resolve(value);
      }

      request.on('data', (chunk: Buffer) => {
        if (finished) {
          return;
        }

        bytes += chunk.length;
        if (bytes > AntigravityBridgeLimits.requestBytes) {
          finish(undefined, 413);
        } else {
          chunks.push(chunk);
        }
      });
      request.once('end', () => finish(Buffer.concat(chunks)));
      request.once('error', () => finish(undefined, 400));
      request.once('aborted', () => finish(undefined));
    });
    if (!body || closed) {
      return;
    }

    let envelope: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error();
      }

      envelope = value as Record<string, unknown>;
    } catch {
      deny(response, 400);

      return;
    }

    if (request.url !== '/mcp') {
      await handleHook(request.url!, envelope, response);

      return;
    }

    const id = envelope.id;
    if (id !== undefined) {
      if (
        (typeof id !== 'string' && (typeof id !== 'number' || !Number.isSafeInteger(id))) ||
        (typeof id === 'string' && Buffer.byteLength(id) > 256)
      ) {
        deny(response, 400);

        return;
      }

      if (seenRequests.has(id)) {
        deny(response, 409);

        return;
      }

      if (seenRequests.size >= AntigravityBridgeLimits.requests) {
        deny(response, 429);

        return;
      }

      seenRequests.add(id);
      wireRequests.set(id, response);
      response.once('close', () => wireRequests.delete(id));
    }

    await transport.handleRequest(request, response, envelope);
  }

  function hookJson(response: ServerResponse, value: object) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(value));
  }

  async function handleHook(
    route: string,
    envelope: Record<string, unknown>,
    response: ServerResponse,
  ) {
    const selectedContext = options.permissionContext?.();
    if (!active || closed || !selectedContext) {
      hookJson(response, { decision: 'deny' });

      return;
    }

    const context = Object.freeze({ ...selectedContext });
    const assertCurrent = () => {
      const current = options.permissionContext?.();
      if (
        !active ||
        closed ||
        options.signal.aborted ||
        response.destroyed ||
        current?.nativeSessionId !== context.nativeSessionId ||
        current.workspace !== context.workspace ||
        current.writable !== context.writable ||
        current.commandsAllowed !== context.commandsAllowed
      ) {
        throw expired();
      }
    };

    try {
      const bound = validateAntigravityHookBinding(envelope, context);
      if (route === '/hooks/stop') {
        if (
          typeof bound.fullyIdle !== 'boolean' ||
          !Number.isSafeInteger(bound.executionNum) ||
          (bound.executionNum as number) < 0 ||
          typeof bound.terminationReason !== 'string'
        ) {
          throw new Error('Invalid native stop evidence.');
        }

        const execution = bound.executionNum as number;
        if (
          lastStop &&
          (execution < lastStop.execution ||
            (execution === lastStop.execution &&
              lastStop.fullyIdle &&
              (hookGeneration !== lastStop.generation || !bound.fullyIdle)))
        ) {
          throw new Error('Stale native stop evidence.');
        }

        if (
          [...pending.values()].some(
            (entry) => entry.state === 'pending' || entry.state === 'responding',
          )
        ) {
          throw new Error('Native stop conflicts with unresolved interactions.');
        }

        lastStop = { execution, generation: hookGeneration, fullyIdle: bound.fullyIdle };
        if (bound.fullyIdle) {
          nativeIdle = true;
          idle.resolve();
        } else if (nativeIdle) {
          nativeIdle = false;
          idle = deferred<void>();
        }

        hookJson(response, { decision: 'stop' });

        return;
      }

      const permission = await prepareAntigravityPermission(envelope, context);
      assertCurrent();
      if (
        nativeSteps.has(permission.step) ||
        nativeSteps.size >= AntigravityBridgeLimits.requests
      ) {
        throw new Error('Duplicate or excessive native hook.');
      }

      nativeSteps.add(permission.step);
      nativeBusy();

      if (!permission.interaction) {
        await permission.revalidate();
        assertCurrent();
        hookJson(response, permission.decision);

        return;
      }

      if (
        pending.size >= AntigravityBridgeLimits.interactions ||
        [...pending.values()].filter(
          (entry) => entry.state === 'pending' || entry.state === 'responding',
        ).length >= AntigravityBridgeLimits.pendingQuestions
      ) {
        throw new Error('Interaction capacity exceeded.');
      }

      const entry: PendingQuestion = {
        key: 'antigravity-permission-' + randomUUID(),
        question: permission.interaction,
        revalidate: async () => {
          assertCurrent();
          await permission.revalidate();
          assertCurrent();
        },
        response,
        answer: deferred<string>(),
        delivery: deferred<{ deliveredKeys: readonly string[] }>(),
        state: 'pending',
      };
      pending.set(entry.key, entry);
      entry.humanTimer = setTimeout(() => {
        void expire(entry).catch(fail);
      }, AntigravityBridgeLimits.humanResponseMs);
      response.once('close', () => {
        if (!response.writableFinished) {
          void expire(entry).catch(fail);
        }
      });
      response.once('finish', () => {
        if (entry.state === 'responding') {
          entry.state = 'delivered';
          clearTimeout(entry.deliveryTimer);
          clearTimeout(entry.humanTimer);
          entry.delivery.resolve({ deliveredKeys: [entry.key] });
        }
      });
      try {
        await options.emit({
          kind: 'interaction',
          key: entry.key,
          interaction: permission.interaction,
        });
        if (closed || response.destroyed) {
          throw expired();
        }

        const answer = await entry.answer.promise;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(answer);
      } catch (error) {
        await expire(entry).catch(fail);
        if (!(error instanceof SessionError)) {
          fail(error);
        }

        if (!response.destroyed && !response.headersSent) {
          hookJson(response, { decision: 'deny' });
        }
      }
    } catch {
      if (!response.destroyed && !response.headersSent) {
        hookJson(response, { decision: 'deny' });
      }
    }
  }

  async function close() {
    closing ??= (async () => {
      closed = true;
      active = false;
      idle.reject(expired());
      options.signal.removeEventListener('abort', onAbort);
      // Revoke the listener and native transports independently of persistence.
      // A stalled store must not keep an authenticated question endpoint alive.
      const expiration = [...pending.values()].map(expire);
      const transportClosing = rpc.close();
      server.closeAllConnections();
      const listenerClosing = new Promise<void>((resolve) => server.close(() => resolve()));
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const settled = await Promise.race([
          Promise.allSettled([...expiration, transportClosing, listenerClosing]),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Antigravity question transport cleanup timed out.')),
              AntigravityBridgeLimits.cleanupMs,
            );
          }),
        ]);
        const failure = settled.find((result) => result.status === 'rejected');
        if (failure?.status === 'rejected') {
          throw failure.reason instanceof Error
            ? failure.reason
            : new Error('Antigravity question transport cleanup failed.');
        }

        done.resolve();
      } catch (error) {
        done.reject(error);

        throw error;
      } finally {
        clearTimeout(timer);
        pending.clear();
        wireRequests.clear();
        seenRequests.clear();
      }
    })();

    return closing;
  }

  const onAbort = () => {
    void close().catch(fail);
  };

  options.signal.addEventListener('abort', onAbort, { once: true });
  try {
    await rpc.connect(transport);
    options.signal.throwIfAborted();
    if (closed) {
      throw expired();
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Interaction listener startup timed out.')),
        AntigravityBridgeLimits.setupMs,
      );
      server.listen(0, '127.0.0.1', () => {
        clearTimeout(timer);
        resolve();
      });
      server.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    options.signal.throwIfAborted();
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Interaction listener unavailable.');
    }

    host = '127.0.0.1:' + address.port;
  } catch (error) {
    await close();

    throw error;
  }

  return {
    /** Private native configuration only; never put its credential in a descriptor or transcript. */
    configuration: {
      mcpServers: {
        [serverName]: {
          serverUrl: 'http://' + host + '/mcp',
          headers: { Authorization: authorization.toString() },
          enabledTools: [toolName],
          timeoutSeconds: -1,
        },
      },
    },
    permissionRule: `mcp(${serverName}/${toolName})`,
    nativeHookClientConfiguration: { baseUrl: 'http://' + host, token: authorization.toString() },
    async awaitNativeIdle(signal: AbortSignal) {
      signal.throwIfAborted();
      if (closed) {
        throw expired();
      }

      if (nativeIdle) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(signal.reason instanceof Error ? signal.reason : expired());
        signal.addEventListener('abort', abort, { once: true });
        void idle.promise
          .then(resolve, reject)
          .finally(() => signal.removeEventListener('abort', abort));
      });
    },
    /** Called by the operation after durable native correlation and dispatch admission. */
    activate() {
      if (closed || options.signal.aborted) {
        throw expired();
      }

      active = true;
    },
    async respond(key: string, response: RespondInteraction) {
      const entry = pending.get(key);
      if (!active || closed || !entry || entry.state === 'expired') {
        throw expired();
      }

      let answer: string;
      if (entry.question.kind === 'permission') {
        if (response.kind !== 'permission') {
          throw new SessionError('INTERACTION_RESPONSE_INVALID', 'Expected a permission response.');
        }

        answer = JSON.stringify({
          // Delegate to the verified native sandbox policy. auto_approve would
          // bypass its fail-closed fallback when the sandbox is unavailable.
          decision: response.decision === 'allow' ? 'allow' : 'deny',
        });
      } else {
        answer = antigravityQuestionAnswer(entry.question, response);
      }

      const fingerprint = JSON.stringify(response);
      if (entry.responseFingerprint !== undefined) {
        if (entry.responseFingerprint !== fingerprint) {
          throw new SessionError(
            'IDEMPOTENCY_CONFLICT',
            'A different answer was already admitted.',
          );
        }

        return entry.delivery.promise;
      }

      entry.responseFingerprint = fingerprint;
      entry.state = 'responding';
      entry.deliveryTimer = setTimeout(() => {
        void expire(entry).catch(fail);
      }, AntigravityBridgeLimits.deliveryMs);
      if (
        entry.question.kind === 'permission' &&
        response.kind === 'permission' &&
        response.decision === 'allow'
      ) {
        try {
          await entry.revalidate?.();
          if (entry.state !== 'responding') {
            throw expired();
          }
        } catch (error) {
          await expire(entry).catch(fail);

          throw error;
        }
      }

      entry.answer.resolve(answer);

      return entry.delivery.promise;
    },
    close,
    done: done.promise,
  };
}
