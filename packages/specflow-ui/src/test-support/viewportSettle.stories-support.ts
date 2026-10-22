import { browserPage } from './browserPage';
import { waitFor } from 'storybook/test';
/**
 * Sizes the story viewport and waits until the responsive layout, the Secondary presentation and any
 * running workspace motion have settled, so geometry assertions never race the transition.
 */
export async function settleViewport(width = 1440, height = 900, anchor?: () => HTMLElement) {
  await (await browserPage()).viewport(width, height);
  await waitFor(() => {
    const layout = document.querySelector('[data-layout]')?.getAttribute('data-layout');
    if (layout && layout !== (width < 840 ? 'stacked' : 'split'))
      throw new Error('Responsive layout has not settled');
    const active = document.querySelector<HTMLElement>(
      '[data-workspace-surface="secondary"][data-workspace-active="true"]',
    );
    if (width < 840 && active) {
      const bounds = active.getBoundingClientRect();
      if (
        active.dataset.workspaceMotion !== 'idle' ||
        Math.abs(bounds.left) > 1 ||
        Math.abs(bounds.right - width) > 1 ||
        active.getAnimations().some((animation) => animation.playState === 'running')
      )
        throw new Error('Secondary presentation is not settled');
    }
    if (document.querySelector('[data-workspace-role="outgoing"]'))
      throw new Error('Outgoing workspace still mounted');
  });
  if (anchor) {
    anchor().scrollIntoView({ block: 'center' });
    await waitFor(() => {
      const rect = anchor().getBoundingClientRect();
      if (rect.bottom > height + 1 || rect.top < 56)
        throw new Error(
          'Capture anchor bounds ' + JSON.stringify({ top: rect.top, bottom: rect.bottom, height }),
        );
    });
  }
  // Let the resized layout, focus ring transitions and Radix positioning settle before the next
  // interaction (the former screenshot write used to provide this pause).
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}
