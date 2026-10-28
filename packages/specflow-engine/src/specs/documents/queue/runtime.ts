import type { SpecFlowEngine } from '../../../application';
import type { ResolvedProjectHome } from '../../../project/home/home';
import { openVersionControl } from '../../../version-control';
import type { CommitPort } from '../../../version-control/commits/port';
import type { ExecutorIdentity } from '../changes/journal';
import {
  captureExecutorIdentity,
  nodeProcessTable,
  type ProcessTable,
} from '../write/executor-identity';
import { effectiveSettleMs, DOCUMENT_MAX_HOLD_MS } from './formation';
import {
  sharedSettleLedger,
  systemQueueClock,
  type QueueClock,
  type SettleLedger,
} from './settle-ledger';
import type { QueueCheckout, QueueDependencies, QueueHooks, QueueOptions } from './types';

/** The dependencies and options of one run with every seam filled in. */
export interface QueueRuntime {
  readonly engine: SpecFlowEngine;
  readonly context: ResolvedProjectHome;
  readonly checkout: QueueCheckout;
  readonly commits: CommitPort;
  readonly clock: QueueClock;
  readonly ledger: SettleLedger;
  readonly hooks: QueueHooks;
  readonly deps: QueueDependencies;
  readonly options: QueueOptions;
  readonly table: ProcessTable;
  readonly settleMs: number;
  readonly maxHoldMs: number;
  nowIso(): string;
  executor(): Promise<ExecutorIdentity>;
}

export function createQueueRuntime(
  engine: SpecFlowEngine,
  deps: QueueDependencies,
  checkout: QueueCheckout,
  options: QueueOptions,
): QueueRuntime {
  const clock = deps.clock ?? systemQueueClock;
  const table = deps.processTable ?? nodeProcessTable;
  let captured = deps.executor;
  return {
    engine,
    context: engine.context,
    checkout,
    commits: deps.commits ?? openVersionControl(engine).commits,
    clock,
    ledger: deps.ledger ?? sharedSettleLedger(),
    hooks: deps.hooks ?? {},
    deps,
    options,
    table,
    settleMs: effectiveSettleMs(options.settleMs),
    maxHoldMs: DOCUMENT_MAX_HOLD_MS,
    nowIso: () => new Date(clock.wallMs()).toISOString(),
    executor: async () => {
      captured ??= await captureExecutorIdentity(table);
      return captured;
    },
  };
}
