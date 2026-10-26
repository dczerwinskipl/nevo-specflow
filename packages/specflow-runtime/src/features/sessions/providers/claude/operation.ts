import { randomUUID, createHash } from 'node:crypto';
import type { RespondInteraction } from '@nevo/specflow-contracts/sessions';
import type { DriverFact } from '../../persistence/protocol';
import { SessionError } from '../../errors';
import type { EmitFact, Invocation, ProviderOperation } from '../driver';
import type { launchOwnedProcess } from '../process';
import { ProviderProcessError } from '../process';
import { createClaudeProtocol, ClaudeProtocolError, identifier, object } from './protocol';
import { claudeUserMessage, prepareClaudeQuestion } from './requests';

export type ClaudeProcess = Pick<
  Awaited<ReturnType<typeof launchOwnedProcess>>,
  'write' | 'lines' | 'dispose'
>;
type Questions = Extract<ReturnType<typeof prepareClaudeQuestion>, { kind: 'questions' }>;

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
    initialize(payload: Record<string, unknown>): void;
    verifyFrame?(frame: Record<string, unknown>): void;
  },
): ProviderOperation {
  const context = invocation.providerContext;
  if (!context || !invocation.beforeDispatch)
    throw new SessionError('SESSION_RECOVERY_REQUIRED', 'Durable native context is required.');
  const pending = new Map<string, { group: Questions; index: number; live: boolean }>();
  const groups = new Map<string, Questions>();
  const seen = new Map<string, string>();
  let owner: ClaudeProcess | undefined;
  let closed = false;
  let initialized = false;
  let dispatched = false;
  let pendingOutcome: Extract<DriverFact, { kind: 'outcome' }> | undefined;
  let lost = false;
  let writes = Promise.resolve();
  let queued = 0;
  let queuedBytes = 0;
  const internal = new AbortController();
  const operationSignal = AbortSignal.any([signal, internal.signal]);
  const initializeId = randomUUID();
  async function send(frame: unknown, live: () => boolean = () => true) {
    const line = JSON.stringify(frame) + '\n';
    const bytes = Buffer.byteLength(line);
    if (closed || queued >= 32 || queuedBytes + bytes > 1024 * 1024)
      throw new ClaudeProtocolError();
    queued++;
    queuedBytes += bytes;
    const write = writes.then(async () => {
      if (closed || operationSignal.aborted || !owner) throw new ClaudeProtocolError();
      if (live()) await owner.write(line);
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
    if (fact.kind === 'outcome') pendingOutcome = fact;
    else {
      await emit(fact);
      if (fact.kind === 'lost') lost = true;
    }
  };
  const protocol = createClaudeProtocol(publish, context.nativeSessionId);
  async function outcome(fact: Extract<DriverFact, { kind: 'outcome' }>) {
    // Safe adapter messages must survive reload through the normal bounded conversation,
    // rather than existing only in a transient Turn event or private diagnostics.
    if (fact.error)
      await emit({
        kind: 'text',
        key: 'provider-error',
        channel: 'commentary',
        text: fact.error.message,
      });
    await emit(fact);
  }
  async function expire(group: Questions) {
    groups.delete(group.requestId);
    for (const question of group.questions) {
      const entry = pending.get(question.key);
      if (!entry) continue;
      entry.live = false;
      pending.delete(question.key);
      await publish({ kind: 'interaction-expired', key: question.key });
    }
  }
  const done = (async () => {
    const deadline = setTimeout(() => internal.abort('initialize-timeout'), 10000);
    deadline.unref();
    let failure: unknown;
    try {
      owner = await options.launch(operationSignal);
      await send({
        type: 'control_request',
        request_id: initializeId,
        request: { subtype: 'initialize' },
      });
      for await (const line of owner.lines()) {
        const frame = object(JSON.parse(line));
        if (frame.type === 'control_response') {
          if (initialized) throw new ClaudeProtocolError();
          const response = object(frame.response);
          if (response.request_id !== initializeId || response.subtype !== 'success')
            throw new ClaudeProtocolError();
          options.initialize(object(response.response));
          initialized = true;
          clearTimeout(deadline);
          operationSignal.throwIfAborted();
          await invocation.beforeDispatch!();
          dispatched = true;
          operationSignal.throwIfAborted();
          await send(claudeUserMessage(invocation.request.message, context.nativeSessionId));
          continue;
        }
        if (!initialized) throw new ClaudeProtocolError();
        if (frame.type === 'control_cancel_request') {
          const group = groups.get(identifier(frame.request_id));
          if (group) await expire(group);
          continue;
        }
        if (frame.type === 'control_request') {
          const requestId = identifier(frame.request_id);
          const hash = createHash('sha256').update(line).digest('hex');
          const previous = seen.get(requestId);
          if (previous !== undefined) {
            if (previous !== hash) throw new ClaudeProtocolError();
            continue;
          }
          if (seen.size >= 1024) throw new ClaudeProtocolError();
          seen.set(requestId, hash);
          const request = prepareClaudeQuestion(frame);
          if (request.kind === 'denied') {
            await send(request.response);
            continue;
          }
          if (pending.size + request.questions.length > 32) throw new ClaudeProtocolError();
          groups.set(requestId, request);
          for (const [index, question] of request.questions.entries()) {
            pending.set(question.key, { group: request, index, live: true });
            await publish({
              kind: 'work-open',
              key: question.key,
              workKind: 'interaction',
              title: 'Claude question',
            });
            await publish({ kind: 'interaction', ...question });
          }
          continue;
        }
        if (frame.type === 'result' && pending.size) throw new ClaudeProtocolError();
        options.verifyFrame?.(frame);
        await protocol.accept(line);
        if (protocol.terminal) break;
      }
    } catch (error) {
      failure = error;
    } finally {
      closed = true;
      clearTimeout(deadline);
      const disposition = owner
        ? await owner.dispose().catch(() => ({
            process: { state: 'unknown' as const, reason: 'unverified-tree' as const },
            cleanup: [],
          }))
        : undefined;
      await writes;
      for (const group of [...groups.values()]) await expire(group);
      pending.clear();
      seen.clear();
      if (
        disposition?.process.state === 'unknown' ||
        (failure instanceof ProviderProcessError &&
          failure.cleanup.some((issue) => issue.code === 'PROCESS_NOT_STOPPED'))
      ) {
        await publish({ kind: 'lost', message: 'Claude process-tree settlement is unknown.' });
      } else if (signal.aborted) {
        await outcome({
          kind: 'outcome',
          outcome: signal.reason === 'shutdown' ? 'interrupted' : 'cancelled',
        });
      } else if (pendingOutcome && !lost) {
        await outcome(pendingOutcome);
      } else if (!dispatched) {
        await outcome({
          kind: 'outcome',
          outcome: 'failed',
          error: {
            code: internal.signal.aborted
              ? 'TIMEOUT'
              : failure instanceof SessionError
                ? failure.code === 'PROVIDER_AUTH_REQUIRED'
                  ? 'PROVIDER_AUTH_REQUIRED'
                  : 'PROVIDER_UNAVAILABLE'
                : 'PROVIDER_UNAVAILABLE',
            message: internal.signal.aborted
              ? 'Claude initialization timed out.'
              : 'Claude could not initialize the requested operation.',
          },
        });
      } else if (!lost) {
        await protocol.end();
      }
    }
  })();
  return {
    done,
    async respond(key: string, response: RespondInteraction) {
      const entry = pending.get(key);
      if (closed || !entry?.live)
        throw new SessionError('INTERACTION_EXPIRED', 'The native question expired.');
      const frame = entry.group.respond(entry.index, response);
      pending.delete(key);
      if (frame) {
        await send(frame, () => groups.has(entry.group.requestId));
        groups.delete(entry.group.requestId);
      }
    },
  };
}
