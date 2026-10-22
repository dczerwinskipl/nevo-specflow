import {
  OPERATION_INTERRUPTED_CODE,
  OPERATION_JOURNAL_CORRUPT_CODE,
  specificationCreateSteps,
  type OperationListResponse,
  type OperationStepStatus,
  type OperationSummary,
} from '@nevo/specflow-contracts/operations';

import {
  shapeOperationList,
  type OperationProgressListing,
  type ShapeOperationListInput,
} from '../../operations';
import type { DemoScenario } from './create-options';

const KIND = 'specification-create';

/** A Create the demo state knows (see `DemoSpecs.operationRecords`). */
export interface DemoOperationRecord {
  readonly operationId: string;
  readonly status: 'completed' | 'recovery-required';
  readonly title?: string;
  readonly specId?: string;
  readonly slug?: string;
  readonly workspaceId?: string;
  readonly branch?: string;
  readonly step?: string;
  readonly updatedAt: string;
  readonly newWorktree: boolean;
  /** Git is on in the demo project: the checklist has the commit step. */
  readonly commits: boolean;
}

export interface DemoOperationListInput extends Omit<ShapeOperationListInput, 'config'> {
  readonly records: readonly DemoOperationRecord[];
  /** Running demo Creates (the shared registry), listed like the real Runtime does. */
  readonly live: readonly OperationProgressListing[];
  readonly scenarios: readonly DemoScenario[];
}

function checklist(
  newWorktree: boolean,
  commits: boolean,
  currentStep?: string,
  done = false,
): { id: string; status: OperationStepStatus }[] {
  const ids = specificationCreateSteps(newWorktree ? 'new-worktree' : 'existing', commits);
  const current = currentStep ? ids.findIndex((id) => id === currentStep) : -1;
  return ids.map((id, index) => {
    let status: OperationStepStatus = 'pending';
    if (done || (current >= 0 && index < current)) status = 'done';
    else if (index === current) status = 'running';
    return { id, status };
  });
}

const at = (now: Date, agoMs: number) => new Date(now.getTime() - agoMs).toISOString();
const minute = 60_000;
/** Stable, valid ids: the demo rows must pass the same strict contract as the real ones. */
const demoId = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** The rows the `operations-panel` scenario adds: every status, with and without steps. */
function seededRows(now: Date): OperationSummary[] {
  const base = (n: number) => ({ operationId: demoId(n), kind: KIND });
  const specTarget = {
    workspaceKind: 'existing' as const,
    workspaceId: demoId(900),
    branch: 'develop',
  };
  return [
    {
      ...base(1),
      status: 'in-progress',
      title: 'Single sign-on with company accounts',
      subject: { specId: demoId(101), slug: 'single-sign-on' },
      target: specTarget,
      currentStep: 'writing-specification',
      steps: checklist(false, true, 'writing-specification'),
      startedAt: at(now, 40_000),
      updatedAt: at(now, 5_000),
    },
    {
      ...base(2),
      status: 'in-progress',
      title: 'Billing export',
      subject: { specId: demoId(102), slug: 'billing-export' },
      target: { workspaceKind: 'new-worktree', workspaceId: demoId(901), branch: 'spec/billing' },
      currentStep: 'preparing-workspace',
      steps: checklist(true, true, 'preparing-workspace'),
      startedAt: at(now, 15_000),
      updatedAt: at(now, 2_000),
    },
    {
      // Started by the CLI: no live steps, no start time (file time only).
      ...base(3),
      status: 'in-progress',
      title:
        'A very long specification title that keeps going to show how the row wraps when the name does not fit on one line at all',
      subject: { specId: demoId(103), slug: 'very-long-title' },
      target: specTarget,
      updatedAt: at(now, 30_000),
    },
    {
      ...base(4),
      status: 'recovery-required',
      title: 'Audit log retention',
      subject: { specId: demoId(104), slug: 'audit-log-retention' },
      target: specTarget,
      currentStep: 'committing-specification',
      steps: checklist(false, true, 'committing-specification'),
      startedAt: at(now, 20 * minute),
      code: 'COMMIT_FAILED',
      updatedAt: at(now, 19 * minute),
    },
    {
      ...base(5),
      status: 'recovery-required',
      title: 'Notification preferences',
      subject: { specId: demoId(105), slug: 'notification-preferences' },
      target: { workspaceKind: 'new-worktree', workspaceId: demoId(902), branch: 'spec/notify' },
      code: OPERATION_INTERRUPTED_CODE,
      updatedAt: at(now, 12 * minute),
    },
    {
      // Unreadable journal: only the id is known.
      ...base(6),
      status: 'recovery-required',
      code: OPERATION_JOURNAL_CORRUPT_CODE,
      updatedAt: at(now, 3 * 60 * minute),
    },
    {
      ...base(7),
      status: 'failed',
      title: 'Data retention policy',
      subject: { specId: demoId(107), slug: 'data-retention' },
      target: specTarget,
      code: 'COMMIT_BLOCKED',
      startedAt: at(now, 8 * minute),
      updatedAt: at(now, 7 * minute),
      finishedAt: at(now, 7 * minute),
    },
    ...[3, 6, 9].map((ago, index): OperationSummary => ({
      ...base(8 + index),
      status: 'completed',
      title: ['Search filters', 'Onboarding checklist', 'API rate limits'][index]!,
      subject: { specId: demoId(108 + index), slug: 'completed-' + (index + 1) },
      target: specTarget,
      steps: checklist(false, true, undefined, true),
      startedAt: at(now, (ago + 1) * minute),
      updatedAt: at(now, ago * minute),
      finishedAt: at(now, ago * minute),
    })),
  ];
}

/**
 * Demo mirror of the operation list: the same `OperationListResponse` and the same shaping as the
 * real route (`shapeOperationList`), built from the Creates of the demo state, the running ones of
 * the shared progress registry and, on request, the `operations-panel` seed.
 */
export function buildDemoOperationList(input: DemoOperationListInput): OperationListResponse {
  const known = new Set(input.records.map((record) => record.operationId));
  const rows: OperationSummary[] = input.records.map((record) => {
    const target = {
      workspaceKind: record.newWorktree ? ('new-worktree' as const) : ('existing' as const),
      ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
      ...(record.branch ? { branch: record.branch } : {}),
    };
    const common = {
      operationId: record.operationId,
      kind: KIND,
      ...(record.title ? { title: record.title } : {}),
      subject: {
        ...(record.specId ? { specId: record.specId } : {}),
        ...(record.slug ? { slug: record.slug } : {}),
      },
      target,
      updatedAt: record.updatedAt,
    };
    if (record.status === 'completed') {
      return {
        ...common,
        status: 'completed',
        steps: checklist(record.newWorktree, record.commits, undefined, true),
        finishedAt: record.updatedAt,
      };
    }
    const current = record.step === 'commit-writing' ? 'committing-specification' : undefined;
    return {
      ...common,
      status: 'recovery-required',
      ...(current && record.commits
        ? { currentStep: current, steps: checklist(record.newWorktree, true, current) }
        : {}),
      code: record.step === 'commit-writing' ? 'COMMIT_FAILED' : 'CREATE_RECOVERY_REQUIRED',
    };
  });
  for (const item of input.live) {
    if (item.kind !== KIND || item.status !== 'running' || known.has(item.operationId)) continue;
    rows.push({
      operationId: item.operationId,
      kind: KIND,
      status: 'in-progress',
      ...(item.currentStep ? { currentStep: item.currentStep } : {}),
      steps: item.steps.map((step) => ({ ...step })),
      startedAt: item.startedAt,
      updatedAt: item.updatedAt,
    });
  }
  if (input.scenarios.includes('operations-panel')) rows.push(...seededRows(input.now));
  return shapeOperationList(rows, {
    now: input.now,
    admit: input.admit,
    ...(input.statuses ? { statuses: input.statuses } : {}),
    limit: input.limit,
  });
}
