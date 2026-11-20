/** `CreateSessionSchema.title` allows at most 256 characters. */
export const sessionNameMaxLength = 256;

/**
 * How the new Session gets its name. `agent`: the agent names it from the first message. `custom`:
 * the Session is created with the typed `value`. The start form has one optional name field, so
 * the mode follows what is typed (`sessionNameFrom`): a blank field lets the agent name it.
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
