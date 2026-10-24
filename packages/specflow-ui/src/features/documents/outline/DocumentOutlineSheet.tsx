import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  IconButton,
  cn,
  hitAreaClassName,
} from '@nevo/ui';
import type { OutlineHeading } from './markdownOutline';

const indent = { 1: 'pl-0', 2: 'pl-3', 3: 'pl-6', 4: 'pl-9' } as const;

/**
 * The contents of the previewed document as a bottom sheet: a list of links with at least 44 px
 * rows, long titles wrapped to two lines. Choosing a heading closes the sheet and hands the heading
 * to `onSelected` once the sheet has gone, so focus can land on the heading and is not pulled back.
 */
export function DocumentOutlineSheet({
  open,
  headings,
  activeLine,
  onOpenChange,
  onSelected,
  restoreFocusTo,
}: {
  open: boolean;
  headings: readonly OutlineHeading[];
  /** The heading the reader was at when the sheet opened. */
  activeLine?: number;
  onOpenChange: (open: boolean) => void;
  /** Runs after the sheet closed because a heading was chosen (`pointer`: by mouse or touch). */
  onSelected: (line: number, pointer: boolean) => void;
  /** Where focus goes when the sheet closes without a choice (the control that opened it). */
  restoreFocusTo?: () => HTMLElement | null | undefined;
}) {
  const { t } = useTranslation();
  const chosen = useRef<{ line: number; pointer: boolean } | undefined>(undefined);
  const entry = useRef<HTMLAnchorElement | null>(null);
  const title = t('documents.outline.title', { n: headings.length });
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        side="bottom"
        // Ten headings must not take most of a phone: the compact sheet caps its height.
        size="compact"
        showClose={false}
        onOpenAutoFocus={(event) => {
          // Focus the heading the reader is at (it scrolls into view with it), else the first one.
          event.preventDefault();
          chosen.current = undefined;
          // The scroll body mounts its list a frame later than the sheet itself.
          requestAnimationFrame(() => entry.current?.focus());
        }}
        onCloseAutoFocus={(event) => {
          const choice = chosen.current;
          chosen.current = undefined;
          if (choice === undefined) {
            const opener = restoreFocusTo?.();
            if (opener?.isConnected) {
              event.preventDefault();
              opener.focus();
            }
            return;
          }
          // Not back to the opener: the document heading is where the reader goes.
          event.preventDefault();
          onSelected(choice.line, choice.pointer);
        }}
      >
        <DrawerHeader className="flex items-center justify-between gap-3 pr-3">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerClose asChild>
            <IconButton
              aria-label={t('documents.outline.close')}
              className={cn(hitAreaClassName)}
              icon="close"
              size="sm"
              variant="ghost"
            />
          </DrawerClose>
          <DrawerDescription className="sr-only">
            {t('documents.outline.description')}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="px-2 py-2">
          <nav aria-label={t('documents.outline.label')}>
            <ol className="grid grid-cols-1 gap-0.5">
              {headings.map((heading, index) => {
                const active = heading.line === activeLine;
                return (
                  <li key={heading.line} className={cn('min-w-0', indent[heading.level])}>
                    <a
                      ref={active || (activeLine === undefined && index === 0) ? entry : undefined}
                      href={`#line-${heading.line}`}
                      aria-current={active ? 'location' : undefined}
                      className={cn(
                        'flex min-h-11 min-w-0 items-center break-words rounded-control px-3 py-2 text-body-md text-content-secondary no-underline hover:bg-surface-hover hover:text-content-primary',
                        active && 'bg-surface-selected text-content-primary',
                      )}
                      onClick={(event) => {
                        event.preventDefault();
                        // A click with no pointer detail comes from the keyboard or an assistive technology.
                        chosen.current = { line: heading.line, pointer: event.detail > 0 };
                        onOpenChange(false);
                      }}
                    >
                      <span
                        className={cn('min-w-0', heading.level === 1 ? 'truncate' : 'line-clamp-2')}
                        title={heading.text}
                      >
                        {heading.text}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
