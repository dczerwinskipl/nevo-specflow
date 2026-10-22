import { useTranslation } from 'react-i18next';
import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { useMessage } from '../../../i18n/message';
import { CreateFailureAlert, type CopyKind } from './CreateFailureAlert';
import type { CreateFailure } from './createFailure';
import { buildOperationDetails } from './createOperationDetails';
import type { CreateOperationState } from './createOperationReducer';

/**
 * The failure of a Create as the form shows it: the alert, and the facts of the operation as they
 * were sent (which "copy" puts on the clipboard for a support request). One component for both
 * Create flows; the owner decides what each remedy does to its form.
 */
export function CreateFailurePanel({
  failure,
  state,
  workspaceOptions,
  typedTitle,
  refreshing,
  announce,
  onRefresh,
  onUseAutomaticName,
  onUseCustomName,
  showDiagnostics,
}: {
  failure: CreateFailure & { snapshot: string };
  state: CreateOperationState;
  workspaceOptions: CreateOptions | undefined;
  typedTitle: string;
  refreshing: boolean;
  announce: (message: string) => void;
  onRefresh: () => void;
  onUseAutomaticName: () => void;
  onUseCustomName: () => void;
  /** See {@link CreateFailureAlert}; the progress page shows its facts in "Technical details". */
  showDiagnostics?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const text = useMessage();
  const details = buildOperationDetails({
    sent: state.sent,
    status: state.status,
    workspaceOptions,
    typedTitle,
    language: i18n.resolvedLanguage ?? i18n.language,
    t,
    text,
  });

  const copyDetails = async (kind: CopyKind) => {
    const copied = details
      .map(({ id, value }) => `${t(`create.operation.detail.${id}`)}: ${value}`)
      .join('\n');
    try {
      // `navigator.clipboard` is missing outside secure contexts and may be refused: say so instead
      // of announcing a copy that did not happen.
      if (!navigator.clipboard) throw new Error('Clipboard is unavailable');
      await navigator.clipboard.writeText(copied);
      announce(
        t('create.announce.copied', {
          label:
            kind === 'operation'
              ? t('create.operation.copyLabelOperation')
              : t('create.operation.copyLabelDiagnostics'),
        }),
      );
    } catch {
      announce(t('create.announce.copyFailed'));
    }
  };

  return (
    <CreateFailureAlert
      failure={failure}
      details={details}
      status={state.status}
      statusUnreadable={state.statusUnreadable}
      connectionLost={state.connectionLost}
      refreshing={refreshing}
      onCopy={(kind) => void copyDetails(kind)}
      onRefresh={onRefresh}
      onUseAutomaticName={onUseAutomaticName}
      onUseCustomName={onUseCustomName}
      showDiagnostics={showDiagnostics}
    />
  );
}
