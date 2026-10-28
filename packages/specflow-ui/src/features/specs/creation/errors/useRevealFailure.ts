import { useEffect, useRef, type FormEvent, type RefObject } from 'react';

export interface RevealFailure {
  /** The region at the end of the scrolling form that holds the failure alert. */
  actionRegion: RefObject<HTMLDivElement | null>;
  /** Call when a submit is accepted: remembers whether the submit button was in view. */
  captureSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

/**
 * After a submit failed, scrolls the alert into view, but only when the submit button was visible
 * and the user has not scrolled since: it never fights the user's own scrolling.
 */
export function useRevealFailure(
  failed: boolean,
  errorSeq: number,
  failure: unknown,
): RevealFailure {
  const actionRegion = useRef<HTMLDivElement>(null);
  const submitted = useRef<{ scroller: HTMLElement; top: number } | null>(null);
  useEffect(() => {
    if (!failed || !submitted.current) return;
    const initial = submitted.current;
    const frame = requestAnimationFrame(() => {
      const region = actionRegion.current;
      if (!region || Math.abs(initial.scroller.scrollTop - initial.top) > 1) return;
      const available = initial.scroller.clientHeight;
      region.scrollIntoView({ block: region.offsetHeight <= available ? 'end' : 'start' });
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
      // A submit button outside the scroller is in the pinned footer: always in view.
      const inView =
        Boolean(submitter) &&
        (!scroller?.contains(submitter) ||
          Boolean(rect && viewport && rect.top >= viewport.top && rect.bottom <= viewport.bottom));
      submitted.current = scroller && inView ? { scroller, top: scroller.scrollTop } : null;
    },
  };
}
