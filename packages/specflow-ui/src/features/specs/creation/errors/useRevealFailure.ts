import { useEffect, useRef, type FormEvent, type RefObject } from 'react';

export interface RevealFailure {
  /** The region at the end of the scrolling form that holds the failure alert. */
  actionRegion: RefObject<HTMLDivElement | null>;
  /** Call when a submit is accepted: remembers whether the owner was at the end of the form. */
  captureSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

/**
 * After a submit failed, scrolls the alert into view, but only when the owner was at the end of the
 * form, where the alert appears (the submit button was in view inside the form, or the form was
 * scrolled to its end when the button is pinned below it), and has not scrolled since: it never
 * fights the user's own scrolling or pulls them away from what they are reading.
 */
/** Scroll positions are fractional on zoomed or high-density screens: "at the end" allows a few px. */
const endSlackPx = 8;

export function useRevealFailure(
  failed: boolean,
  errorSeq: number,
  failure: unknown,
): RevealFailure {
  const actionRegion = useRef<HTMLDivElement>(null);
  const submitted = useRef<{ scroller: HTMLElement; top: number; atEnd: boolean } | null>(null);
  useEffect(() => {
    if (!failed || !submitted.current) return;
    const initial = submitted.current;
    const frame = requestAnimationFrame(() => {
      const region = actionRegion.current;
      if (!region) return;
      const scroller = initial.scroller;
      // Still at the end of the form without the new alert: the browser may have clamped the
      // position while the form locked, which is not the owner scrolling away.
      const stillAtEnd =
        initial.atEnd &&
        scroller.scrollTop + scroller.clientHeight >=
          scroller.scrollHeight - region.offsetHeight - endSlackPx;
      if (Math.abs(scroller.scrollTop - initial.top) > 1 && !stillAtEnd) return;
      // The form's own scroller is moved directly (an element scrollIntoView can be dropped by a
      // concurrent scroll elsewhere in the workspace): the whole alert ends at the bottom of the
      // view, or one taller than the view starts at its top so it is read from the beginning.
      const box = region.getBoundingClientRect(),
        view = scroller.getBoundingClientRect();
      scroller.scrollTop +=
        region.offsetHeight <= scroller.clientHeight
          ? Math.max(0, box.bottom - view.bottom)
          : box.top - view.top;
    });
    return () => cancelAnimationFrame(frame);
  }, [failed, errorSeq, failure]);
  return {
    actionRegion,
    captureSubmit(event) {
      const region = actionRegion.current,
        scroller = region?.closest<HTMLElement>('.scroll-area-viewport');
      const submitter =
        event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null;
      const rect = submitter?.getBoundingClientRect(),
        viewport = scroller?.getBoundingClientRect();
      // A submit button outside the scroller is in the pinned footer, always in view: what counts
      // then is whether the end of the form, where the alert appears, was in view.
      const atEnd =
        Boolean(submitter) &&
        (scroller?.contains(submitter)
          ? Boolean(rect && viewport && rect.top >= viewport.top && rect.bottom <= viewport.bottom)
          : Boolean(
              scroller &&
              scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - endSlackPx,
            ));
      submitted.current =
        scroller && atEnd
          ? { scroller, top: scroller.scrollTop, atEnd: !scroller.contains(submitter) }
          : null;
    },
  };
}
