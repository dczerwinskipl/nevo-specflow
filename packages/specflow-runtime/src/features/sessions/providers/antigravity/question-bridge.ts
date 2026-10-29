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
import {
  antigravityQuestionSchema,
  prepareAntigravityQuestion,
  antigravityQuestionAnswer,
} from './questions';

export const AntigravityBridgeLimits = {
  requests: 256,
  interactions: 64,
  pendingQuestions: 4,
  concurrentRequests: 8,
  requestBytes: 64 * 1024,
  receiveMs: 5000,
  deliveryMs: 5000,
  setupMs: 10000,
} as const;
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
  question: ReturnType<typeof prepareAntigravityQuestion>;
  response: ServerResponse;
  answer: ReturnType<typeof deferred<string>>;
  delivery: ReturnType<typeof deferred<{ deliveredKeys: readonly string[] }>>;
  state: 'pending' | 'responding' | 'delivered' | 'expired';
  responseFingerprint?: string;
  deliveryTimer?: ReturnType<typeof setTimeout>;
}

/** Invocation-private transport, not a Session driver or a second lifecycle owner.
 * The caller supplies the invocation's existing serialized/backpressured fact sink. */
export async function createAntigravityQuestionBridge(options: {
  invocation: Pick<Invocation, 'sessionId' | 'turnId' | 'invocationId'>;
  emit: EmitFact;
  signal: AbortSignal;
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
    entry.answer.reject(expired());
    entry.delivery.reject(expired());
    await options.emit({ kind: 'interaction-expired', key: entry.key });
  }

  function fail(error: unknown) {
    done.reject(error);
    void close().catch(() => undefined);
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
    pending.set(entry.key, entry);
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
      request.url !== '/mcp' ||
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

  async function close() {
    closing ??= (async () => {
      closed = true;
      active = false;
      options.signal.removeEventListener('abort', onAbort);
      let failure: unknown;
      for (const entry of pending.values()) {
        try {
          await expire(entry);
        } catch (error) {
          failure ??= error;
        }
      }

      try {
        await rpc.close();
      } catch (error) {
        failure ??= error;
      }

      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      pending.clear();
      wireRequests.clear();
      seenRequests.clear();
      if (failure) {
        done.reject(failure);

        if (failure instanceof Error) {
          throw failure;
        }

        throw new Error('Antigravity question transport cleanup failed.');
      }

      done.resolve();
    })();

    return closing;
  }

  const onAbort = () => {
    void close().catch(fail);
  };

  options.signal.addEventListener('abort', onAbort, { once: true });
  try {
    await rpc.connect(transport);
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

      const answer = antigravityQuestionAnswer(entry.question, response);
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
      entry.answer.resolve(answer);

      return entry.delivery.promise;
    },
    close,
    done: done.promise,
  };
}
