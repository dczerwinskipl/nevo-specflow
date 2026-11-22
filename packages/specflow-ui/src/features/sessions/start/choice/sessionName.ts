/** `CreateSessionSchema.title` allows at most 256 characters. */
export const sessionNameMaxLength = 256;

/**
 * The start form's name choice. `agent` is the existing unnamed choice id: no title is sent;
 * automatic agent naming is not implemented. `custom` creates the Session with the typed value.
 * The mode follows the one optional name field (`sessionNameFrom`).
 */
export interface SessionNameChoice {
  mode: 'agent' | 'custom';
  value: string;
}

export const initialSessionName: SessionNameChoice = { mode: 'agent', value: '' };

/** The choice the optional name field stands for: its own name once anything is typed. */
export function sessionNameFrom(value: string): SessionNameChoice {
  return { mode: value.trim() ? 'custom' : 'agent', value };
}

/** The name the Session is created with: undefined means "the agent names it". */
export function chosenSessionName(choice: SessionNameChoice): string | undefined {
  return choice.mode === 'custom' ? choice.value.trim() || undefined : undefined;
}
