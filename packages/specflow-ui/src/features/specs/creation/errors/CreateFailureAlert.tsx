import { Alert, Button, Collapsible, DescriptionList } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { MessageKey } from '../../../../i18n/message';
import { BranchRef } from '../workspace/BranchRef';
import type { CreateFailure } from './createFailure';
import type { CreateOperationStatus } from '../operation/createOperationReducer';

const staleReasonCodes = ['DEMO_WORKSPACE_UNAVAILABLE', 'BASE_REF_NOT_FOUND'] as const;

/** Stable key of the explanation for a stale-option code; unknown codes use the generic one. */
function staleReason(code: string): MessageKey {
  return `create.errors.staleReason.${
    (staleReasonCodes as readonly string[]).includes(code) ? code : 'default'
  }` as MessageKey;
}

/** Catalogue key of the headline of a failure (also used where only the headline is shown). */
export function createFailureTitleKey(failure: CreateFailure): MessageKey {
  switch (failure.kind) {
    case 'uncertain':
      return 'create.errors.uncertain.title';
    case 'recovery-required':
      return failure.committed
        ? 'create.errors.commitFailed.title'
        : 'create.errors.recovery.title';
    case 'branch-protected':
      return 'create.errors.branchProtected.title';
    case 'commit-blocked':
      return 'create.errors.commitBlocked.title';
    case 'catalogue-stale':
      return 'create.errors.catalogueStale.title';
    case 'branch-exists':
      return failure.automatic
        ? 'create.errors.branchExistsAutomatic.title'
        : 'create.errors.branchExists.title';
    case 'branch-invalid':
      return 'create.errors.branchInvalid.title';
    case 'stale':
      return 'create.errors.stale.title';
    case 'operation-conflict':
      return 'create.errors.conflict.title';
    case 'name-conflict':
      return 'create.errors.nameConflict.title';
    case 'name-invalid':
      return 'create.errors.nameInvalid.title';
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
      return failure.committed ? 'create.errors.commitFailed.body' : 'create.errors.recovery.body';
    case 'branch-protected':
      return failure.cause === 'typed-branch'
        ? 'create.errors.branchProtected.bodyTyped'
        : failure.cause === 'generated-branch'
          ? 'create.errors.branchProtected.bodyGenerated'
          : 'create.errors.branchProtected.bodyWorkspace';
    case 'commit-blocked':
      return 'create.errors.commitBlocked.body';
    case 'catalogue-stale':
      return 'create.errors.catalogueStale.body';
    case 'branch-exists':
      return failure.automatic
        ? 'create.errors.branchExistsAutomatic.body'
        : 'create.errors.branchExists.body';
    case 'branch-invalid':
      return 'create.errors.branchInvalid.body';
    case 'stale':
      return 'create.errors.stale.body';
    case 'operation-conflict':
      return 'create.errors.conflict.body';
    case 'name-conflict':
      return 'create.errors.nameConflict.body';
    case 'name-invalid':
      return 'create.errors.nameInvalid.body';
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
 * submit button ("Check the result" / "Check operation status"), which checks the same operation.
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
  onRefreshArchetypes,
  onUseAutomaticName,
  onUseCustomName,
  showDiagnostics = true,
}: {
  failure: CreateFailure;
  /** Facts the client knows about the operation (id, name, place, branch, server step/time). */
  details: readonly OperationDetail[];
  /**
   * Show the facts in a collapsible of their own. The progress page has "Technical details" for
   * that, so it turns this off (the copy action still carries the facts) instead of showing two.
   */
  showDiagnostics?: boolean;
  status: CreateOperationStatus | null;
  statusUnreadable: boolean;
  /** The last check never left the browser (no connection); the earlier outcome is unchanged. */
  connectionLost: boolean;
  refreshing: boolean;
  onCopy: (kind: CopyKind) => void;
  onRefresh: () => void;
  /** Reads the archetypes again and keeps the form (after `catalogue-stale`). */
  onRefreshArchetypes: () => void;
  onUseAutomaticName: () => void;
  onUseCustomName: () => void;
}) {
  const { t } = useTranslation();
  // Files written but not committed is calm: nothing is lost, an operator finishes it.
  const danger =
    (failure.kind === 'recovery-required' && !failure.committed) || failure.kind === 'forbidden';
  const unknown = failure.kind === 'uncertain' || failure.kind === 'recovery-required';
  return (
    <Alert
      role="alert"
      tone={danger ? 'danger' : 'attention'}
      title={t(createFailureTitleKey(failure))}
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
          {showDiagnostics && (
            <Collapsible className="mt-1 -ml-control-padding-compact">
              <Collapsible.Trigger>{t('create.errors.diagnostics')}</Collapsible.Trigger>
              <Collapsible.Content>
                <DescriptionList layout="inline" className="ml-control-padding-compact pb-2">
                  {details.map(({ id, value }) => (
                    <DescriptionList.Item key={id}>
                      <DescriptionList.Term>
                        {t(`create.operation.detail.${id}`)}
                      </DescriptionList.Term>
                      <DescriptionList.Detail>
                        {id === 'branch' ? <BranchRef name={value} /> : value}
                      </DescriptionList.Detail>
                    </DescriptionList.Item>
                  ))}
                </DescriptionList>
              </Collapsible.Content>
            </Collapsible>
          )}
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
      {failure.kind === 'catalogue-stale' && (
        <Button
          className="mt-3"
          size="sm"
          variant="secondary"
          leadingIcon="refresh"
          disabled={refreshing}
          onClick={onRefreshArchetypes}
        >
          {t('create.errors.refreshArchetypes')}
        </Button>
      )}
      {failure.kind === 'branch-protected' && failure.cause === 'workspace' && (
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
      {failure.kind === 'branch-protected' && failure.cause === 'generated-branch' && (
        <Button className="mt-3" size="sm" variant="secondary" onClick={onUseCustomName}>
          {t('create.errors.useCustomName')}
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
