import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppContent, cn, useWorkspaceLayout } from '@nevo/ui';

/**
 * The conversation column of a Session that has not produced a message yet: the content at the top
 * and the Composer docked at the bottom, positioned exactly as in `ManagedSession` (sticky in the
 * local scroller of the split layout, fixed on the stacked one), so the start form, the pending
 * Session and the started Session share one geometry and nothing moves between them.
 *
 * `composer` is the Composer itself; omitted, no Composer is docked (a phone before Start, where it
 * would only take space from the form). With `composerOnlyIfFits` the split layout docks it only
 * while the content and the Composer fit the column together: an inactive Composer is there for
 * the look of a tall screen and must not cover a form that needs the whole height.
 */
export function SessionStartConversation({
  children,
  composer,
  composerOnlyIfFits = false,
}: {
  children: ReactNode;
  composer?: ReactNode;
  composerOnlyIfFits?: boolean;
}) {
  const { t } = useTranslation();
  const layout = useWorkspaceLayout();
  const isSplit = layout.mode === 'split';
  const localScroll = layout.primaryScrollOwner === 'local';
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [fits, setFits] = useState(true);
  const measureFit = composerOnlyIfFits && localScroll;
  const docked = composer !== undefined && composer !== false && (!measureFit || fits);

  // Whether the content's natural height and the Composer's last measured height fit the scroller.
  // Neither depends on whether the Composer is shown (the content is measured to its last child, not
  // to its stretched box, and the height is kept while hidden), so hiding it never flips the result.
  useLayoutEffect(() => {
    const scroller = content?.parentElement;
    if (!measureFit || !content || !scroller || typeof ResizeObserver === 'undefined') {
      setFits(true);

      return undefined;
    }

    const measure = () => {
      const top = content.getBoundingClientRect().top;
      const bottom = content.lastElementChild?.getBoundingClientRect().bottom ?? top;
      const natural = bottom - top + parseFloat(getComputedStyle(content).paddingBottom);
      setFits(natural + composerHeight <= scroller.clientHeight);
    };

    const resize = new ResizeObserver(measure);
    const observeAll = () => {
      resize.disconnect();
      resize.observe(scroller);
      for (const child of content.children) {
        resize.observe(child);
      }
    };

    const mutation = new MutationObserver(() => {
      observeAll();
      measure();
    });
    observeAll();
    mutation.observe(content, { childList: true });
    measure();

    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, [composerHeight, content, measureFit]);

  // The fixed Composer of the stacked layout takes no space of its own: reserve it.
  useEffect(() => {
    if (!overlay || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => setComposerHeight(overlay.offsetHeight));
    observer.observe(overlay);

    return () => observer.disconnect();
  }, [overlay]);

  // Content sits directly on the conversation, from the top (centred in the free
  // height looks odd); an empty state centres itself in the same column.
  const body = (
    <>
      <div
        ref={setContent}
        className="mx-auto flex w-full max-w-content-standard flex-1 flex-col px-5 py-5"
      >
        {children}
      </div>
      {docked && !localScroll && <div aria-hidden="true" style={{ height: composerHeight }} />}
    </>
  );
  // Split layout: the Composer is the last child of the scroller and sticks to its bottom, as in
  // `ManagedSession`, on an opaque bar of the surface's own material, so the content scrolls
  // underneath without showing through. Stacked layout: fixed to the
  // viewport, with the space reserved above.
  const composerBar = docked && (
    <div
      ref={setOverlay}
      data-composer-overlay="true"
      className={cn(
        'z-10 flex flex-col items-center gap-2 px-4 pt-3 sm:px-5',
        localScroll
          ? 'workspace-docked-bar sticky bottom-0'
          : 'scrollbar-subtle fixed inset-x-0 bottom-0 z-20 overflow-y-auto',
      )}
      style={
        localScroll
          ? { paddingBottom: 'calc(1.25rem + var(--workspace-overlay-bottom, 0.75rem))' }
          : {
              paddingBottom: 'calc(1rem + var(--workspace-overlay-bottom, 0.75rem))',
              maxHeight:
                'calc(var(--mobile-workspace-viewport-height, 100dvh) - ' +
                'var(--mobile-workspace-header-height, 3.5rem) - 1rem)',
            }
      }
    >
      <div
        className={cn(
          'grid w-full gap-3',
          isSplit ? 'max-w-content-narrow' : 'max-w-content-standard',
        )}
      >
        {composer}
      </div>
    </div>
  );

  return (
    <AppContent className="flex h-full min-h-0 w-full flex-col">
      {localScroll ? (
        <div
          // Keyboard access to a scrollable region whose content may be entirely locked.
          role="region"
          aria-label={t('managedSession.title')}
          tabIndex={0}
          className="scrollbar-subtle flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
        >
          {body}
          {composerBar}
        </div>
      ) : (
        <>
          {body}
          {composerBar}
        </>
      )}
    </AppContent>
  );
}
