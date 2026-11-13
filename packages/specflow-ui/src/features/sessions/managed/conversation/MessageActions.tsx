import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@nevo/ui';

/**
 * Actions of an authored message (full-session.md "Conversation": Copy belongs to its authored
 * message; Quote is deferred, session-chat-v10-design.md §2, and joins these when decided).
 *
 * - An agent answer always shows them, in a row under the answer: the only message followed by
 *   that extra space.
 * - The user's own message reserves no space. With a fine pointer they appear on hover/focus in a
 *   small toolbar on the bubble's top-right corner (over the gap above it and the bubble's own
 *   padding, never over text); on touch a long-press on the bubble opens them as a menu.
 */

type CopyStatus = 'idle' | 'copied' | 'failed';

const finePointerQuery = '(pointer: fine)';

function subscribeFinePointer(onChange: () => void) {
  const media = window.matchMedia(finePointerQuery);
  media.addEventListener('change', onChange);

  return () => media.removeEventListener('change', onChange);
}

/** The same split as the `pointer-fine:` CSS variant: hover exists only with a fine pointer. */
function useFinePointer() {
  return useSyncExternalStore(
    subscribeFinePointer,
    () => window.matchMedia(finePointerQuery).matches,
    () => true,
  );
}

function useCopy(onCopy: () => Promise<boolean>) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const copy = () => {
    clearTimeout(resetTimer.current);
    void onCopy().then((ok) => {
      setStatus(ok ? 'copied' : 'failed');
      resetTimer.current = setTimeout(() => setStatus('idle'), 2000);
    });
  };

  return { status, copy };
}

function CopyStatusAnnouncement({ status }: { status: CopyStatus }) {
  const { t } = useTranslation();

  return (
    <span role="status" aria-live="polite" className="sr-only">
      {status === 'copied'
        ? t('managedSession.copy.copied')
        : status === 'failed'
          ? t('managedSession.copy.failed')
          : ''}
    </span>
  );
}

function CopyButton({
  status,
  onCopy,
  className,
}: {
  status: CopyStatus;
  onCopy: () => void;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            aria-label={t('managedSession.copy.action')}
            className={cn('shrink-0', className)}
            icon={status === 'copied' ? Check : Copy}
            size="xs"
            variant="ghost"
            onClick={onCopy}
          />
        </TooltipTrigger>
        <TooltipContent>{t('managedSession.copy.action')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Always-visible actions in a row under an agent answer. */
export function AnswerMessageActions({ onCopy }: { onCopy: () => Promise<boolean> }) {
  const { status, copy } = useCopy(onCopy);

  return (
    <div data-message-actions="true" className="flex">
      <CopyButton status={status} onCopy={copy} />
      <CopyStatusAnnouncement status={status} />
    </div>
  );
}

/**
 * The user's message bubble with its actions: a hover toolbar on the corner with a fine pointer, a
 * long-press menu on touch. Expects to sit inside a `relative group/message` article. The corner
 * toolbar also stays visible for a moment after a copy, so a copy from the touch menu is confirmed.
 */
export function RequestMessageActions({
  onCopy,
  children,
}: {
  onCopy: () => Promise<boolean>;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const finePointer = useFinePointer();
  const { status, copy } = useCopy(onCopy);
  const confirming = status !== 'idle';

  return (
    <>
      <ContextMenu>
        {/* With a mouse the browser keeps its own context menu: the toolbar offers the actions. */}
        <ContextMenuTrigger asChild disabled={finePointer}>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent aria-label={t('managedSession.messageActions')}>
          <ContextMenuItem leadingIcon={Copy} onSelect={copy}>
            {t('managedSession.copy.action')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {(finePointer || confirming) && (
        <div
          data-message-actions="true"
          className={cn(
            'absolute -top-3 right-2 z-10 flex rounded-control border border-solid border-border-default bg-surface-raised shadow-lg',
            !confirming &&
              'opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100',
          )}
        >
          <CopyButton status={status} onCopy={copy} />
        </div>
      )}
      <CopyStatusAnnouncement status={status} />
    </>
  );
}
