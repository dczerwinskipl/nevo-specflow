import type { TFunction } from 'i18next';
import type { ConversationEntry } from '@nevo/specflow-contracts/sessions';

type TurnError = NonNullable<ConversationEntry['error']>;

/** Stable failure reasons the UI words itself (`TurnError.reason`). */
const knownReasons = ['claude-policy-check-failed'] as const;
/** Error codes the Runtime records without words of its own in the conversation. */
const explainedCodes = ['TURN_CONFLICT', 'PROCESS_STOPPED'] as const;

const includes = <T extends string>(list: readonly T[], value: string | undefined): value is T =>
  value !== undefined && (list as readonly string[]).includes(value);

/**
 * Why a Turn that did not complete ended (full-session.md "Outcome reason"), in this order: a
 * stable reason the UI words itself; else what SpecFlow said about it in the Turn (its error and
 * warning notices, the actual cause, e.g. a process it stopped); else an error code the Runtime
 * records without words of its own; else the Runtime's own message; else the outcome in plain words.
 */
export function outcomeCause(
  outcome: 'failed' | 'cancelled' | 'interrupted',
  error: TurnError | undefined,
  notices: readonly string[],
  t: TFunction,
): string {
  if (includes(knownReasons, error?.reason)) {
    return t(`managedSession.outcomeReason.${error.reason}`);
  }

  if (notices.length > 0) {
    return notices.join(' ');
  }

  if (includes(explainedCodes, error?.code)) {
    return t(`managedSession.outcomeReason.${error.code}`);
  }

  const message = error?.message;

  return message !== undefined && message !== ''
    ? message
    : t(`managedSession.outcomeReason.${outcome}`);
}
