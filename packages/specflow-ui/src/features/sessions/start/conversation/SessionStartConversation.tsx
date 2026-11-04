import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppContent, cn, useWorkspaceLayout } from '@nevo/ui';

/**
 * The conversation column of a Session that has not produced a message yet: the content at the top
 * and the Composer docked at the bottom, positioned exactly as in `ManagedSession` (sticky in the
 * local scroller of the split layout, fixed on the stacked one), so the start form, the pending
 * Session and the started Session share one geometry and nothing moves between them.
 *
 * `composer` is the Composer itself; omitted, no Composer is docked (a phone before Start, where it
 * would only take space from the form).
 */
export function SessionStartConversation({
  children,
  composer,
}: {
  children: ReactNode;
  composer?: ReactNode;
}) {
  const { t } = useTranslation();
  const layout = useWorkspaceLayout();
  const isSplit = layout.mode === 'split';
  const localScroll = layout.primaryScrollOwner === 'local';
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  const docked = composer !== undefined && composer !== false;

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
  const content = (
    <>
      <div className="mx-auto flex w-full max-w-content-standard flex-1 flex-col px-5 py-5">
        {children}
      </div>
      {docked && !localScroll && <div aria-hidden="true" style={{ height: composerHeight }} />}
    </>
  );
  // Split layout: the Composer is the last child of the scroller and sticks to its bottom, as in
  // `ManagedSession`, so the content scrolls fully clear of it. Stacked layout: fixed to the
  // viewport, with the space reserved above.
  const composerBar = docked && (
    <div
      ref={setOverlay}
      data-composer-overlay="true"
      className={cn(
        'z-10 flex flex-col items-center gap-2 px-4 pt-3 sm:px-5',
        localScroll
          ? 'sticky pb-4 sm:pb-5'
          : 'scrollbar-subtle fixed inset-x-0 bottom-0 z-20 overflow-y-auto',
      )}
      style={
        localScroll
          ? { bottom: 'var(--workspace-overlay-bottom, 0.75rem)' }
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
          {content}
          {composerBar}
        </div>
      ) : (
        <>
          {content}
          {composerBar}
        </>
      )}
    </AppContent>
  );
}
