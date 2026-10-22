import type { OperationListCounts } from '@nevo/specflow-contracts/operations';

import type {
  OperationList,
  OperationListItem,
  OperationListResult,
} from '../../src/shared/operations/operationList';
import { message, type MessageKey } from '../../src/i18n/message';
import type { OperationKindPresentation } from '../../src/shared/operations/operationKinds';
import type { OperationsApi } from '../../src/shared/operations/operationsApi';

/** Fixtures are relative to the moment the module loads, so times read "2 minutes ago" on screen. */
const baseTime = Date.now();

/** An ISO time `minutesAgo` before the fixture's fixed "now" ({@link fixtureNow}). */
export const isoAgo = (minutesAgo: number): string =>
  new Date(baseTime - minutesAgo * 60_000).toISOString();

/** The clock the fixtures are written against. */
export const fixtureNow = baseTime;

const stepIds = ['reserving', 'preparing-workspace', 'writing-specification', 'registering'];

/** A Create checklist with the first `done` steps finished and the next one running. */
export const createSteps = (done: number): NonNullable<OperationListItem['steps']> =>
  stepIds.map((id, index) => ({
    id,
    status: index < done ? 'done' : index === done ? 'running' : 'pending',
  }));

let sequence = 0;
const operationId = () => {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
};

export function operationItem(overrides: Partial<OperationListItem> = {}): OperationListItem {
  return {
    operationId: operationId(),
    kind: 'specification-create',
    status: 'in-progress',
    title: 'Payment limits',
    target: { workspaceKind: 'new-worktree', workspaceId: 'ws-1', branch: 'spec/payment-limits' },
    startedAt: isoAgo(2),
    updatedAt: isoAgo(1),
    ...overrides,
  };
}

export function runningItem(done = 1, overrides: Partial<OperationListItem> = {}) {
  return operationItem({
    status: 'in-progress',
    currentStep: stepIds[done] ?? 'registering',
    steps: createSteps(done),
    ...overrides,
  });
}

export function operationList(
  items: readonly OperationListItem[],
  extras: Partial<Omit<OperationList, 'items'>> = {},
): OperationList {
  const count = (status: string) => items.filter((item) => item.status === status).length;
  const counts: OperationListCounts = {
    inProgress: count('in-progress'),
    recoveryRequired: count('recovery-required'),
    failed: count('failed'),
    completed: count('completed'),
  };
  return {
    items,
    counts,
    truncated: false,
    generatedAt: new Date(baseTime).toISOString(),
    ...extras,
  };
}

/** An in-memory operations port: answers the lists in order (the last one repeats). */
export function operationsStub(
  ...answers: readonly (OperationList | OperationListResult | Error)[]
): OperationsApi & { readonly calls: { url: string; etag?: string }[] } {
  const calls: { url: string; etag?: string }[] = [];
  let next = 0;
  return {
    calls,
    // eslint-disable-next-line @typescript-eslint/require-await
    async list(url, options) {
      calls.push({ url, ...(options?.etag ? { etag: options.etag } : {}) });
      const answer = answers[Math.min(next, answers.length - 1)];
      next += 1;
      if (answer instanceof Error) throw answer;
      if (!answer) return { kind: 'unavailable' };
      return 'kind' in answer ? answer : { kind: 'list', list: answer };
    },
    // eslint-disable-next-line require-yield
    async *watchProgress() {
      await Promise.resolve();
    },
  };
}

/** A presentation adapter for tests and stories of the generic panel (the real one is the feature's). */
export const stubCreateKind: OperationKindPresentation = {
  kind: 'specification-create',
  label: message('create.operations.kind'),
  stepTitle: (stepId) =>
    message(
      stepIds.includes(stepId)
        ? (`create.progress.steps.${stepId}.title` as MessageKey)
        : 'create.progress.steps.unknown.title',
    ),
  detailHref: (row) => `/specs/new/creating/${row.operationId}`,
};
