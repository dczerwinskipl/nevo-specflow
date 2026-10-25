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
import { OutlineEntries } from './DocumentOutline';
import type { OutlineHeading } from './markdownOutline';

/**
 * The contents of the previewed document as a bottom sheet, titled with the document's name. The
 * list is the column's renderer (`OutlineEntries`) in its sheet density: the same indentation and
 * weight per level and the current section marked, with at least 44 px rows and long titles wrapped
 * to two lines. Choosing a heading closes the sheet and hands the heading to `onSelected` once the
 * sheet has gone, so focus can land on the heading and is not pulled back.
 */
export function DocumentOutlineSheet({
  open,
  documentName,
  headings,
  activeLine,
  onOpenChange,
  onSelected,
  restoreFocusTo,
}: {
  open: boolean;
  /** The file name of the document, under the title. */
  documentName: string;
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
        <DrawerHeader className="flex items-start justify-between gap-3 pr-3">
          <div className="grid min-w-0 gap-0.5">
            <DrawerTitle>{t('documents.outline.label')}</DrawerTitle>
            <DrawerDescription className="truncate" title={documentName}>
              {documentName}
            </DrawerDescription>
          </div>
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
