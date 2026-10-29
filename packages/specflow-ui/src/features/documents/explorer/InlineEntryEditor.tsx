import { useId, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Icon, Popover, PopoverAnchor, PopoverContent, TextInput } from '@nevo/ui';
import type { InlineEntry } from './inlineEntry';

/**
 * The name input of a new or renamed tree entry. Enter commits, Escape cancels, leaving the page
 * (window or tab blur) keeps the half-typed name and only a click elsewhere in the page commits it.
 */
export function InlineEntryEditor({
  entry,
  flat = false,
  busy,
  unknown,
  inputRef,
  onChange,
  onBlur,
  onEnter,
  onEscape,
  onCheckResult,
}: {
  entry: InlineEntry;
  /** In a level without folders a file starts at the row edge (no folder icon column). */
  flat?: boolean;
  busy: boolean;
  unknown: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (name: string) => void;
  /** Focus moved elsewhere inside the page. */
  onBlur: () => void;
  onEnter: () => void;
  onEscape: () => void;
  /** After an unknown outcome: ask again whether the operation was applied. */
  onCheckResult: () => void;
}) {
  const { t } = useTranslation();
  const errorId = useId();
  return (
    <div
      className={
        entry.kind === 'document' && !flat
          ? 'ml-tree-leaf-offset grid min-w-0 flex-1 gap-1 py-1'
          : 'grid min-w-0 flex-1 gap-1 py-1'
      }
    >
      {/*
        A refused name is said right at the field, over the rows below (a popover anchored to it),
        so the list never shifts; the input keeps focus and the typed name.
      */}
      <Popover open={Boolean(entry.error)}>
        <PopoverAnchor asChild>
          <div className="flex items-center gap-2">
            <Icon name={entry.kind === 'folder' ? 'folder' : 'file'} />
            <TextInput
              ref={inputRef}
              autoFocus
              aria-label={
                entry.rename
                  ? t('documents.tree.inputRename')
                  : entry.kind === 'folder'
                    ? t('documents.tree.inputFolder')
                    : t('documents.tree.inputFile')
              }
              aria-invalid={entry.error ? true : undefined}
              aria-describedby={entry.error ? errorId : undefined}
              value={entry.name}
              disabled={busy || unknown}
              onFocus={(event) => {
                if (!entry.rename) return;
                // Rename shows the full value; the stem is selected so the extension survives typing.
                const input = event.currentTarget;
                const dot = entry.kind === 'document' ? input.value.lastIndexOf('.') : -1;
                input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
              }}
              onChange={(event) => onChange(event.target.value)}
              onBlur={() => {
                // Switching window or tab blurs the input too; the half-typed name stays until the
                // user returns, and only Enter or a click elsewhere in the page commits it.
                if (!document.hasFocus()) return;
                onBlur();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  onEscape();
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onEnter();
                }
              }}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={4}
          aria-labelledby={errorId}
          // Never wider than the field it belongs to (the tree pane).
          className="w-(--radix-popover-trigger-width) px-3 py-2"
          // The field keeps focus: the message is read through `aria-describedby` and the alert.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <p id={errorId} role="alert" className="m-0 text-body-sm text-content-error">
            {entry.error}
          </p>
        </PopoverContent>
      </Popover>
      {unknown && (
        <Button size="sm" disabled={busy} onClick={onCheckResult}>
          {t('documents.tree.checkResult')}
        </Button>
      )}
    </div>
  );
}
