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
 * Narrow-viewport regression (owner audit, live DOM measurement at 320px): the status-line row
 * that used to sit in its own bordered bar between the header and the conversation rendered
 * directly on top of `InteractionPrompt`'s own "Wymagana odpowiedź" heading — two different
 * elements, both legible on their own, visually overlapping into illegible stacked text. Root
 * cause (`ManagedSession.tsx`'s `data-composer-overlay` element): bottom-anchored with no
 * `top`/height ceiling, its natural content height (pending-interaction card + composer + any
 * alert/pill) could exceed the space available below the header on a short viewport, and an
 * absolutely positioned box with no cap simply extends upward past its container's top edge in
 * that case — covering whatever renders above it in normal flow. The fix folds the former status
 * row into the real page header's own `status`/`subtitle` slots and caps the overlay
 * (`max-h-[70dvh]` + `overflow-y-auto`, scrolling internally instead of bleeding upward — see
 * `ManagedSession.tsx`'s composer wrapper), so this asserts the geometric invariant directly:
 * whenever a pending interaction renders, its card must never start above the header's own
 * bottom edge, at any viewport width. Confirmed live (manual DOM override removing the cap) that
 * this check fails the moment the overlay's height ceiling is removed — the same mechanism the
 * original bug hit.
 */
export async function verifyNoHeaderOverlapsInteractionPrompt(canvasElement: HTMLElement) {
  await waitFor(() => {
    const header = canvasElement.querySelector<HTMLElement>('[data-workspace-header]');
    if (!header) {
      throw new Error('Expected the Primary workspace header.');
    }

    const prompt = canvasElement.querySelector<HTMLElement>('[data-interaction-prompt]');
    if (!prompt) {
      // No pending interaction rendered — nothing to check.
      return;
    }

    const headerBottom = header.getBoundingClientRect().bottom;
    const promptRect = prompt.getBoundingClientRect();
    if (promptRect.height > 0 && promptRect.top < headerBottom - 0.5) {
      throw new Error(
        `InteractionPrompt (top ${promptRect.top}px) renders above the header's own bottom edge ` +
          `(${headerBottom}px) — the floating composer overlay has bled upward over the header.`,
      );
    }
  });
}

/**
 * Item 1 regression, updated for the workspace-dynamic-split scroll-architecture migration
 * (secondary-navigation.md "Reaching Primary's ambient scroll element"): the composer overlay
 * (composer + any pending-interaction card + the "jump to latest" pill, all siblings under the
 * same `data-composer-overlay` node) now reserves its own space as a normal flow `position:
 * sticky` child of the scroll content on split/desktop; on stacked/mobile it is `position: fixed`
 * instead (owner audit: `sticky` is not reliably pinned there in the real composed route) and the
 * scroller's `padding-bottom` is still computed and applied by JS, same as the original mechanism
 * this asserted. Either way, the invariant that actually matters is purely geometric: no
 * conversation entry actually inside the scroller's own visible, clipped viewport may render
 * behind the overlay's own screen-space rectangle. An entry scrolled out of that clipped area
 * (`overflow-y-auto`) is merely off-screen, not hidden behind anything — this check no longer
 * asserts the padding-bottom value itself, only that outcome, so it holds under either mechanism.
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

  // One retrying check (not a bare assertion): right after mount/layout, the scroll-to-bottom
  // effect, and (on this fixture) the auto-load-older effect (item 5) can all still be settling,
  // so an immediate read would be a false negative, not a real regression.
  await waitFor(() => {
    const overlayRect = overlay.getBoundingClientRect();
    if (!(overlayRect.height > 0)) {
      throw new Error('Expected the composer overlay to have a measured height.');
    }

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
