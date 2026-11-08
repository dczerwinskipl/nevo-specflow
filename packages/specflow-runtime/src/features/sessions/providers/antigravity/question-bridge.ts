import type { ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import type { EmitFact, Invocation } from '../driver';
import { SessionError } from '../../errors';
import { createMcpQuestionTransport } from '../../interactions/mcp/question-transport';
import { McpQuestionEndpoint } from '../../interactions/mcp/questions';
import { stable } from '../../persistence/encoding';
import { acquireWindowsFileAccess, type NativeFileAccess } from '../process/windows-file-access';
import {
  prepareAntigravityPermission,
  validateAntigravityHookBinding,
  type AntigravityPermissionContext,
} from './permissions';

// Native tool steps and JSON-RPC requests have independent capacity budgets.
// Bound the per-invocation replay ledger consistently with the native parser.
export const AntigravityHookLimits = { nativeHookCalls: 1024, activeFileAccess: 32 } as const;

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
export async function createAntigravityQuestionBridge(
  options: {
    invocation: Pick<Invocation, 'sessionId' | 'turnId' | 'invocationId'>;
    emit: EmitFact;
    signal: AbortSignal;
    permissionContext?: () => AntigravityPermissionContext | undefined;
  },
  dependencies: { acquireFileAccess?: typeof acquireWindowsFileAccess } = {},
) {
  const nativeCalls = new Set<string>();
  let admittedNativeCalls = 0;
  const fileAccess = new Map<string, NativeFileAccess>();
  const acquireFileAccess = dependencies.acquireFileAccess ?? acquireWindowsFileAccess;
  const callKey = (body: Record<string, unknown>) =>
    createHash('sha256')
      .update(stable({ step: body.stepIdx, call: body.toolCall }))
      .digest('hex');
  let idle = deferred<void>();
  let nativeIdle = false;
  let hookGeneration = 0;
  let continuationAvailable = true;
  let terminalObserved = false;
  let lastStop:
    { execution: number; generation: number; fullyIdle: boolean; continued: boolean } | undefined;
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
    extension: {
      paths: ['/hooks/pre-tool-use', '/hooks/post-tool-use', '/hooks/stop'],
      handle: handleHook,
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
    if (!transport.active || transport.closed || options.signal.aborted || !selectedContext) {
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
      if (route === '/hooks/post-tool-use') {
        const key = callKey(bound);
        const access = fileAccess.get(key);
        if (access) {
          access.close();
          for (const [alias, value] of fileAccess) {
            if (value === access) {
              fileAccess.delete(alias);
            }
          }
        } else if (!nativeCalls.has(key)) {
          throw expired();
        }

        hookJson(response, {});

        return;
      }

      if (route === '/hooks/stop') {
        if (
          typeof bound.fullyIdle !== 'boolean' ||
          !Number.isSafeInteger(bound.executionNum) ||
          (bound.executionNum as number) < 0 ||
          typeof bound.terminationReason !== 'string'
        ) {
          throw new Error('Invalid native stop evidence.');
        }

        assertCurrent();
        const execution = bound.executionNum as number;
        if (
          lastStop &&
          (execution < lastStop.execution ||
            (execution === lastStop.execution &&
              lastStop.fullyIdle &&
              (hookGeneration !== lastStop.generation || !bound.fullyIdle)) ||
            (execution === lastStop.execution && lastStop.continued))
        ) {
          throw new Error('Stale native stop evidence.');
        }

        const ordinaryCompletion =
          (bound.terminationReason === 'NO_TOOL_CALL' ||
            bound.terminationReason === 'model_stop') &&
          (bound.error === undefined || bound.error === '');
        if (!ordinaryCompletion || terminalObserved) {
          continuationAvailable = false;
        }

        if (transport.hasPendingInteractions() || fileAccess.size) {
          // Stop is not a permission gate: deny also permits native termination.
          // Only ordinary model completion may re-enter this invocation, once.
          // Never reuse its idle evidence or let a retry buy another continuation.
          const resume = continuationAvailable;
          continuationAvailable = false;
          lastStop = { execution, generation: hookGeneration, fullyIdle: false, continued: resume };

          hookJson(response, { decision: resume ? 'continue' : 'stop' });

          return;
        }

        lastStop = {
          execution,
          generation: hookGeneration,
          fullyIdle: bound.fullyIdle,
          continued: false,
        };
        if (bound.fullyIdle) {
          continuationAvailable = false;
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
      const key = callKey(bound);
      if (nativeCalls.has(key) || admittedNativeCalls >= AntigravityHookLimits.nativeHookCalls) {
        throw new Error('Duplicate or excessive native hook.');
      }

      nativeCalls.add(key);
      admittedNativeCalls++;
      nativeBusy();

      if (!permission.interaction) {
        await permission.revalidate();
        assertCurrent();
        if (permission.fileAccess) {
          if (new Set(fileAccess.values()).size >= AntigravityHookLimits.activeFileAccess) {
            throw new Error('Too many native files are still in use.');
          }

          const access = acquireFileAccess(context.workspace, permission.fileAccess.path, {
            directory: false,
            create: permission.fileAccess.create,
          });
          if (access.created) {
            permission.decision.overwrite = { Overwrite: true };
            const call = bound.toolCall as { name: string; args: Record<string, unknown> };
            const updated = callKey({
              ...bound,
              toolCall: { ...call, args: { ...call.args, Overwrite: true } },
            });
            if (updated !== key && nativeCalls.has(updated)) {
              access.close();

              throw new Error('Effective native arguments belong to an earlier call.');
            }

            // The rewritten arguments identify this same operation, including
            // after its PostToolUse receipt has released the native handles.
            nativeCalls.add(updated);
            fileAccess.set(updated, access);
          }

          fileAccess.set(key, access);
        }

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

            return JSON.stringify({
              decision: answer.decision === 'allow' ? 'auto_approve' : 'deny',
            });
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

    observeTerminal() {
      terminalObserved = true;
    },
    activate: () => transport.activate(),
    respond: transport.respond,
    releaseFileAccess() {
      for (const access of new Set(fileAccess.values())) {
        access.close();
      }

      fileAccess.clear();
    },
    close: transport.close,
    done: transport.done,
  };
}
