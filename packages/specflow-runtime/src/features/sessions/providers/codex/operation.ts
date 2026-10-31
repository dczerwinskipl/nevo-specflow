import type { RespondInteraction } from '@nevo/specflow-contracts/sessions';
import type { DriverFact } from '../../persistence/protocol';
import { SessionError } from '../../errors';
import {
  ProviderTimeouts,
  type EmitFact,
  type Invocation,
  type ProviderOperation,
} from '../driver';
import type { launchOwnedProcess } from '../process';
import { ProviderProcessError } from '../process';
import { createCodexRpc, CodexRpcError, rpcObject, type RpcId } from './rpc';
import {
  initializeCodex,
  codexMetadata,
  codexThreadSettings,
  verifyCodexThread,
  codexModels,
} from './connection';
import { codexMode, codexSandbox } from './modes';
import { createCodexProtocol } from './protocol';
import { prepareCodexQuestions } from './questions';
import { prepareCodexPermission } from './permissions';
import { createHash } from 'node:crypto';

type Process = Pick<Awaited<ReturnType<typeof launchOwnedProcess>>, 'write' | 'lines' | 'dispose'>;
type Questions =
  ReturnType<typeof prepareCodexQuestions> | ReturnType<typeof prepareCodexPermission>;
export function createCodexOperation(
  invocation: Invocation,
  emit: EmitFact,
  signal: AbortSignal,
  options: {
    workspace: string;
    home(): string;
    launch(signal: AbortSignal): Promise<Process>;
    beforeInput?(signal: AbortSignal): Promise<void>;
  },
): ProviderOperation {
  const context = invocation.providerContext;
  if (!context || !invocation.beforeDispatch) {
    throw new SessionError('SESSION_RECOVERY_REQUIRED', 'Durable provider context is required.');
  }

  let owner: Process | undefined;
  let peer: ReturnType<typeof createCodexRpc> | undefined;
  let protocol: ReturnType<typeof createCodexProtocol> | undefined;
  let nativeThreadId: string | undefined;
  let expectedModelId: string | undefined;
  let closed = false;
  let dispatched = false;
  let sequence = 0;
  let pendingOutcome: Extract<DriverFact, { kind: 'outcome' }> | undefined;
  let lost = false;
  const settlement = Promise.withResolvers<Awaited<NonNullable<ProviderOperation['settlement']>>>();
  let terminal!: () => void;
  const terminalPromise = new Promise<void>((resolve) => {
    terminal = resolve;
  });
  const groups = new Map<RpcId, Questions>();
  const pending = new Map<string, { requestId: RpcId; group: Questions; index: number }>();
  const seen = new Map<RpcId, string>();
  const controller = new AbortController();
  const operationSignal = controller.signal;
  let interruptSent = false;
  let cancellationDeadline: ReturnType<typeof setTimeout> | undefined;
  function cancel() {
    if (closed) {
      return;
    }

    if (!dispatched) {
      controller.abort(signal.reason);

      return;
    }

    cancellationDeadline ??= setTimeout(() => controller.abort('interrupt-timeout'), 5000);
    cancellationDeadline.unref();
    if (interruptSent || !peer || !protocol?.turnId) {
      return;
    }

    interruptSent = true;
    // Never await a client RPC inside the inbound reader: its reply uses that reader.
    void peer
      .request(
        'turn/interrupt',
        { threadId: nativeThreadId, turnId: protocol.turnId },
        operationSignal,
      )
      .catch(() => controller.abort('interrupt-failed'));
  }

  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) {
    cancel();
  }

  const publish: EmitFact = async (fact) => {
    if (fact.kind === 'outcome') {
      pendingOutcome = fact;
      terminal();
    } else {
      await emit(fact);
      if (fact.kind === 'lost') {
        lost = true;
      }
    }
  };

  async function expire(requestId: RpcId) {
    const group = groups.get(requestId);
    if (!group) {
      return;
    }

    groups.delete(requestId);
    for (const question of group.questions) {
      pending.delete(question.key);
      await emit({ kind: 'interaction-expired', key: question.key });
    }
  }

  const done = (async () => {
    let deadline = setTimeout(
      () => controller.abort('launch-timeout'),
      ProviderTimeouts.discoveryMs,
    );
    deadline.unref();
    let failure: unknown;
    try {
      owner = await options.launch(operationSignal);
      clearTimeout(deadline);
      deadline = setTimeout(
        () => controller.abort('initialize-timeout'),
        ProviderTimeouts.initializeMs,
      );
      deadline.unref();
      peer = createCodexRpc(owner, async (message) => {
        if (message.id !== undefined) {
          if (
            !protocol?.turnId ||
            message.params.threadId !== nativeThreadId ||
            message.params.turnId !== protocol.turnId
          ) {
            await peer!.reject(message.id);

            throw new CodexRpcError('protocol');
          }

          const hash = createHash('sha256').update(JSON.stringify(message)).digest('hex');
          if (seen.has(message.id)) {
            if (seen.get(message.id) !== hash) {
              throw new CodexRpcError('protocol');
            }

            return;
          }

          if (seen.size >= 1024) {
            throw new CodexRpcError('capacity');
          }

          seen.set(message.id, hash);
          if (
            message.method === 'item/commandExecution/requestApproval' ||
            (message.method === 'item/fileChange/requestApproval' &&
              (invocation.selection.mode !== 'workspace-write' || message.params.grantRoot != null))
          ) {
            await peer!.reply(message.id, { decision: 'decline' });
            await emit({
              kind: 'text',
              key: 'permission-policy:' + ++sequence,
              channel: 'commentary',
              text: 'Codex requested permissions beyond the managed execution policy; the request was denied.',
            });

            return;
          }

          let group: Questions;
          try {
            if (message.method === 'item/tool/requestUserInput') {
              group = prepareCodexQuestions(message.params, ++sequence);
            } else if (
              message.method === 'item/fileChange/requestApproval' &&
              typeof message.params.itemId === 'string'
            ) {
              group = prepareCodexPermission(
                protocol.patchTargets(message.params.itemId) ?? [],
                ++sequence,
              );
            } else {
              await peer!.reject(message.id);

              throw new CodexRpcError('protocol');
            }
          } catch (error) {
            if (error instanceof SessionError && error.code === 'CAPABILITY_UNSUPPORTED') {
              await peer!.reject(message.id);

              return;
            }

            throw error;
          }

          if (pending.size + group.questions.length > 32) {
            throw new CodexRpcError('capacity');
          }

          groups.set(message.id, group);
          for (const [index, question] of group.questions.entries()) {
            pending.set(question.key, { requestId: message.id, group, index });
            await emit({
              kind: 'work-open',
              key: question.key,
              workKind: 'interaction',
              title:
                question.interaction.kind === 'permission' ? 'Codex permission' : 'Codex question',
            });
            await emit({ kind: 'interaction', ...question });
          }

          return;
        }

        if (message.method === 'serverRequest/resolved') {
          const requestId = message.params.requestId;
          if (typeof requestId !== 'string' && typeof requestId !== 'number') {
            throw new CodexRpcError('protocol');
          }

          await expire(requestId);

          return;
        }

        if (message.method === 'thread/settings/updated') {
          if (!nativeThreadId || message.params.threadId !== nativeThreadId || !expectedModelId) {
            throw new CodexRpcError('protocol');
          }

          const settings = rpcObject(message.params.threadSettings);
          verifyCodexThread(
            {
              ...settings,
              sandbox: settings.sandboxPolicy,
              thread: { id: nativeThreadId, ephemeral: false },
            },
            options.workspace,
            nativeThreadId,
            invocation.selection,
          );
          const collaboration = rpcObject(settings.collaborationMode);
          const collaborationSettings = rpcObject(collaboration.settings);
          if (
            settings.model !== expectedModelId ||
            settings.modelProvider !== 'openai' ||
            collaboration.mode !== codexMode(invocation.selection).nativeMode ||
            collaborationSettings.model !== expectedModelId ||
            (invocation.selection.effort && settings.effort !== invocation.selection.effort)
          ) {
            throw new CodexRpcError('protocol');
          }

          return;
        }

        if (codexMetadata(message)) {
          return;
        }

        // thread/resume can publish the previous native Turn's usage before its
        // reply. It is a historical snapshot, not a fact for this new invocation.
        // Current-turn cumulative samples are normalized after dispatch below.
        if (
          !dispatched &&
          context.resume &&
          message.method === 'thread/tokenUsage/updated' &&
          message.params.threadId === context.nativeSessionId
        ) {
          return;
        }

        if (!protocol) {
          throw new CodexRpcError('protocol');
        }

        if (message.method === 'turn/completed' && groups.size) {
          throw new CodexRpcError('protocol');
        }

        await protocol.accept(message);
        if (signal.aborted) {
          cancel();
        }
      });
      await initializeCodex(peer, operationSignal, options.home());
      const account = rpcObject(
        await peer.request('account/read', { refreshToken: false }, operationSignal),
      );
      if (rpcObject(account.account).type !== 'chatgpt') {
        throw new SessionError(
          'PROVIDER_AUTH_REQUIRED',
          'Codex ChatGPT authentication is required.',
        );
      }

      const models = await codexModels(peer, operationSignal);
      const mode = codexMode(invocation.selection);
      const settings = codexThreadSettings(
        options.workspace,
        invocation.selection.modelId,
        invocation.selection,
      );
      const response = context.resume
        ? await peer.request(
            'thread/resume',
            { ...settings, threadId: context.nativeSessionId, excludeTurns: true },
            operationSignal,
          )
        : await peer.request('thread/start', { ...settings, ephemeral: false }, operationSignal);
      const threadId = verifyCodexThread(
        response,
        options.workspace,
        context.resume ? context.nativeSessionId : undefined,
        invocation.selection,
      );
      const modelId = rpcObject(response).model;
      const model = models.find((item) => item.modelId === modelId);
      if (!model || (invocation.selection.modelId && modelId !== invocation.selection.modelId)) {
        throw new SessionError(
          'MODEL_UNSUPPORTED',
          'Codex did not select the requested available model.',
        );
      }

      expectedModelId = model.modelId;
      if (invocation.selection.effort && !model.efforts.includes(invocation.selection.effort)) {
        throw new SessionError(
          'CAPABILITY_UNSUPPORTED',
          'Requested Codex effort is unavailable for this model.',
        );
      }

      nativeThreadId = threadId;
      await emit({ kind: 'correlation', providerSessionId: threadId });
      protocol = createCodexProtocol(
        publish,
        threadId,
        !context.resume,
        options.workspace,
        mode.mode === 'workspace-write',
        { turnId: invocation.turnId, modelId: model.modelId },
      );
      await options.beforeInput?.(operationSignal);
      signal.throwIfAborted();
      await invocation.beforeDispatch!();
      operationSignal.throwIfAborted();
      dispatched = true;
      signal.throwIfAborted();
      const started = rpcObject(
        await peer.request(
          'turn/start',
          {
            threadId,
            clientUserMessageId: invocation.turnId,
            cwd: options.workspace,
            input: [{ type: 'text', text: invocation.request.message, text_elements: [] }],
            approvalPolicy: mode.approval,
            approvalsReviewer: 'user',
            sandboxPolicy: codexSandbox(options.workspace, mode),
            collaborationMode: {
              mode: mode.nativeMode,
              settings: {
                model: model.modelId,
                reasoning_effort: invocation.selection.effort ?? null,
                developer_instructions: null,
              },
            },
            ...(invocation.selection.modelId ? { model: invocation.selection.modelId } : {}),
            ...(invocation.selection.effort ? { effort: invocation.selection.effort } : {}),
          },
          operationSignal,
        ),
      );
      const turn = rpcObject(started.turn);
      protocol.bindTurn(turn.id);
      if (signal.aborted) {
        cancel();
      }

      if (!['inProgress', 'completed', 'failed', 'interrupted'].includes(String(turn.status))) {
        throw new CodexRpcError('protocol');
      }

      clearTimeout(deadline);
      await Promise.race([
        terminalPromise,
        peer.done.then(() => {
          throw new CodexRpcError('transport');
        }),
      ]);
    } catch (error) {
      failure = error;
    } finally {
      clearTimeout(deadline);
      closed = true;
      clearTimeout(cancellationDeadline);
      signal.removeEventListener('abort', cancel);
      const disposition = peer
        ? await peer.close().catch(() => undefined)
        : owner
          ? await owner.dispose().catch(() => undefined)
          : undefined;
      const unknown =
        (owner !== undefined && disposition?.process.state !== 'stopped') ||
        (failure instanceof ProviderProcessError &&
          failure.cleanup.some((issue) => issue.code === 'PROCESS_NOT_STOPPED'));
      let result: Extract<DriverFact, { kind: 'outcome' }> | undefined;
      if (!unknown && pendingOutcome && !lost) {
        result = pendingOutcome;
      } else if (!unknown && signal.aborted) {
        result = {
          kind: 'outcome',
          outcome: signal.reason === 'shutdown' ? 'interrupted' : 'cancelled',
        };
      } else if (!unknown && !dispatched) {
        result = {
          kind: 'outcome',
          outcome: 'failed',
          error:
            failure instanceof SessionError
              ? { code: failure.code, message: failure.message }
              : {
                  code: 'PROVIDER_UNAVAILABLE',
                  message: 'Codex could not initialize the requested operation.',
                },
        };
      }

      settlement.resolve({
        process: unknown ? 'unknown' : 'stopped',
        source: unknown
          ? 'unverified'
          : pendingOutcome && !lost
            ? 'native-result'
            : !dispatched
              ? 'not-started'
              : signal.aborted
                ? 'forced-stop'
                : 'unverified',
        ...(result ? { result } : {}),
      });
      for (const requestId of [...groups.keys()]) {
        await expire(requestId);
      }

      pending.clear();
      seen.clear();
      if (unknown) {
        await emit({ kind: 'lost', message: 'Codex process-tree settlement is unknown.' });
      } else if (result) {
        if (result.error) {
          await emit({
            kind: 'text',
            key: 'provider-error',
            channel: 'commentary',
            text: result.error.message,
          });
        }

        await emit(result);
      } else if (protocol) {
        await protocol.end();
      } else {
        await emit({ kind: 'lost', message: 'Codex operation outcome is unknown.' });
      }
    }
  })();

  return {
    done,
    settlement: settlement.promise,
    async respond(key: string, response: RespondInteraction) {
      const entry = pending.get(key);
      if (closed || !entry || !peer) {
        throw new SessionError('INTERACTION_EXPIRED', 'The native question expired.');
      }

      const answer = entry.group.respond(entry.index, response);
      pending.delete(key);
      if (answer) {
        let delivered = false;
        await peer.reply(entry.requestId, answer, () => {
          delivered = groups.has(entry.requestId);

          return delivered;
        });
        groups.delete(entry.requestId);

        return {
          deliveredKeys: delivered ? entry.group.questions.map((question) => question.key) : [],
        };
      }

      return { deliveredKeys: [] };
    },
  };
}
