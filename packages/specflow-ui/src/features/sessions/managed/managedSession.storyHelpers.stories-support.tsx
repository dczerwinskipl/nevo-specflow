import { useState } from 'react';
import { waitFor } from 'storybook/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { StoryLocalization } from '../../../i18n/StoryLocalization';

/**
 * Shared play-function/decorator helpers used by both `ManagedSession.states.stories.tsx` and
 * `ManagedSession.interactions.stories.tsx`. Named `*.stories-support.tsx` (not `*.stories.tsx`)
 * so Storybook's `stories` glob (`tools/storybook/.storybook/main.ts`) never treats this file as
 * a story module in its own right, and so the i18n `no-hardcoded-copy` lint rule, which already
 * exempts `*.stories-support.{ts,tsx}` (`tools/eslint/specflow-ui.mjs`), exempts this file's own
 * decorative "SpecFlow" nav label too.
 */

export const NARROW_VIEWPORT = { viewport: { value: 'mobile1', isRotated: false } };
export const WIDE_VIEWPORT = { viewport: { value: 'desktop1440', isRotated: false } };

export function Environment({ children }: { children: React.ReactNode }) {
  const [query] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );

  return (
    <StoryLocalization locale="pl">
      <QueryClientProvider client={query}>
        <div className="h-dvh">
          <AppShell navigation={<div className="p-4">SpecFlow</div>}>
            <AppWorkspaceProvider>{children}</AppWorkspaceProvider>
          </AppShell>
        </div>
      </QueryClientProvider>
    </StoryLocalization>
  );
}

/**
 * Item 1 regression: confirmed live (owner audit, DOM measurement at 390px) that "Cancel Turn"
 * and "Waiting For Question" specifically — both pairing the full interaction-response card with
 * the large, auto-stitching answer from `sessionFixture(true)` — render the pending-interaction
 * card/composer overlay directly on top of that answer's paragraph. Root cause: `MessageText.tsx`
 * stitches the answer's remaining pages into the paragraph via its own local state, after the
 * overlap-correction effect in `ManagedSession.tsx` has already run once, so the paragraph keeps
 * growing after the last scroll correction. No entry actually inside the scroller's own visible,
 * clipped viewport may render behind the floating overlay's screen-space rectangle (mirrors
 * `verifyComposerOverlayPadding` below, which asserts the same condition via the reserved
 * scroll-padding instead of a direct geometry comparison).
 */
export async function verifyNoEntryOverlapsComposer(canvasElement: HTMLElement) {
  await waitFor(() => {
    const scroller = canvasElement.querySelector<HTMLElement>('[data-session-scroller]');
    const overlay = canvasElement.querySelector<HTMLElement>('[data-composer-overlay]');
    if (!scroller || !overlay) {
      throw new Error('Expected the message scroller and the floating composer overlay.');
    }

    const scrollerRect = scroller.getBoundingClientRect();
    const overlayTop = overlay.getBoundingClientRect().top;
    for (const entry of canvasElement.querySelectorAll<HTMLElement>('[data-entry-id]')) {
      const rect = entry.getBoundingClientRect();
      const insideVisibleWindow =
        rect.height > 0 && rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom;
      if (insideVisibleWindow && rect.bottom > overlayTop) {
        throw new Error(
          `Entry "${entry.dataset.entryId}" renders behind the floating composer overlay.`,
        );
      }
    }
  });
}

/**
 * Item 1 regression: the floating composer overlay (composer + any pending-interaction card +
 * the "jump to latest" pill, all siblings under the same `data-composer-overlay` node) is
 * measured and reserved as the scroller's own `padding-bottom`, so the last message is never
 * hidden behind it. The audit's original bug left `padding-bottom` stuck at `null`/unset forever
 * (the `ResizeObserver` was never attached — see `ManagedSession.tsx`'s `composerOverlayNode`
 * callback ref); this asserts the real mechanism, not just "renders without crashing": the
 * reserved padding must actually cover the overlay's measured height, and no conversation entry
 * may render behind the overlay's own screen-space rectangle.
 */
export async function verifyComposerOverlayPadding(canvasElement: HTMLElement) {
  const scroller = await waitFor(() => {
    const node = canvasElement.querySelector<HTMLElement>('[data-session-scroller]');
    if (!node) {
      throw new Error('Expected the message scroller.');
    }

    return node;
  });
  const overlay = canvasElement.querySelector<HTMLElement>('[data-composer-overlay]');
  if (!overlay) {
    throw new Error('Expected the floating composer overlay.');
  }

  // One retrying check (not a bare assertion): right after mount/layout, the `ResizeObserver`'s
  // first measurement, the scroll-to-bottom effect, and (on this fixture) the auto-load-older
  // effect (item 5) can all still be settling, so an immediate read would be a false negative,
  // not a real regression.
  await waitFor(() => {
    const paddingBottom = parseFloat(getComputedStyle(scroller).paddingBottom || '0');
    const overlayRect = overlay.getBoundingClientRect();
    if (!(overlayRect.height > 0)) {
      throw new Error('Expected the composer overlay to have a measured height.');
    }

    if (!(paddingBottom >= overlayRect.height - 1)) {
      throw new Error(
        `Expected the scroller's padding-bottom (${paddingBottom}px) to reserve the full ` +
          `floating overlay height (${overlayRect.height}px) — it must never stay unset/0 while ` +
          'the overlay (composer + pending-interaction card) is taller than the bare composer.',
      );
    }

    // The actual overlap condition the audit described (visible at narrow width): no entry
    // actually inside the scroller's own visible, clipped viewport may render behind the
    // floating overlay's screen-space rectangle. An entry scrolled out of that clipped area
    // (`overflow-y-auto`) is merely off-screen, not hidden behind anything — the padding only
    // has to keep the *visible* window clear.
    const scrollerRect = scroller.getBoundingClientRect();
    for (const entry of canvasElement.querySelectorAll<HTMLElement>('[data-entry-id]')) {
      const rect = entry.getBoundingClientRect();
      const insideVisibleWindow =
        rect.height > 0 && rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom;
      if (insideVisibleWindow && rect.bottom > overlayRect.top) {
        throw new Error(`Entry "${entry.dataset.entryId}" renders behind the floating overlay.`);
      }
    }
  });
}
