/** `CreateSessionSchema.title` allows at most 256 characters. */
export const sessionNameMaxLength = 256;

/**
 * How the new Session gets its name. `agent` is the default: the agent names it from the first
 * message. `custom` keeps the typed `value` even while the user switches back to `agent`, so
 * switching is never destructive; only the active mode's value is used.
 */
export interface SessionNameChoice {
  mode: 'agent' | 'custom';
  value: string;
}

export const initialSessionName: SessionNameChoice = { mode: 'agent', value: '' };

/** The name the Session is created with: undefined means "the agent names it". */
export function chosenSessionName(choice: SessionNameChoice): string | undefined {
  return choice.mode === 'custom' ? choice.value.trim() || undefined : undefined;
}

/** A chosen custom name must not be blank (the agent default is one click away instead). */
export function sessionNameMissing(choice: SessionNameChoice): boolean {
  return choice.mode === 'custom' && !choice.value.trim();
}
