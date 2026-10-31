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
import type { EmitFact, Invocation } from '../../providers/driver';
import type { DriverFact } from '../../persistence/protocol';
import { SessionError } from '../../errors';
import {
  mcpQuestionSchema,
  prepareMcpQuestion,
  mcpQuestionAnswer,
  McpQuestionEndpoint,
} from './questions';
import { McpQuestionTransportLimits } from './limits';
export { McpQuestionTransportLimits } from './limits';
const { serverName, toolName } = McpQuestionEndpoint;

export interface TransportInteraction {
  keyPrefix: string;
  interaction: Extract<DriverFact, { kind: 'interaction' }>['interaction'];
  response: ServerResponse;
  signal?: AbortSignal;
  revalidate?: (signal: AbortSignal) => Promise<void>;
  encodeResponse: (response: RespondInteraction) => string;
}
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

interface PendingInteraction {
  key: string;
  interaction: Extract<DriverFact, { kind: 'interaction' }>['interaction'];
  encodeResponse: (response: RespondInteraction) => string;
  revalidate?: (signal: AbortSignal) => Promise<void>;
  validation: AbortController;
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
export async function createMcpQuestionTransport(options: {
  invocation: Pick<Invocation, 'sessionId' | 'turnId' | 'invocationId'>;
  emit: EmitFact;
  signal: AbortSignal;
  /** Adapter-owned routes share the invocation credential, ledger and cleanup. */
  routes?: Readonly<
    Record<string, (envelope: Record<string, unknown>, response: ServerResponse) => Promise<void>>
  >;
  onQuestion?: () => void;
  onClose?: () => void;
}) {
  options.signal.throwIfAborted();
  const binding = Object.freeze({
    sessionId: options.invocation.sessionId,
    turnId: options.invocation.turnId,
    invocationId: options.invocation.invocationId,
  });
  const routes = Object.freeze({ ...options.routes });
  const paths = new Set(['/mcp', ...Object.keys(routes)]);
  if (
    Object.values(binding).some(
      (id) => typeof id !== 'string' || !id || Buffer.byteLength(id) > 256,
    )
  ) {
    throw new SessionError('SESSION_INPUT_INVALID', 'Invalid interaction invocation binding.');
  }

  const authorization = Buffer.from('Bearer ' + randomBytes(32).toString('base64url'));
  const pending = new Map<string, PendingInteraction>();
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
    return new SessionError('INTERACTION_EXPIRED', 'The MCP question transport expired.');
  }

  async function expire(entry: PendingInteraction) {
    if (entry.state === 'expired' || entry.state === 'delivered') {
      return;
    }

    entry.state = 'expired';
    entry.validation.abort(expired());
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

  rpc.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: toolName,
        description:
          'Ask the user a question and wait for their answer. This does not authorize tool execution.',
        inputSchema: mcpQuestionSchema,
      },
    ],
  }));
  function hasCapacity() {
    return (
      pending.size < McpQuestionTransportLimits.interactions &&
      [...pending.values()].filter(
        (entry) => entry.state === 'pending' || entry.state === 'responding',
      ).length < McpQuestionTransportLimits.pendingQuestions
    );
  }

  async function requestInteraction(request: TransportInteraction): Promise<string> {
    if (!active || closed || request.signal?.aborted) {
      throw expired();
    }

    if (!/^[a-z][a-z0-9-]{0,63}$/.test(request.keyPrefix)) {
      throw new SessionError('SESSION_INPUT_INVALID', 'Invalid interaction key prefix.');
    }

    if (!hasCapacity()) {
      throw new SessionError('INTERACTION_EXPIRED', 'Interaction capacity exceeded.');
    }

    const entry: PendingInteraction = {
      validation: new AbortController(),
      key: request.keyPrefix + '-' + randomUUID(),
      interaction: request.interaction,
      encodeResponse: request.encodeResponse,
      revalidate: request.revalidate,
      response: request.response,
      answer: deferred<string>(),
      delivery: deferred<{ deliveredKeys: readonly string[] }>(),
      state: 'pending',
    };
    pending.set(entry.key, entry);
    entry.humanTimer = setTimeout(() => {
      void expire(entry).catch(fail);
    }, McpQuestionTransportLimits.humanResponseMs);
    const onAbort = () => {
      void expire(entry).catch(fail);
    };

    request.signal?.addEventListener('abort', onAbort, { once: true });
    request.response.once('close', () => {
      if (!request.response.writableFinished) {
        onAbort();
      }
    });
    request.response.once('finish', () => {
      if (entry.state !== 'responding') {
        return;
      }

      entry.state = 'delivered';
      clearTimeout(entry.deliveryTimer);
      clearTimeout(entry.humanTimer);
      entry.delivery.resolve({ deliveredKeys: [entry.key] });
    });
    try {
      await options.emit({ kind: 'interaction', key: entry.key, interaction: request.interaction });
      if (request.signal?.aborted || closed || request.response.destroyed) {
        await expire(entry);

        throw expired();
      }

      return await entry.answer.promise;
    } catch (error) {
      await expire(entry).catch(fail);
      if (!(error instanceof SessionError)) {
        fail(error);
      }

      throw error;
    } finally {
      request.signal?.removeEventListener('abort', onAbort);
    }
  }

  rpc.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (!active || closed || request.params.name !== toolName) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Interaction transport is not active for this request.',
      );
    }

    if (!hasCapacity()) {
      throw new McpError(ErrorCode.InvalidRequest, 'Interaction capacity exceeded.');
    }

    const response = wireRequests.get(extra.requestId);
    if (!response) {
      throw new McpError(ErrorCode.InvalidRequest, 'Missing live interaction transport.');
    }

    let question: ReturnType<typeof prepareMcpQuestion>;
    try {
      question = prepareMcpQuestion(request.params.arguments);
    } catch {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid question.');
    }

    options.onQuestion?.();
    try {
      const text = await requestInteraction({
        keyPrefix: 'mcp-question',
        interaction: question,
        response,
        signal: extra.signal,
        encodeResponse: (answer) => mcpQuestionAnswer(question, answer),
      });

      return { content: [{ type: 'text' as const, text }] };
    } catch {
      throw new McpError(ErrorCode.InternalError, 'The question could not be delivered.');
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
  server.maxConnections = McpQuestionTransportLimits.concurrentRequests * 2;
  server.headersTimeout = McpQuestionTransportLimits.receiveMs;
  server.requestTimeout = McpQuestionTransportLimits.receiveMs;
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
      !paths.has(request.url ?? '') ||
      request.headers.host !== host ||
      request.headers.origin !== undefined ||
      credential.length !== authorization.length ||
      !timingSafeEqual(credential, authorization)
    ) {
      deny(response, 403);

      return;
    }

    if (inFlight >= McpQuestionTransportLimits.concurrentRequests) {
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
      const timer = setTimeout(() => finish(undefined, 408), McpQuestionTransportLimits.receiveMs);
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
        if (bytes > McpQuestionTransportLimits.requestBytes) {
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
      const route = routes[request.url!];
      if (!route) {
        deny(response, 403);

        return;
      }

      await route(envelope, response);

      return;
    }

    // One transport owns exactly one MCP session for one Invocation. Replacing
    // the session would lose correlation with pending canonical interactions.
    // End the Invocation rather than silently replaying restarted client IDs.
    if (envelope.method === 'initialize' && transport.sessionId !== undefined) {
      response.once('finish', () => {
        void close().catch(fail);
      });
      deny(response, 409);

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

      if (seenRequests.size >= McpQuestionTransportLimits.requests) {
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
      options.onClose?.();
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
              () => reject(new Error('MCP question transport cleanup timed out.')),
              McpQuestionTransportLimits.cleanupMs,
            );
          }),
        ]);
        const failure = settled.find((result) => result.status === 'rejected');
        if (failure?.status === 'rejected') {
          throw failure.reason instanceof Error
            ? failure.reason
            : new Error('MCP question transport cleanup failed.');
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
        McpQuestionTransportLimits.setupMs,
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
    /** Private transport identity, not a public provider descriptor. */
    endpoint: { baseUrl: 'http://' + host, authorization: authorization.toString() },
    get active() {
      return active;
    },
    get closed() {
      return closed;
    },
    hasPendingInteractions: () =>
      [...pending.values()].some(
        (entry) => entry.state === 'pending' || entry.state === 'responding',
      ),
    requestInteraction,
    activate() {
      if (closed || options.signal.aborted) {
        throw expired();
      }

      active = true;
    },
    async respond(this: void, key: string, response: RespondInteraction) {
      const entry = pending.get(key);
      if (!active || closed || !entry || entry.state === 'expired') {
        throw expired();
      }

      const answer = entry.encodeResponse(response);

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
      }, McpQuestionTransportLimits.deliveryMs);
      if (
        entry.interaction.kind === 'permission' &&
        response.kind === 'permission' &&
        response.decision === 'allow'
      ) {
        try {
          await Promise.race([entry.revalidate?.(entry.validation.signal), entry.delivery.promise]);
          if (entry.state !== 'responding') {
            throw expired();
          }
        } catch (error) {
          void expire(entry).catch(fail);

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
