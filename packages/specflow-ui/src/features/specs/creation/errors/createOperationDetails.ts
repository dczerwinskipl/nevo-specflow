import type { TFunction } from 'i18next';
import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { message, type Message } from '../../../../i18n/message';
import type { OperationDetail } from './CreateFailureAlert';
import type { CreateOperationStatus, SentRequest } from '../createOperationReducer';
import { primaryWorkspace } from '../workspace/workspaceTiles';

/**
 * Facts of the operation as it was SENT: never rebuilt from the current form or options. A request
 * that was discarded (conflict, finished without a result) falls back to the typed name.
 */
export function buildOperationDetails(input: {
  sent: SentRequest | null;
  status: CreateOperationStatus | null;
  workspaceOptions: CreateOptions | undefined;
  typedTitle: string;
  language: string;
  t: TFunction;
  text: (message: Message | string) => string;
}): OperationDetail[] {
  const { sent, status, workspaceOptions, typedTitle, language, t, text } = input;
  const target = sent?.target;
  const existing = workspaceOptions?.workspaces.find(
    (w) => target?.kind === 'existing' && w.workspaceId === target.workspaceId,
  );
  const place =
    target?.kind === 'new-worktree'
      ? t('create.workspace.tile.newTitle')
      : target?.kind === 'existing'
        ? t('create.workspace.tile.existingTitle')
        : t('create.workspace.tile.mainTitle');
  const branchName =
    status?.branch ??
    (target?.kind === 'new-worktree'
      ? target.branch
      : (existing?.branch ??
        (workspaceOptions ? primaryWorkspace(workspaceOptions)?.branch : undefined)));
  const entries: [OperationDetail['id'], string | undefined][] = [
    ['operation', sent?.operationId],
    ['specification', sent?.title ?? typedTitle],
    ['place', place],
    ['branch', branchName],
    ['step', status?.step ? text(operationStageLabel(status.step)) : undefined],
    ['attempt', status?.updatedAt ? formatOperationTime(status.updatedAt, language) : undefined],
  ];
  return entries
    .filter((entry): entry is [OperationDetail['id'], string] => Boolean(entry[1]))
    .map(([id, value]) => ({ id, value }));
}

const stageKeys: Readonly<Record<string, Message>> = {
  'workspace-prepared': message('create.operation.stageWorkspacePrepared'),
};
/** Reader-facing stage of a half-finished operation; an unknown server step is a diagnostic code shown as it is. */
export const operationStageLabel = (step: string): Message | string => stageKeys[step] ?? step;
/** Localised "last attempt" time; an unreadable value is shown as it is. */
export function formatOperationTime(iso: string, locale: string): string {
  const time = new Date(iso);
  return Number.isNaN(time.getTime())
    ? iso
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(time);
}
