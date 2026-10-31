import type { ServerResponse } from 'node:http';
import type { EmitFact, Invocation } from '../driver';
import { SessionError } from '../../errors';
import { createMcpQuestionTransport } from '../../interactions/mcp/question-transport';
import { McpQuestionEndpoint } from '../../interactions/mcp/questions';
import {
  prepareAntigravityPermission,
  validateAntigravityHookBinding,
  type AntigravityPermissionContext,
} from './permissions';

// Native tool steps and JSON-RPC requests have independent capacity budgets.
// Bound the per-invocation replay ledger consistently with the native parser.
export const AntigravityHookLimits = { nativeHookCalls: 1024 } as const;

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

/** Native CLI registration and hook policy over the shared invocation transport. */
export async function createAntigravityQuestionBridge(options: {
  invocation: Pick<Invocation, 'sessionId' | 'turnId' | 'invocationId'>;
  emit: EmitFact;
  signal: AbortSignal;
  permissionContext?: () => AntigravityPermissionContext | undefined;
}) {
  const nativeSteps = new Set<number>();
  let idle = deferred<void>();
  let nativeIdle = false;
  let hookGeneration = 0;
  let lastStop: { execution: number; generation: number; fullyIdle: boolean } | undefined;
  function expired() {
    return new SessionError('INTERACTION_EXPIRED', 'The native interaction transport expired.');
  }

  function nativeBusy() {
    hookGeneration++;
    if (nativeIdle) {
      nativeIdle = false;
      idle = deferred<void>();
    }
  }

  const transport = await createMcpQuestionTransport({
    invocation: options.invocation,
    emit: options.emit,
    signal: options.signal,
    onQuestion: nativeBusy,
    onClose: () => idle.reject(expired()),
    routes: {
      '/hooks/pre-tool-use': (body, response) => handleHook('/hooks/pre-tool-use', body, response),
      '/hooks/stop': (body, response) => handleHook('/hooks/stop', body, response),
    },
  });
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
    if (!transport.active || transport.closed || !selectedContext) {
      hookJson(response, { decision: 'deny' });

      return;
    }

    const context = Object.freeze({ ...selectedContext });
    const assertCurrent = () => {
      const current = options.permissionContext?.();
      if (
        !transport.active ||
        transport.closed ||
        options.signal.aborted ||
        response.destroyed ||
        current?.nativeSessionId !== context.nativeSessionId ||
        current.nativeTools !== context.nativeTools ||
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

        if (transport.hasPendingInteractions()) {
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
        nativeSteps.size >= AntigravityHookLimits.nativeHookCalls
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

      try {
        const answer = await transport.requestInteraction({
          keyPrefix: 'antigravity-permission',
          interaction: permission.interaction,
          response,
          revalidate: async (signal) => {
            signal.throwIfAborted();
            assertCurrent();
            await permission.revalidate();
            signal.throwIfAborted();
            assertCurrent();
          },
          encodeResponse(answer) {
            if (answer.kind !== 'permission') {
              throw new SessionError(
                'INTERACTION_RESPONSE_INVALID',
                'Expected a permission response.',
              );
            }

            // Delegate only to the selected native policy, without a bypass override.
            return JSON.stringify({ decision: answer.decision === 'allow' ? 'allow' : 'deny' });
          },
        });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(answer);
      } catch {
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

  const { serverName, toolName } = McpQuestionEndpoint;

  return {
    configuration: {
      mcpServers: {
        [serverName]: {
          serverUrl: transport.endpoint.baseUrl + '/mcp',
          headers: { Authorization: transport.endpoint.authorization },
          enabledTools: [toolName],
          timeoutSeconds: -1,
        },
      },
    },
    permissionRule: 'mcp(' + serverName + '/' + toolName + ')',
    nativeHookClientConfiguration: {
      baseUrl: transport.endpoint.baseUrl,
      token: transport.endpoint.authorization,
    },
    async awaitNativeIdle(signal: AbortSignal) {
      signal.throwIfAborted();
      if (transport.closed) {
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

    activate: () => transport.activate(),
    respond: transport.respond,
    close: transport.close,
    done: transport.done,
  };
}
