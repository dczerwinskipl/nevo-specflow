import type {
  OperationListCounts,
  OperationListResponse,
  OperationSummary,
} from '@nevo/specflow-contracts/operations';

/**
 * One row of an operation list as the UI keeps it. The wire contract is strict, the reader is not:
 * `status`, `kind`, step ids and `code` stay open strings, so a newer Runtime (a `queued` status, a
 * new kind) draws a generic row instead of failing the whole list.
 */
export type OperationListItem = Omit<OperationSummary, 'status' | 'kind'> & {
  readonly status: string;
  readonly kind: string;
};

export interface OperationList {
  readonly items: readonly OperationListItem[];
  readonly counts: OperationListCounts;
  readonly truncated: boolean;
  readonly generatedAt: string;
}

/**
 * Outcome of one read of a list route. `unavailable` means this Runtime does not serve (or does not
 * allow) the list (404 / 403 / not implemented): the panel stays hidden and nothing is retried.
 */
export type OperationListResult =
  | { readonly kind: 'list'; readonly list: OperationList; readonly etag?: string }
  | { readonly kind: 'not-modified' }
  | { readonly kind: 'unavailable' };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const emptyCounts: OperationListCounts = {
  inProgress: 0,
  recoveryRequired: 0,
  failed: 0,
  completed: 0,
};

function decodeItem(value: unknown): OperationListItem | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const operationId = text(value.operationId);
  const kind = text(value.kind);
  const status = text(value.status);
  if (!operationId || !kind || !status) {
    return undefined;
  }

  const steps = Array.isArray(value.steps)
    ? value.steps.flatMap((step: unknown) => {
        const id = isObject(step) ? text(step.id) : undefined;
        const stepStatus = isObject(step) ? text(step.status) : undefined;

        return id && stepStatus ? [{ id, status: stepStatus }] : [];
      })
    : undefined;

  return {
    operationId,
    kind,
    status,
    updatedAt: text(value.updatedAt) ?? '',
    ...(text(value.title) ? { title: text(value.title) } : {}),
    ...(isObject(value.subject) ? { subject: value.subject } : {}),
    ...(isObject(value.target) ? { target: value.target } : {}),
    ...(text(value.currentStep) ? { currentStep: text(value.currentStep) } : {}),
    ...(steps ? { steps } : {}),
    ...(text(value.startedAt) ? { startedAt: text(value.startedAt) } : {}),
    ...(text(value.finishedAt) ? { finishedAt: text(value.finishedAt) } : {}),
    ...(text(value.code) ? { code: text(value.code) } : {}),
  } as OperationListItem;
}

/**
 * Reads a list answer leniently: a row that cannot be identified is dropped, the rest is kept. An
 * answer that is not a list at all is `undefined` (the caller treats that as a failed read).
 */
export function decodeOperationList(data: unknown): OperationList | undefined {
  if (!isObject(data) || !Array.isArray(data.items)) {
    return undefined;
  }

  const response = data as Partial<OperationListResponse>;
  const counts = isObject(response.counts) ? { ...emptyCounts, ...response.counts } : emptyCounts;

  return {
    items: data.items.flatMap((item: unknown) => decodeItem(item) ?? []),
    counts,
    truncated: response.truncated === true,
    generatedAt: text(response.generatedAt) ?? '',
  };
}

/** Rows that are doing something right now (they set the fast polling cadence). */
export const isRunningOperation = (item: Pick<OperationListItem, 'status'>): boolean =>
  item.status === 'in-progress';

/** Rows that wait for a person to look at them; they cannot be hidden. */
export const needsAttention = (item: Pick<OperationListItem, 'status'>): boolean =>
  item.status === 'recovery-required';

/** Only a finished row may be hidden for the session. */
export const isDismissible = (item: Pick<OperationListItem, 'status'>): boolean =>
  item.status === 'completed' || item.status === 'failed';
