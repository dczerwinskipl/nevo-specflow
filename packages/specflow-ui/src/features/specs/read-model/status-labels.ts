import type { TFunction } from 'i18next';
import type { SessionSummary } from './model';

const SESSION_STATUS_KEYS = {
  active: 'specification.sessionStatusActive',
  attention: 'specification.sessionStatusAttention',
} as const;

export function sessionActivityLabel(session: SessionSummary, t: TFunction): string {
  if (session.activityCode) {
    return t(SESSION_STATUS_KEYS[session.activityCode]);
  }

  // A quiet Session is neither working nor waiting for the user.
  return session.navigationStatus === 'quiet'
    ? t('specification.sessionStatusQuiet')
    : (session.activity?.label ?? '');
}

/** The Tasks a Session is linked to, as a labelled count ("3 tasks"); empty without any. */
export function sessionTaskCountLabel(session: SessionSummary, t: TFunction): string {
  return session.taskCount ? t('specification.sessionTaskCount', { count: session.taskCount }) : '';
}
