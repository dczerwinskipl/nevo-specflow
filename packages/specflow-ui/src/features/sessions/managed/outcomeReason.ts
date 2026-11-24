import type { TFunction } from 'i18next';

/** Reasons the Runtime records without its own conversation text, so the UI must say why. */
const explained = ['TURN_CONFLICT', 'PROCESS_STOPPED'] as const;

/**
 * Why a Turn ended and what to do, from its outcome entry's error code (full-session.md "Outcome
 * reason"). Other codes come with the provider's own Commentary in the conversation, so they add no
 * second line here.
 */
/** Stable failure reasons the UI words itself (`TurnError.reason`). */
const knownReasons = ['claude-policy-check-failed'] as const;

export function outcomeReason(
  error: string | { code: string; message: string; reason?: string } | undefined,
  t: TFunction,
): string | undefined {
  const code = typeof error === 'string' ? error : error?.code;
  const reason = typeof error === 'string' ? undefined : error?.reason;
  if (reason && typeof error !== 'string') {
    // A reason the UI knows in its own words; any other in the Runtime's message.
    return (knownReasons as readonly string[]).includes(reason)
      ? t(`managedSession.outcomeReason.${reason as (typeof knownReasons)[number]}`)
      : error!.message;
  }

  return code && (explained as readonly string[]).includes(code)
    ? t(`managedSession.outcomeReason.${code as (typeof explained)[number]}`)
    : undefined;
}
