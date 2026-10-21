import { Alert, Button, Collapsible } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { MessageKey } from '../../../i18n/message';
import { BranchName } from './BranchName';
import type { CreateFailure } from './createFailure';
import type { CreateOperationStatus } from './createOperationReducer';

const staleReasonCodes = ['DEMO_WORKSPACE_UNAVAILABLE', 'BASE_REF_NOT_FOUND'] as const;

/** Stable key of the explanation for a stale-option code; unknown codes use the generic one. */
function staleReason(code: string): MessageKey {
  return `create.errors.staleReason.${
    (staleReasonCodes as readonly string[]).includes(code) ? code : 'default'
  }` as MessageKey;
}

function title(failure: CreateFailure): MessageKey {
  switch (failure.kind) {
    case 'uncertain':
      return 'create.errors.uncertain.title';
    case 'recovery-required':
      return 'create.errors.recovery.title';
    case 'branch-exists':
      return failure.automatic
        ? 'create.errors.branchExistsAutomatic.title'
        : 'create.errors.branchExists.title';
    case 'stale':
      return 'create.errors.stale.title';
    case 'operation-conflict':
      return 'create.errors.conflict.title';
    case 'name-conflict':
      return 'create.errors.nameConflict.title';
    case 'forbidden':
      return 'create.errors.forbiddenTitle';
    case 'unauthenticated':
      return 'create.errors.unauthenticated.title';
    case 'offline':
      return 'create.errors.offline.title';
    case 'failed':
      return 'create.errors.failed.title';
  }
}

function bodyKey(failure: CreateFailure): MessageKey {
  switch (failure.kind) {
    case 'uncertain':
      return 'create.errors.uncertain.body';
    case 'recovery-required':
      return 'create.errors.recovery.body';
    case 'branch-exists':
      return failure.automatic
        ? 'create.errors.branchExistsAutomatic.body'
        : 'create.errors.branchExists.body';
    case 'stale':
      return 'create.errors.stale.body';
    case 'operation-conflict':
      return 'create.errors.conflict.body';
    case 'name-conflict':
      return 'create.errors.nameConflict.body';
    case 'forbidden':
      return 'create.errors.readOnlyForm';
    case 'unauthenticated':
      return 'create.errors.unauthenticated.body';
    case 'offline':
      return 'create.errors.offline.body';
    case 'failed':
      return failure.operationFailed
        ? 'create.errors.failed.bodyOperation'
        : 'create.errors.failed.body';
  }
}

/** Facts of a sent operation; the label of each is a catalogue key, the value is data. */
export type OperationDetailId =
  'operation' | 'specification' | 'place' | 'branch' | 'step' | 'attempt';
export interface OperationDetail {
  readonly id: OperationDetailId;
  readonly value: string;
}
export type CopyKind = 'operation' | 'diagnostics';

/**
 * Footer alert of a failed Create. The form and every choice are kept. An uncertain or
 * recovery-required outcome never offers a fresh create: its single action is the form's own
 * submit button ("Sprawdź wynik" / "Sprawdź stan operacji"), which checks the same operation.
 */
export function CreateFailureAlert({
  failure,
  details,
  status,
  statusUnreadable,
  connectionLost,
  refreshing,
  onCopy,
  onRefresh,
  onUseAutomaticName,
  onUseCustomName,
}: {
  failure: CreateFailure;
  /** Facts the client knows about the operation (id, name, place, branch, server step/time). */
  details: readonly OperationDetail[];
  status: CreateOperationStatus | null;
  statusUnreadable: boolean;
  /** The last check never left the browser (no connection); the earlier outcome is unchanged. */
  connectionLost: boolean;
  refreshing: boolean;
  onCopy: (kind: CopyKind) => void;
  onRefresh: () => void;
  onUseAutomaticName: () => void;
  onUseCustomName: () => void;
}) {
  const { t } = useTranslation();
  const danger = failure.kind === 'recovery-required' || failure.kind === 'forbidden';
  const unknown = failure.kind === 'uncertain' || failure.kind === 'recovery-required';
  return (
    <Alert
      role="alert"
      tone={danger ? 'danger' : 'attention'}
      title={t(title(failure))}
      className="max-w-content-narrow"
    >
      <p>
        {failure.kind === 'stale'
          ? t(bodyKey(failure) as 'create.errors.stale.body', {
              reason: t(staleReason(failure.code)),
            })
          : t(bodyKey(failure))}
      </p>
      {failure.kind === 'recovery-required' && status && (
        <p className="mt-2">
          {status.status === 'in-progress'
            ? t('create.errors.recovery.inProgress')
            : t('create.errors.recovery.pending')}
        </p>
      )}
      {unknown && statusUnreadable && <p className="mt-2">{t('create.errors.statusUnreadable')}</p>}
      {unknown && connectionLost && <p className="mt-2">{t('create.errors.connectionLost')}</p>}
      {failure.kind === 'uncertain' && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => onCopy('operation')}>
              {t('create.errors.copyOperation')}
            </Button>
          </div>
          <p className="mt-3">{t('create.errors.copyHelp')}</p>
        </>
      )}
      {failure.kind === 'recovery-required' && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => onCopy('diagnostics')}>
              {t('create.errors.copyDiagnostics')}
            </Button>
          </div>
          <Collapsible className="mt-1 -ml-control-padding-compact">
            <Collapsible.Trigger>{t('create.errors.diagnostics')}</Collapsible.Trigger>
            <Collapsible.Content>
              <dl className="ml-control-padding-compact grid gap-1 pb-2">
                {details.map(({ id, value }) => (
                  <div key={id} className="flex min-w-0 flex-wrap gap-x-2">
                    <dt className="text-content-muted">{t(`create.operation.detail.${id}`)}</dt>
                    <dd className="min-w-0 text-content-primary wrap-anywhere">
                      {id === 'branch' ? <BranchName name={value} /> : value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Collapsible.Content>
          </Collapsible>
        </>
      )}
      {failure.kind === 'stale' && (
        <Button
          className="mt-3"
          size="sm"
          variant="secondary"
          leadingIcon="refresh"
          disabled={refreshing}
          onClick={onRefresh}
        >
          {t('create.workspace.refreshOptionsAction')}
        </Button>
      )}
      {failure.kind === 'branch-exists' && failure.automatic && (
        <Button className="mt-3" size="sm" variant="secondary" onClick={onUseCustomName}>
          {t('create.errors.useCustomName')}
        </Button>
      )}
      {failure.kind === 'branch-exists' && !failure.automatic && (
        <Button className="mt-3" size="sm" variant="secondary" onClick={onUseAutomaticName}>
          {t('create.errors.useAutomaticName')}
        </Button>
      )}
    </Alert>
  );
}
