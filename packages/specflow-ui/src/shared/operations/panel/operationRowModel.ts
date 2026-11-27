import { OPERATION_INTERRUPTED_CODE } from '@nevo/specflow-contracts/operations';

import { message, type Message } from '../../../i18n/message';
import type { OperationListItem } from '../operationList';
import type { OperationKindPresentation } from './operationKinds';
import type { OperationStatusTone } from './OperationStatusTile';
import { minutesSince } from './relativeTime';

/** What a row says, decided from the row data alone (no copy of its own, no server text). */
export interface OperationRowView {
  readonly tone: OperationStatusTone;
  /** The status word: "In progress", "Needs a check", ... */
  readonly status: Message;
  /** The line under the title: the current step, or why a check is needed. */
  readonly detail?: Message;
  /** Opens the result of a row that needs a look (the row's link label). */
  readonly action?: Message;
  readonly name: Message | string;
}

const statusMessages: Record<string, { tone: OperationStatusTone; status: Message }> = {
  'in-progress': { tone: 'running', status: message('operations.status.inProgress') },
  'recovery-required': { tone: 'attention', status: message('operations.status.recoveryRequired') },
  failed: { tone: 'danger', status: message('operations.status.failed') },
  completed: { tone: 'success', status: message('operations.status.completed') },
  queued: { tone: 'running', status: message('operations.status.queued') },
  scheduled: { tone: 'running', status: message('operations.status.scheduled') },
};
const unknownStatus = { tone: 'attention', status: message('operations.status.unknown') } as const;

/** The step line "Step 2 of 4: Writing the specification" from the row's checklist. */
function stepDetail(
  item: OperationListItem,
  kind: OperationKindPresentation | undefined,
): Message | undefined {
  if (!kind || !item.steps?.length) {
    return undefined;
  }

  const steps = item.steps.filter((step) => step.status !== 'skipped');
  const current =
    steps.findIndex((step) => step.id === item.currentStep) >= 0
      ? steps.findIndex((step) => step.id === item.currentStep)
      : steps.findIndex((step) => step.status === 'running');
  if (current < 0) {
    return undefined;
  }

  const step = steps[current];
  if (!step) {
    return undefined;
  }

  return message('operations.row.step', {
    current: current + 1,
    total: steps.length,
    title: kind.stepTitle(step.id),
  });
}

export function presentOperation(
  item: OperationListItem,
  kind: OperationKindPresentation | undefined,
  now: number,
): OperationRowView {
  const { tone, status } = statusMessages[item.status] ?? unknownStatus;
  const name: Message | string = item.title ?? kind?.label ?? message('operations.kind.unknown');
  if (item.status === 'in-progress') {
    const detail = stepDetail(item, kind);

    return { tone, status, name, ...(detail ? { detail } : {}) };
  }

  if (item.status === 'recovery-required') {
    const minutes = minutesSince(item.updatedAt, now);
    const interrupted = item.code === OPERATION_INTERRUPTED_CODE && minutes !== undefined;
    // Only an operator goes on: the line says why; the opened result names the exact command.
    const detail =
      item.code === 'CREATE_GIT_UNSETTLED'
        ? message('operations.row.gitUnsettled')
        : item.code === 'CONTROL_LOCK_RECOVERY_REQUIRED' || item.code === 'CONTROL_LOCK_CORRUPT'
          ? message('operations.row.lockRecovery')
          : interrupted
            ? message('operations.row.interrupted', { minutes })
            : undefined;

    return {
      tone,
      status,
      name,
      action: message('operations.row.checkResult'),
      ...(detail ? { detail } : {}),
    };
  }

  // A Create the Runtime did not continue after a stop says why, never just "Failed".
  const failedDetail =
    item.status === 'failed'
      ? item.code === 'CREATE_INTERRUPTED'
        ? message('operations.row.createInterrupted')
        : item.code === 'CREATE_RESUME_FORBIDDEN'
          ? message('operations.row.resumeForbidden')
          : undefined
      : undefined;

  return { tone, status, name, ...(failedDetail ? { detail: failedDetail } : {}) };
}
