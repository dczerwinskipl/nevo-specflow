import { translateNow } from '../../../i18n/message';

/**
 * The Work history root tab is one tab per Turn (full-session.md "Work history (L2)"), so the tab
 * name has to tell Turns apart: "Work history · turn 3". The number is the Turn's position among the
 * Turns of the conversation the client has loaded (entries arrive in `ordinal` order), which is
 * stable while the user reads forward and can only shift when older history is loaded above it.
 * A Turn that is not in the loaded window keeps the plain "Work history" name.
 */
export function workTurnNumber(
  entries: readonly { turnId: string }[],
  turnId: string,
): number | undefined {
  const turns: string[] = [];
  for (const entry of entries) {
    if (!turns.includes(entry.turnId)) {
      turns.push(entry.turnId);
    }
  }

  const index = turns.indexOf(turnId);

  return index < 0 ? undefined : index + 1;
}

export function workTabLabel(entries: readonly { turnId: string }[], turnId: string): string {
  const number = workTurnNumber(entries, turnId);

  return number === undefined
    ? translateNow('managedSession.work')
    : translateNow('managedSession.workTab', { number });
}
