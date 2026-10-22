import {
  OPERATION_INTERRUPTED_CODE,
  type OperationListCounts,
  type OperationListResponse,
  type OperationSummary,
} from '@nevo/specflow-contracts/operations';

import type { OperationListSource, OperationSourceRow } from './operation-source';
import type {
  OperationProgressListing,
  OperationProgressOutcome,
  OperationProgressRegistry,
} from './progress-registry';

export interface OperationListConfig {
  /** A completed operation stays listed this long (default 10 min). */
  readonly recentlyFinishedMs: number;
  /** A non terminal journal without a live writer idle this long is "interrupted" (default 5 min). */
  readonly staleAfterMs: number;
  /** At most this many completed rows are listed (default 5). */
  readonly maxCompleted: number;
}

export const DEFAULT_OPERATION_LIST_CONFIG: OperationListConfig = {
  recentlyFinishedMs: 10 * 60_000,
  staleAfterMs: 5 * 60_000,
  maxCompleted: 5,
};

export interface BuildOperationListInput {
  readonly sources: readonly OperationListSource[];
  readonly registry: OperationProgressRegistry;
  readonly now: Date;
  readonly config?: Partial<OperationListConfig>;
  /** Per-row admission (the feature capability). Counts are computed after it. */
  readonly admit: (row: OperationSummary) => boolean;
  /** Status filter of the items; counts always cover every admitted row. */
  readonly statuses?: ReadonlySet<string>;
  readonly limit: number;
}

const keyOf = (kind: string, operationId: string) => JSON.stringify([kind, operationId]);

/**
 * Merges the persisted rows of the feature sources with the live progress registry using the
 * documented status table (docs/reference/api/specs-operations-list.md), then applies retention,
 * admission, ordering, counts and the limit. No I/O besides `source.list()`.
 */
export async function buildOperationList(
  input: BuildOperationListInput,
): Promise<OperationListResponse> {
  const config = { ...DEFAULT_OPERATION_LIST_CONFIG, ...input.config };
  const nowMs = input.now.getTime();
  const kinds = new Set(input.sources.map((source) => source.kind));
  const live = new Map<string, OperationProgressListing>();
  for (const item of input.registry.list()) {
    if (kinds.has(item.kind)) live.set(keyOf(item.kind, item.operationId), item);
  }

  const rows: OperationSummary[] = [];
  const seen = new Set<string>();
  for (const source of input.sources) {
    for (const row of await source.list()) {
      const key = keyOf(source.kind, row.operationId);
      seen.add(key);
      rows.push(merge(source.kind, row, live.get(key), nowMs, config));
    }
  }
  // Running before the journal is reserved: only the registry knows the operation. Finished
  // registry-only runs failed before anything was created and are reported by the request itself.
  for (const [key, item] of live) {
    if (seen.has(key) || item.status !== 'running') continue;
    rows.push(fromRegistry(item));
  }

  return shapeOperationList(rows, {
    now: input.now,
    config,
    admit: input.admit,
    ...(input.statuses ? { statuses: input.statuses } : {}),
    limit: input.limit,
  });
}

export interface ShapeOperationListInput {
  readonly now: Date;
  readonly config?: Partial<OperationListConfig>;
  readonly admit: (row: OperationSummary) => boolean;
  readonly statuses?: ReadonlySet<string>;
  readonly limit: number;
}

/**
 * Retention of completed rows, admission, counts (after admission, before the filter), ordering,
 * status filter and limit over already merged rows. Shared with the demo list.
 */
export function shapeOperationList(
  rows: readonly OperationSummary[],
  input: ShapeOperationListInput,
): OperationListResponse {
  const config = { ...DEFAULT_OPERATION_LIST_CONFIG, ...input.config };
  const nowMs = input.now.getTime();
  const admitted = rows.filter((row) => input.admit(row));
  const recent = capCompleted(admitted, config, nowMs);
  const counts = countOf(recent);
  const ordered = [...recent].sort(compareRows);
  const { statuses } = input;
  const filtered = statuses ? ordered.filter((row) => statuses.has(row.status)) : ordered;
  return {
    items: filtered.slice(0, input.limit),
    counts,
    truncated: filtered.length > input.limit,
    generatedAt: input.now.toISOString(),
  };
}

function merge(
  kind: string,
  row: OperationSourceRow,
  reg: OperationProgressListing | undefined,
  nowMs: number,
  config: OperationListConfig,
): OperationSummary {
  const base = {
    operationId: row.operationId,
    kind,
    ...(row.title !== undefined ? { title: row.title } : {}),
    ...(row.subject ? { subject: { ...row.subject } } : {}),
    ...(row.target ? { target: { ...row.target } } : {}),
  };
  const startedAt = row.startedAt ?? reg?.startedAt;
  const withStart = startedAt ? { startedAt } : {};
  const journalSteps = {
    ...(row.currentStep ? { currentStep: row.currentStep } : {}),
    ...(row.steps ? { steps: row.steps.map((step) => ({ ...step })) } : {}),
  };

  const derived = deriveOperationStatus(row, reg, nowMs, config.staleAfterMs);
  switch (derived.source) {
    case 'journal-completed': {
      const finishedAt =
        reg?.status === 'completed' && reg.finishedAt ? reg.finishedAt : row.updatedAt;
      return {
        ...base,
        status: 'completed',
        ...journalSteps,
        ...withStart,
        updatedAt: finishedAt,
        finishedAt,
      };
    }
    case 'journal-recovery':
    case 'idle':
      return {
        ...base,
        status: 'recovery-required',
        ...journalSteps,
        ...withStart,
        ...(derived.code ? { code: derived.code } : {}),
        updatedAt: row.updatedAt,
      };
    case 'journal-in-progress':
      return {
        ...base,
        status: 'in-progress',
        ...journalSteps,
        ...withStart,
        updatedAt: row.updatedAt,
      };
    case 'registry':
      break;
  }
  // Only reached with a live registry outcome overlaying a non terminal journal.
  const live = reg!;
  switch (live.status) {
    case 'running':
      return {
        ...base,
        status: 'in-progress',
        ...liveSteps(live),
        ...withStart,
        updatedAt: later(live.updatedAt, row.updatedAt),
      };
    case 'failed':
      return {
        ...base,
        status: 'failed',
        ...(live.code ? { code: live.code } : {}),
        ...withStart,
        updatedAt: live.updatedAt,
        ...(live.finishedAt ? { finishedAt: live.finishedAt } : {}),
      };
    case 'recovery-required':
      return {
        ...base,
        status: 'recovery-required',
        ...withStart,
        updatedAt: later(live.updatedAt, row.updatedAt),
      };
    case 'completed':
      return {
        ...base,
        status: 'completed',
        ...withStart,
        updatedAt: live.updatedAt,
        finishedAt: live.finishedAt ?? live.updatedAt,
      };
  }
}

/** What the status table decided and which rule decided it. */
export interface DerivedOperationStatus {
  readonly status: 'in-progress' | 'failed' | 'recovery-required' | 'completed';
  /** Stable code of a failed or recovery-required result when known. */
  readonly code?: string;
  readonly source:
    'journal-completed' | 'journal-recovery' | 'registry' | 'idle' | 'journal-in-progress';
}

/**
 * THE status table (docs/reference/api/specs-operations-list.md), shared by the list and by the
 * per-operation inspection so both always agree: a terminal journal wins, else the live registry
 * outcome (also a recently failed one) decides, else a journal idle longer than `staleAfterMs`
 * without a live writer is interrupted (`OPERATION_INTERRUPTED`), else it is in progress.
 */
export function deriveOperationStatus(
  row: Pick<OperationSourceRow, 'state' | 'code' | 'updatedAt'>,
  reg: { readonly status: OperationProgressOutcome['status']; readonly code?: string } | undefined,
  nowMs: number,
  staleAfterMs: number = DEFAULT_OPERATION_LIST_CONFIG.staleAfterMs,
): DerivedOperationStatus {
  if (row.state === 'completed') return { status: 'completed', source: 'journal-completed' };
  if (row.state === 'recovery-required') {
    return {
      status: 'recovery-required',
      ...(row.code ? { code: row.code } : {}),
      source: 'journal-recovery',
    };
  }
  if (reg) {
    return {
      status: reg.status === 'running' ? 'in-progress' : reg.status,
      ...(reg.status === 'failed' && reg.code ? { code: reg.code } : {}),
      source: 'registry',
    };
  }
  if (nowMs - Date.parse(row.updatedAt) > staleAfterMs) {
    return {
      status: 'recovery-required',
      code: OPERATION_INTERRUPTED_CODE,
      source: 'idle',
    };
  }
  return { status: 'in-progress', source: 'journal-in-progress' };
}

function liveSteps(reg: OperationProgressListing) {
  return {
    ...(reg.currentStep ? { currentStep: reg.currentStep } : {}),
    steps: reg.steps.map((step) => ({ ...step })),
  };
}

function fromRegistry(item: OperationProgressListing): OperationSummary {
  return {
    operationId: item.operationId,
    kind: item.kind,
    status: 'in-progress',
    ...liveSteps(item),
    startedAt: item.startedAt,
    updatedAt: item.updatedAt,
  };
}

function later(a: string, b: string): string {
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

const finishedOf = (row: OperationSummary) => Date.parse(row.finishedAt ?? row.updatedAt);

/** Completed rows outside the recent window are not listed; at most `maxCompleted`, newest first. */
function capCompleted(
  rows: readonly OperationSummary[],
  config: OperationListConfig,
  nowMs: number,
): OperationSummary[] {
  const recent = rows
    .filter(
      (row) => row.status === 'completed' && nowMs - finishedOf(row) < config.recentlyFinishedMs,
    )
    .sort((a, b) => finishedOf(b) - finishedOf(a))
    .slice(0, config.maxCompleted);
  return [...rows.filter((row) => row.status !== 'completed'), ...recent];
}

function countOf(rows: readonly OperationSummary[]): OperationListCounts {
  const counts = { inProgress: 0, recoveryRequired: 0, failed: 0, completed: 0 };
  for (const row of rows) {
    if (row.status === 'in-progress') counts.inProgress += 1;
    else if (row.status === 'recovery-required') counts.recoveryRequired += 1;
    else if (row.status === 'failed') counts.failed += 1;
    else if (row.status === 'completed') counts.completed += 1;
  }
  return counts;
}

const RANK: Readonly<Record<string, number>> = {
  'recovery-required': 0,
  failed: 1,
  'in-progress': 2,
  completed: 3,
};

function compareRows(a: OperationSummary, b: OperationSummary): number {
  const byRank = (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9);
  if (byRank !== 0) return byRank;
  const time = (row: OperationSummary) =>
    row.status === 'completed' ? finishedOf(row) : Date.parse(row.updatedAt);
  return time(b) - time(a) || a.operationId.localeCompare(b.operationId);
}
