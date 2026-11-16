import type { TFunction } from 'i18next';

/** Reasons the Runtime records without its own conversation text, so the UI must say why. */
const explained = ['TURN_CONFLICT', 'PROCESS_STOPPED'] as const;

/**
 * Why a Turn ended and what to do, from its outcome entry's error code (full-session.md "Outcome
 * reason"). Other codes come with the provider's own Commentary in the conversation, so they add no
 * second line here.
 */
export function outcomeReason(code: string | undefined, t: TFunction): string | undefined {
  return code && (explained as readonly string[]).includes(code)
    ? t(`managedSession.outcomeReason.${code as (typeof explained)[number]}`)
    : undefined;
}
