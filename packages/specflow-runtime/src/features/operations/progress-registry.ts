import {
  isTerminalOperationProgressEvent,
  type OperationProgressEvent,
  type OperationStepStatus,
} from '@nevo/specflow-contracts/operations';

/**
 * Generic, in-memory progress broadcaster for long-running operations. Any operation publishes
 * through the tiny {@link OperationProgressReporter} interface; subscribers (the SSE endpoint)
 * read through {@link OperationProgressRegistry.watch}. Nothing here knows an operation kind.
 *
 * Event ids are per-operation and strictly monotonic, so `Last-Event-ID` resumption works. State is
 * deliberately not durable: the durable source of truth stays the operation's own journal and
 * inspection endpoint.
 */

export interface OperationProgressReporter {
  /** Moves a declared step; unknown ids and repeated statuses are ignored. */
  step(stepId: string, status: Exclude<OperationStepStatus, 'pending'>): void;
  /** Finishes every unfinished step as done and publishes the typed result. */
  complete(result: unknown): void;
  /** Terminal failure. Only a stable code is published, never server text. */
  fail(code: string): void;
  /** Terminal: the operation needs operator recovery. */
  recoveryRequired(): void;
}

export interface BeginOperationProgress {
  readonly operationId: string;
  readonly kind: string;
  /** The checklist of this run, in order. */
  readonly steps: readonly string[];
}

export interface StoredProgressEvent {
  /** Absent for synthetic events that must not move `Last-Event-ID` (e.g. not found). */
  readonly id?: number;
  readonly event: OperationProgressEvent;
}

export interface WatchOperationProgressOptions {
  readonly lastEventId?: number;
  /** How long to wait for an operation that has not been reserved yet (default 30 s). */
  readonly waitMs?: number;
  readonly signal?: AbortSignal;
}

export interface OperationProgressRegistry {
  begin(input: BeginOperationProgress): OperationProgressReporter;
  watch(
    operationId: string,
    kind: string,
    options?: WatchOperationProgressOptions,
  ): AsyncGenerator<StoredProgressEvent>;
  /** Number of retained operations (observability and tests). */
  size(): number;
}

export interface OperationProgressRegistryOptions {
  /** How long a finished operation stays replayable (default 60 s). */
  readonly graceMs?: number;
  readonly now?: () => Date;
}

export const DEFAULT_PROGRESS_WAIT_MS = 30_000;
export const OPERATION_NOT_FOUND_CODE = 'OPERATION_NOT_FOUND';

interface Entry {
  readonly operationId: string;
  readonly kind: string;
  readonly steps: { id: string; status: OperationStepStatus }[];
  status: 'running' | 'completed' | 'failed' | 'recovery-required';
  currentStep?: string;
  seq: number;
  readonly log: StoredProgressEvent[];
  readonly listeners: Set<() => void>;
}

const noopReporter: OperationProgressReporter = {
  step: () => undefined,
  complete: () => undefined,
  fail: () => undefined,
  recoveryRequired: () => undefined,
};

export function createOperationProgressRegistry(
  options: OperationProgressRegistryOptions = {},
): OperationProgressRegistry {
  const graceMs = options.graceMs ?? 60_000;
  const now = options.now ?? (() => new Date());
  const entries = new Map<string, Entry>();
  const arrivals = new Map<string, Set<() => void>>();

  const stamp = () => now().toISOString();
  const notify = (entry: Entry) => {
    for (const listener of [...entry.listeners]) listener();
  };

  function publish(entry: Entry, event: (at: string) => OperationProgressEvent): void {
    entry.seq += 1;
    entry.log.push({ id: entry.seq, event: event(stamp()) });
    notify(entry);
  }

  function finish(entry: Entry, status: Exclude<Entry['status'], 'running'>): void {
    entry.status = status;
    delete entry.currentStep;
    setTimeout(() => {
      if (entries.get(entry.operationId) === entry) entries.delete(entry.operationId);
    }, graceMs).unref();
  }

  function reporterFor(entry: Entry): OperationProgressReporter {
    const running = () => entry.status === 'running';
    const moveStep = (stepId: string, status: Exclude<OperationStepStatus, 'pending'>) => {
      const step = entry.steps.find((item) => item.id === stepId);
      if (!step || step.status === status) return;
      step.status = status;
      if (status === 'running') entry.currentStep = stepId;
      else if (entry.currentStep === stepId) delete entry.currentStep;
      publish(entry, (at) => ({
        type: 'step',
        operationId: entry.operationId,
        kind: entry.kind,
        step: stepId,
        status,
        at,
      }));
    };
    return {
      step(stepId, status) {
        if (running()) moveStep(stepId, status);
      },
      complete(result) {
        if (!running()) return;
        for (const step of entry.steps) {
          if (step.status !== 'done' && step.status !== 'skipped') moveStep(step.id, 'done');
        }
        finish(entry, 'completed');
        publish(entry, (at) => ({
          type: 'completed',
          operationId: entry.operationId,
          kind: entry.kind,
          result,
          at,
        }));
      },
      fail(code) {
        if (!running()) return;
        finish(entry, 'failed');
        publish(entry, (at) => ({
          type: 'failed',
          operationId: entry.operationId,
          kind: entry.kind,
          code,
          at,
        }));
      },
      recoveryRequired() {
        if (!running()) return;
        finish(entry, 'recovery-required');
        publish(entry, (at) => ({
          type: 'recovery-required',
          operationId: entry.operationId,
          kind: entry.kind,
          at,
        }));
      },
    };
  }

  function snapshotOf(entry: Entry): StoredProgressEvent {
    return {
      id: entry.seq,
      event: {
        type: 'snapshot',
        operationId: entry.operationId,
        kind: entry.kind,
        status: entry.status,
        steps: entry.steps.map((step) => ({ ...step })),
        ...(entry.currentStep ? { currentStep: entry.currentStep } : {}),
        at: stamp(),
      },
    };
  }

  const notFound = (operationId: string, kind: string): StoredProgressEvent => ({
    event: {
      type: 'failed',
      operationId,
      kind,
      code: OPERATION_NOT_FOUND_CODE,
      at: stamp(),
    },
  });

  async function awaitArrival(
    operationId: string,
    waitMs: number,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    if (entries.has(operationId) || signal?.aborted || waitMs <= 0) return;
    await new Promise<void>((resolve) => {
      const set = arrivals.get(operationId) ?? new Set<() => void>();
      arrivals.set(operationId, set);
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', done);
        set.delete(done);
        if (set.size === 0) arrivals.delete(operationId);
        resolve();
      };
      const timer = setTimeout(done, waitMs);
      set.add(done);
      signal?.addEventListener('abort', done, { once: true });
    });
  }

  return {
    begin(input) {
      if (entries.has(input.operationId)) return noopReporter;
      const entry: Entry = {
        operationId: input.operationId,
        kind: input.kind,
        steps: input.steps.map((id) => ({ id, status: 'pending' as const })),
        status: 'running',
        seq: 0,
        log: [],
        listeners: new Set(),
      };
      entries.set(input.operationId, entry);
      for (const wake of [...(arrivals.get(input.operationId) ?? [])]) wake();
      return reporterFor(entry);
    },

    async *watch(operationId, kind, watchOptions = {}) {
      const { signal } = watchOptions;
      await awaitArrival(operationId, watchOptions.waitMs ?? DEFAULT_PROGRESS_WAIT_MS, signal);
      if (signal?.aborted) return;
      const entry = entries.get(operationId);
      // A different kind is indistinguishable from an unknown operation.
      if (entry?.kind !== kind) {
        yield notFound(operationId, kind);
        return;
      }

      let cursor: number;
      const resumable =
        watchOptions.lastEventId !== undefined &&
        watchOptions.lastEventId >= 0 &&
        watchOptions.lastEventId <= entry.seq;
      if (resumable) {
        cursor = watchOptions.lastEventId!;
      } else {
        yield snapshotOf(entry);
        cursor = entry.seq;
        // The terminal event is part of the log; a fresh subscriber of a finished operation also
        // receives it (with its own id) so the consumer handles every run uniformly.
        if (entry.status !== 'running') {
          const terminal = entry.log.at(-1);
          if (terminal && isTerminalOperationProgressEvent(terminal.event)) yield terminal;
          return;
        }
      }

      while (!signal?.aborted) {
        const pending = entry.log.filter((item) => item.id! > cursor);
        for (const item of pending) {
          if (signal?.aborted) return;
          cursor = item.id!;
          yield item;
          if (isTerminalOperationProgressEvent(item.event)) return;
        }
        if (entry.status !== 'running' && cursor >= entry.seq) return;
        await new Promise<void>((resolve) => {
          const wake = () => {
            entry.listeners.delete(wake);
            signal?.removeEventListener('abort', wake);
            resolve();
          };
          entry.listeners.add(wake);
          signal?.addEventListener('abort', wake, { once: true });
          // An event published between the drain above and registering this listener.
          if (entry.seq > cursor || signal?.aborted) wake();
        });
      }
    },

    size: () => entries.size,
  };
}
