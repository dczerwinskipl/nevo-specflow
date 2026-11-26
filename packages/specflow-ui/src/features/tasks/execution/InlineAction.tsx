/**
 * An in-page action that reads as a link inside a sentence ("See Tasks", "Create findings
 * document", "Abandon instead"): the shared text action.
 */
export { TextAction as InlineAction } from '../../../shared/actions';

/** Moves the reader to a section heading on this page (the heading takes focus). */
export function goToHeading(id: string) {
  const heading = document.getElementById(id);
  if (!heading) {
    return;
  }

  heading.scrollIntoView({ block: 'start' });
  if (!heading.hasAttribute('tabindex')) {
    heading.setAttribute('tabindex', '-1');
  }

  heading.focus({ preventScroll: true });
}
