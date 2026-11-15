import { useCallback, type KeyboardEvent, type RefObject } from 'react';
import { listboxIndex } from './listboxKeys';

/**
 * Arrow, Home and End keys between the options (`[role="option"]`) inside `panel`, for a listbox
 * whose options are buttons that each take focus. `focusOption` focuses one by index (negative from
 * the end), for a field that hands the keyboard over to the list.
 */
export function useListboxKeys(panel: RefObject<HTMLElement | null>) {
  const options = useCallback(
    () => [...(panel.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])],
    [panel],
  );
  const focusOption = useCallback((index: number) => options().at(index)?.focus(), [options]);
  const onOptionKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const all = options();
      const next = listboxIndex(event.key, all.indexOf(event.currentTarget), all.length);
      if (next !== null) {
        event.preventDefault();
        all[next]?.focus();
      }
    },
    [options],
  );

  return { options, focusOption, onOptionKeyDown };
}
