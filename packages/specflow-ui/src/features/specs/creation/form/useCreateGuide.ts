import { useState } from 'react';
import { useFocusRequest } from '../../../../shared/a11y/useFocusRequest';
import type { CreateProblemField } from './createGuide';

/**
 * Leading a blocked Create to the field that blocks it, instead of sending anything. `guide` (a
 * blocked submit, Enter in a field, the footer's "Go to the field") marks the form as tried, so the
 * fields show their missing-value errors, announces the reason in the form's live region and,
 * once those errors are rendered, moves focus to `problemField`: always the first problem in the
 * form's order, so several problems at once lead to the same field every time.
 *
 * The live region is cleared by the activation and filled again after that render, so a second
 * activation with the same reason is announced again instead of being an unchanged text.
 */
export function useCreateGuide({
  problemField,
  reason,
  announce,
  focusField,
}: {
  /** The field of the first blocking problem; undefined when no field can fix it. */
  problemField: CreateProblemField | undefined;
  /** The translated reason Create is blocked (the footer's prerequisite). */
  reason: string | undefined;
  announce: (message: string) => void;
  /** Moves focus to the field and scrolls it into view (the owner knows its controls). */
  focusField: (field: CreateProblemField) => void;
}): { tried: boolean; guide: () => void } {
  const [tried, setTried] = useState(false);
  const lead = useFocusRequest((request: { reason?: string; field?: CreateProblemField }) => {
    if (request.reason) {
      announce(request.reason);
    }

    if (request.field) {
      focusField(request.field);
    }
  });

  return {
    tried,
    guide: () => {
      setTried(true);
      announce('');
      lead({
        ...(reason ? { reason } : {}),
        ...(problemField ? { field: problemField } : {}),
      });
    },
  };
}

/**
 * Focuses a control and brings it into view inside its scroller together with the texts that
 * describe it (its help and its error, `aria-describedby`), so the message is read where the focus
 * lands. The pinned footer sits under the scroll viewport (`CreateShell`), not over it, so whatever is
 * brought into view inside the viewport is above the footer.
 */
export function revealControl(control: HTMLElement | null | undefined): void {
  if (!control) {
    return;
  }

  control.focus({ preventScroll: true });
  control.scrollIntoView?.({ block: 'nearest' });
  const described = (control.getAttribute('aria-describedby') ?? '').split(/\s+/u).flatMap((id) => {
    const element = id ? control.ownerDocument.getElementById(id) : null;

    return element ? [element] : [];
  });
  described.at(-1)?.scrollIntoView?.({ block: 'nearest' });
}
