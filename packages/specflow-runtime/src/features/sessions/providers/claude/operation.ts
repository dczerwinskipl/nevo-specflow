import { randomUUID, createHash } from 'node:crypto';
import { isAllowlistedCliCommand } from '@nevo/specflow-contracts/documents';
import type { RespondInteraction } from '@nevo/specflow-contracts/sessions';
import type { DriverFact } from '../../persistence/protocol';
import { SessionError } from '../../errors';
import type { EmitFact, Invocation, ProviderOperation } from '../driver';
import { ProviderTimeouts } from '../driver';
import type { launchOwnedProcess } from '../process';
import { ProviderProcessError } from '../process';
import { createClaudeProtocol, ClaudeProtocolError, identifier, object } from './protocol';
import type { ProductCliTrust } from './cli-path';
import { claudeUserMessage } from './requests';
import { prepareClaudeRequest } from './permissions';
import { claudeMode, toolsForClaudeMode } from './modes';
import { ClaudeRestrictionError } from './discovery';

export type ClaudeProcess = Pick<
  Awaited<ReturnType<typeof launchOwnedProcess>>,
  'write' | 'lines' | 'dispose'
>;
type Questions = Extract<ReturnType<typeof prepareClaudeRequest>, { kind: 'questions' }>;

/**
 * Why a dispatched operation ended without Claude's authoritative result. Each stays an unknown
 * outcome (the agent may have changed the workspace), but each names what actually happened.
 */
export const claudeLoss = {
  /** This adapter refused a Claude frame and stopped the process; Claude itself was available. */
  rejected:
    'SpecFlow stopped the Claude process because it sent output that SpecFlow does not support.',
  /** Claude closed its output stream before its result: its process ended (exited or crashed). */
  exited: 'The Claude process ended before it reported a result.',
  /** The stdio connection to the running process failed. */
  connection: 'SpecFlow lost its connection to the Claude process.',
} as const;

/** One owner for the bidirectional transport. Waiting for user input never blocks the
 * reader; only persistence and bounded writes apply backpressure. Outcomes are held
 * until process-tree disposal supplies settlement evidence.
 */
export function createClaudeOperation(
  invocation: Invocation,
  emit: EmitFact,
  signal: AbortSignal,
  options: {
    launch(signal: AbortSignal): Promise<ClaudeProcess>;
    initialize(payload: Record<string, unknown>): void | Promise<void>;
    verifyFrame?(frame: Record<string, unknown>): void;
    /** Whether a bare nevo-specflow can only be the product CLI (see cli-path.ts); absent: trusted. */
    productCli?: ProductCliTrust;
  },
): ProviderOperation {
  const context = invocation.providerContext;
  if (!context || !invocation.beforeDispatch) {
    throw new SessionError('SESSION_RECOVERY_REQUIRED', 'Durable native context is required.');
  }

  const pending = new Map<string, { group: Questions; index: number; live: boolean }>();
  const groups = new Map<string, Questions>();
  const seen = new Map<string, string>();
  let owner: ClaudeProcess | undefined;
  let closed = false;
  let distrustReported = false;
  let initialized = false;
  let dispatched = false;
  let pendingOutcome: Extract<DriverFact, { kind: 'outcome' }> | undefined;
  let lost = false;
  let writes = Promise.resolve();
  let queued = 0;
  let queuedBytes = 0;
  const settlement = Promise.withResolvers<Awaited<NonNullable<ProviderOperation['settlement']>>>();
  const internal = new AbortController();
  const operationSignal = internal.signal;
  const initializeId = randomUUID();
  const interruptId = randomUUID();
  let interruptSent = false;
  let cancellationDeadline: ReturnType<typeof setTimeout> | undefined;
  function cancel() {
    if (!dispatched) {
      internal.abort(signal.reason);

      return;
    }

    if (interruptSent || closed) {
      return;
    }

    interruptSent = true;
    cancellationDeadline = setTimeout(() => internal.abort('interrupt-timeout'), 2000);
    cancellationDeadline.unref();
    void send({
      type: 'control_request',
      request_id: interruptId,
      request: { subtype: 'interrupt' },
    }).catch(() => internal.abort('interrupt-write-failed'));
  }

  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) {
    cancel();
  }

  async function send(frame: unknown, live: () => boolean = () => true) {
    const line = JSON.stringify(frame) + '\n';
    const bytes = Buffer.byteLength(line);
    if (closed || queued >= 32 || queuedBytes + bytes > 1024 * 1024) {
      throw new ClaudeProtocolError();
    }

    queued++;
    queuedBytes += bytes;
    const write = writes.then(async () => {
      if (closed || operationSignal.aborted || !owner) {
        throw new ClaudeProtocolError();
      }

      if (live()) {
        await owner.write(line);
      }
    });
    writes = write.catch(() => undefined);
    try {
      await write;
    } finally {
      queued--;
      queuedBytes -= bytes;
    }
  }

  const publish: EmitFact = async (fact) => {
    if (fact.kind === 'outcome') {
      pendingOutcome = fact;
    } else {
      await emit(fact);
      if (fact.kind === 'lost') {
        lost = true;
      }
    }
  };

  const protocol = createClaudeProtocol(
    publish,
    context.nativeSessionId,
    toolsForClaudeMode(claudeMode(invocation.selection)),
    !context.resume,
  );
  async function outcome(fact: Extract<DriverFact, { kind: 'outcome' }>) {
    // Safe adapter messages must survive reload through the normal bounded conversation,
    // rather than existing only in a transient Turn event or private diagnostics.
    if (fact.error) {
      await emit({
        kind: 'text',
        key: 'provider-error',
        channel: 'commentary',
        text: fact.error.message,
      });
    }

    await emit(fact);
  }

  async function expire(group: Questions) {
    groups.delete(group.requestId);
    for (const question of group.questions) {
      const entry = pending.get(question.key);
      if (entry) {
        entry.live = false;
      }

      pending.delete(question.key);
      await publish({ kind: 'interaction-expired', key: question.key });
    }
  }

  const done = (async () => {
    // Admission/discovery and native initialization have separate deadlines. A
    // cold profile refresh must not consume the subsequent handshake's budget.
    let deadline = setTimeout(() => internal.abort('launch-timeout'), ProviderTimeouts.discoveryMs);
    deadline.unref();
    let failure: unknown;
    try {
      owner = await options.launch(operationSignal);
      clearTimeout(deadline);
      deadline = setTimeout(
        () => internal.abort('initialize-timeout'),
        ProviderTimeouts.initializeMs,
      );
      deadline.unref();
      await send({
        type: 'control_request',
        request_id: initializeId,
        request: { subtype: 'initialize' },
      });
      for await (const line of owner.lines()) {
        const frame = object(JSON.parse(line));
        if (frame.type === 'control_response') {
          const response = object(frame.response);
          if (
            initialized &&
            interruptSent &&
            response.request_id === interruptId &&
            response.subtype === 'success'
          ) {
            continue;
          }

          if (initialized) {
            throw new ClaudeProtocolError();
          }

          if (response.request_id !== initializeId || response.subtype !== 'success') {
            throw new ClaudeProtocolError();
          }

          await options.initialize(object(response.response));
          initialized = true;
          clearTimeout(deadline);
          operationSignal.throwIfAborted();
          await invocation.beforeDispatch!();
          dispatched = true;
          signal.throwIfAborted();
          operationSignal.throwIfAborted();
          await send(claudeUserMessage(invocation.request.message, context.nativeSessionId));
          continue;
        }

        if (!initialized) {
          throw new ClaudeProtocolError();
        }

        // The production driver requires the restricted system/init inventory
        // before admitting any host interaction, including permission requests.
        options.verifyFrame?.(frame);
        if (frame.type === 'control_cancel_request') {
          const group = groups.get(identifier(frame.request_id));
          if (group) {
            await expire(group);
          }

          continue;
        }

        if (frame.type === 'control_request') {
          const requestId = identifier(frame.request_id);
          const hash = createHash('sha256').update(line).digest('hex');
          const previous = seen.get(requestId);
          if (previous !== undefined) {
            if (previous !== hash) {
              throw new ClaudeProtocolError();
            }

            continue;
          }

          if (seen.size >= 1024) {
            throw new ClaudeProtocolError();
          }

          seen.set(requestId, hash);
          const request = prepareClaudeRequest(
            frame,
            invocation.selection.mode === 'workspace-write',
          );
          if (request.kind === 'denied') {
            await send(request.response);
            continue;
          }

          if (pending.size + request.questions.length > 32) {
            throw new ClaudeProtocolError();
          }

          // An agent step execution Turn: one exact product CLI call of its allowlist is approved here, never
          // by the provider's own rules (Bash always asks), and recorded in the Turn. Anything else
          // goes to the owner.
          const action = request.questions[0]?.interaction;
          if (
            invocation.permissions &&
            action?.kind === 'permission' &&
            action.action?.operation === 'command' &&
            isAllowlistedCliCommand(action.action.command, invocation.permissions.allow)
          ) {
            const trust = options.productCli;
            if (trust?.trusted === false) {
              // The owner decides; say once why the allowlist is off for this Turn.
              if (!distrustReported) {
                distrustReported = true;
                await publish({
                  kind: 'work-open',
                  key: 'auto-approval-off',
                  workKind: 'commentary',
                  title: 'Product CLI approval off',
                });
                await publish({
                  kind: 'text',
                  key: 'auto-approval-off',
                  channel: 'commentary',
                  text:
                    'Allowlisted product CLI commands are not approved automatically in this Turn: ' +
                    trust.reason,
                });
              }
            } else {
              const key = 'auto-approval:' + requestId;
              await publish({
                kind: 'work-open',
                key,
                workKind: 'commentary',
                title: 'Product CLI auto-approved',
              });
              await publish({
                kind: 'text',
                key,
                channel: 'commentary',
                text: 'Allowed by the archetype allowlist: ' + action.action.command.slice(0, 500),
              });
              await send(request.respond(0, { kind: 'permission', requestId, decision: 'allow' }));
              continue;
            }
          }

          groups.set(requestId, request);
          for (const [index, question] of request.questions.entries()) {
            pending.set(question.key, { group: request, index, live: true });
            await publish({
              kind: 'work-open',
              key: question.key,
              workKind: 'interaction',
              title:
                question.interaction.kind === 'permission'
                  ? 'Claude permission'
                  : 'Claude question',
            });
            await publish({ kind: 'interaction', ...question });
          }

          continue;
        }

        if (frame.type === 'result' && pending.size) {
          throw new ClaudeProtocolError();
        }

        await protocol.accept(line);
        if (protocol.terminal) {
          break;
        }
      }
    } catch (error) {
      failure = error;
    } finally {
      closed = true;
      clearTimeout(deadline);
      clearTimeout(cancellationDeadline);
      signal.removeEventListener('abort', cancel);
      const disposition = owner
        ? await owner.dispose().catch(() => ({
            process: { state: 'unknown' as const, reason: 'unverified-tree' as const },
            cleanup: [],
          }))
        : undefined;
      const unverified =
        disposition?.process.state === 'unknown' ||
        (failure instanceof ProviderProcessError &&
          failure.cleanup.some((issue) => issue.code === 'PROCESS_NOT_STOPPED'));
      let result: Extract<DriverFact, { kind: 'outcome' }> | undefined;
      if (!unverified && pendingOutcome && !lost) {
        result = pendingOutcome;
      } else if (!unverified && signal.aborted) {
        result = {
          kind: 'outcome',
          outcome: signal.reason === 'shutdown' ? 'interrupted' : 'cancelled',
        };
      } else if (!unverified && !dispatched) {
        const error = {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'Claude could not initialize the requested operation.',
        };
        if (internal.signal.aborted) {
          error.code = 'TIMEOUT';
          error.message = 'Claude initialization timed out.';
        } else if (failure instanceof SessionError) {
          // SessionError is the adapter's sanitized public boundary. Preserve its
          // actionable reason; arbitrary native exceptions remain masked.
          error.code = failure.code;
          error.message = failure.message;
        }

        result = {
          kind: 'outcome',
          outcome: 'failed',
          error,
        };
      }

      // Keep proven outcome/liveness evidence even if later canonical persistence
      // fails. This receipt never authorizes replaying native input.
      const source = unverified
        ? 'unverified'
        : pendingOutcome && !lost
          ? 'native-result'
          : !dispatched
            ? 'not-started'
            : signal.aborted
              ? 'forced-stop'
              : 'unverified';
      settlement.resolve({
        process: unverified ? 'unknown' : 'stopped',
        source,
        ...(result ? { result } : {}),
      });
      await writes;
      for (const group of [...groups.values()]) {
        await expire(group);
      }

      pending.clear();
      seen.clear();
      if (unverified) {
        await publish({ kind: 'lost', message: 'Claude process-tree settlement is unknown.' });
      } else if (result) {
        await outcome(result);
      } else if (!lost) {
        await protocol.end(
          failure === undefined
            ? claudeLoss.exited
            : failure instanceof ProviderProcessError
              ? claudeLoss.connection
              : failure instanceof ClaudeRestrictionError
                ? claudeLoss.rejected + ' ' + failure.message
                : failure instanceof ClaudeProtocolError || failure instanceof SyntaxError
                  ? claudeLoss.rejected
                  : undefined,
        );
      }
    }
  })();

  return {
    done,
    settlement: settlement.promise,
    async respond(key: string, response: RespondInteraction) {
      const entry = pending.get(key);
      if (closed || !entry?.live) {
        throw new SessionError('INTERACTION_EXPIRED', 'The native question expired.');
      }

      const frame = entry.group.respond(entry.index, response);
      pending.delete(key);
      if (frame) {
        let delivered = false;
        await send(frame, () => {
          delivered = groups.has(entry.group.requestId);

          return delivered;
        });
        groups.delete(entry.group.requestId);

        return {
          deliveredKeys: delivered ? entry.group.questions.map((question) => question.key) : [],
        };
      }

      return { deliveredKeys: [] };
    },
  };
}
