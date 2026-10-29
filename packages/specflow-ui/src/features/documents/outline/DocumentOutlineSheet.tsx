import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  IconButton,
  cn,
  hitAreaClassName,
} from '@nevo/ui';
import { OutlineEntries } from './DocumentOutline';
import type { OutlineHeading } from './markdownOutline';

/**
 * The contents of the previewed document as a bottom sheet (titled "Contents"; the tab already names
 * the document). The list is the column's renderer (`OutlineEntries`): the same compact tree rows,
 * indentation per real level and current-section mark, long titles wrapped to two lines and a 44 px
 * hit area on touch. Choosing a heading closes the sheet and hands the heading to `onSelected` once the
 * sheet has gone, so focus can land on the heading and is not pulled back.
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
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        side="bottom"
        // Ten headings must not take most of a phone: the compact sheet caps its height.
        size="compact"
        showClose={false}
        aria-describedby={undefined}
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
          {/* The tab and the header already name the document: the title is enough. */}
          <DrawerTitle className="min-w-0 truncate">{t('documents.outline.label')}</DrawerTitle>
          <DrawerClose asChild>
            <IconButton
              aria-label={t('documents.outline.close')}
              className={cn('shrink-0', hitAreaClassName)}
              icon="close"
              size="sm"
              variant="ghost"
            />
          </DrawerClose>
        </DrawerHeader>
        <DrawerBody className="px-2 py-2">
          <nav aria-label={t('documents.outline.label')}>
            <OutlineEntries
              headings={headings}
              activeLine={activeLine}
              variant="sheet"
              focusRef={entry}
              onSelect={(line, pointer) => {
                chosen.current = { line, pointer };
                onOpenChange(false);
              }}
            />
          </nav>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
