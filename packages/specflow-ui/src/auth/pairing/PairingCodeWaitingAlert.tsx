import { useState } from 'react';

import { Alert, Button } from '@nevo/ui';
import { useTranslation } from 'react-i18next';

import { pairingFailure, type DevicePairingApi, type PairingFailure } from './api';
import { usePairingFailureText } from './failureText';

/**
 * No agent starts while the headless initial pairing code waits (`SESSION_PAIRING_PENDING`, D21).
 * The blocker and its remedies live in this alert (device-pairing.md): **Cancel the pairing code**
 * (a paired device may cancel a waiting code) and **Check again**, which the owner of the screen
 * answers by trying what was refused once more.
 */
export function PairingCodeWaitingAlert({
  api,
  onCancelled,
  onCheckAgain,
}: {
  readonly api: DevicePairingApi;
  /** The code is cancelled and agents may start again. */
  readonly onCancelled: () => void;
  readonly onCheckAgain: () => void;
}) {
  const { t } = useTranslation();
  const failureText = usePairingFailureText();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<PairingFailure>();
  const [fileLeft, setFileLeft] = useState(false);

  const cancel = () => {
    setBusy(true);
    setFailure(undefined);
    api.cancelInitialCode().then(
      (result) => {
        setBusy(false);
        // The code is spent either way; a file that stays is reported, and Check again goes on.
        if (result.fileRemoved) {
          onCancelled();
        } else {
          setFileLeft(true);
        }
      },
      (error: unknown) => {
        setBusy(false);
        setFailure(pairingFailure(error));
      },
    );
  };

  return (
    <Alert tone="attention" role="alert" title={t('pairing.waiting.title')}>
      <p>{t('pairing.waiting.body')}</p>
      <p>{t('pairing.waiting.action')}</p>
      {failure ? <p>{failureText(failure)}</p> : null}
      {fileLeft ? <p>{t('pairing.waiting.fileLeft')}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" aria-busy={busy} disabled={busy} onClick={cancel}>
          {busy ? t('pairing.waiting.cancelling') : t('pairing.waiting.cancel')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon="refresh"
          disabled={busy}
          onClick={onCheckAgain}
        >
          {t('pairing.waiting.checkAgain')}
        </Button>
      </div>
    </Alert>
  );
}
