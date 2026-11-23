/** `CreateSessionSchema.title` allows at most 256 characters. */
export const sessionNameMaxLength = 256;

/**
 * The start form's name choice. `unnamed` sends no title;
 * `custom` creates the Session with the typed value.
 * The mode follows the one optional name field (`sessionNameFrom`).
 */
export interface SessionNameChoice {
  mode: 'unnamed' | 'custom';
  value: string;
}

export const initialSessionName: SessionNameChoice = { mode: 'unnamed', value: '' };

/** The choice the optional name field stands for: its own name once anything is typed. */
export function sessionNameFrom(value: string): SessionNameChoice {
  return { mode: value.trim() ? 'custom' : 'unnamed', value };
}

/** The creation title; undefined leaves the Session unnamed. */
export function chosenSessionName(choice: SessionNameChoice): string | undefined {
  return choice.mode === 'custom' ? choice.value.trim() || undefined : undefined;
}
