import type { TFunction } from 'i18next';
import type { SessionStartPending } from '../source/sessionStartSource';

/** The button's text for resolving an earlier start: resend it, check it, read its operation. */
export function pendingLabel(t: TFunction, pending: SessionStartPending): string {
  return pending.checking
    ? t('create.submit.checking')
    : pending.kind === 'retry'
      ? t('managedSession.retryCreate')
      : pending.kind === 'check'
        ? t('create.submit.checkResult')
        : t('create.submit.checkOperation');
}
