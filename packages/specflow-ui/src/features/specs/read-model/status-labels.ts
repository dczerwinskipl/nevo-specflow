import type { TFunction } from 'i18next';
import type { SessionSummary } from './model';

const SESSION_STATUS_KEYS = {
  active: 'specification.sessionStatusActive',
  attention: 'specification.sessionStatusAttention',
} as const;

export function sessionActivityLabel(session: SessionSummary, t: TFunction): string {
  return session.activityCode
    ? t(SESSION_STATUS_KEYS[session.activityCode])
    : (session.activity?.label ?? '');
}

/**
 * A readable status for one Session: its activity, or "Idle" for a quiet Session (neither working
 * nor waiting for the user). Empty when the Runtime does not know the status.
 */
export function sessionStatusLabel(session: SessionSummary, t: TFunction): string {
  if (session.navigationStatus === 'quiet' && !session.activityCode) {
    return t('specification.sessionStatusQuiet');
  }

  return sessionActivityLabel(session, t);
}

/** The Tasks a Session is linked to, as a labelled count ("3 tasks"); empty without any. */
export function sessionTaskCountLabel(session: SessionSummary, t: TFunction): string {
  return session.taskCount ? t('specification.sessionTaskCount', { count: session.taskCount }) : '';
}
