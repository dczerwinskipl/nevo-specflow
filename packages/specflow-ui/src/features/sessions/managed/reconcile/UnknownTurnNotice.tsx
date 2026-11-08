import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@nevo/ui';
import { useNotify } from '../../../../shared/notifications/notifications';
import type { SessionFeed, ReconcileState } from '../feed';

/**
 * The single owner of "the last Turn's outcome is unknown" (session-actions-ux §2): shown above the
 * Composer while the active Turn is `unknown`. With Manage it offers the check; the Turn's new
 * state arrives on the stream, and only a check that settled it here (`reconciled`) is confirmed
 * with a toast. Never combined with a resend.
 */
export function UnknownTurnNotice({
  feed,
  canManage,
  reconcile,
}: {
  feed: SessionFeed;
  canManage: boolean;
  /** The feed's reconcile state for this Turn, if the user asked. */
  reconcile: ReconcileState | undefined;
}) {
  const { t } = useTranslation();
  const notify = useNotify();
  // Also after a 200, until the stream moves the Turn out of `unknown` and this notice unmounts.
  const pending = reconcile?.status === 'pending' || reconcile?.status === 'settled';
  const alert =
    reconcile?.status === 'unconfirmed'
      ? t('managedSession.reconcile.unconfirmed')
      : reconcile?.status === 'refused'
        ? reconcile.errorKind === 'forbidden'
          ? t('managedSession.sessionActions.forbidden')
          : t(`apiErrors.kind.${reconcile.errorKind ?? 'server'}.title`)
        : undefined;
  // `aria-disabled` keeps focus on the pressed control; the handler ignores presses while pending.
  const check = () => {
    if (pending) {
      return;
    }

    void feed.reconcile().then((result) => {
      if (result?.reconciled === true) {
        notify(t('managedSession.reconcile.resolved'));
      }
    });
  };

  return (
    <Alert
      tone="attention"
      title={t('managedSession.reconcile.title')}
      actions={
        canManage ? (
          <Button size="sm" aria-disabled={pending || undefined} onClick={check}>
            {pending
              ? t('managedSession.reconcile.checking')
              : t('managedSession.reconcile.action')}
          </Button>
        ) : undefined
      }
    >
      <p>{t('managedSession.reconcile.body')}</p>
      {canManage ? null : <p className="mt-2">{t('managedSession.reconcile.noManage')}</p>}
      {/* One persistent region per politeness; only the text inside changes. */}
      <div role="status">
        {reconcile?.status === 'noEvidence' ? (
          <p className="mt-2">{t('managedSession.reconcile.noEvidence')}</p>
        ) : null}
      </div>
      <div role="alert">{alert ? <p className="mt-2">{alert}</p> : null}</div>
    </Alert>
  );
}
