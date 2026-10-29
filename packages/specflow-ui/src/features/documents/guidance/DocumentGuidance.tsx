import { useId } from 'react';
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
  Typography,
  cn,
  hitAreaClassName,
} from '@nevo/ui';
import type { DocumentGuidance } from '../catalogue/documentTypePolicy';

/**
 * What the type is for and how to write it. The catalogue's text is shown as plain text with its
 * line breaks and spaces kept; it is never rendered as markup.
 */
function GuidanceText({ guidance }: { guidance: DocumentGuidance }) {
  return (
    <div className="grid min-w-0 gap-3 text-body-sm">
      <div className="grid gap-1">
        <p className="m-0 break-words text-content-secondary">{guidance.description}</p>
        <p className="m-0 break-words text-content-muted">{guidance.useWhen}</p>
      </div>
      {guidance.instructions.map((instructions, index) => (
        <p
          key={index}
          className="m-0 whitespace-pre-wrap break-words border-t border-divider pt-3 text-content-primary"
        >
          {instructions}
        </p>
      ))}
    </div>
  );
}

/**
 * The guidance as a column beside the contents column (wide panels): its own scroll, so long
 * instructions never push the document.
 */
export function DocumentGuidanceColumn({
  guidance,
  width,
  maxHeight,
  className,
}: {
  guidance: DocumentGuidance;
  width: number;
  /** The column scrolls inside this height (the visible panel); unset, it fills its row. */
  maxHeight?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <aside
      aria-labelledby={titleId}
      className={cn('grid min-w-0 content-start gap-2 overflow-y-auto', className)}
      style={maxHeight ? { width, maxHeight } : { width }}
    >
      <Typography as="p" variant="label-md" className="m-0 px-2 text-content-muted">
        {t('documents.guidance.label')}
      </Typography>
      <div className="grid gap-2 px-2">
        <Typography as="h3" id={titleId} variant="title-sm" className="m-0">
          {t('documents.guidance.heading', { type: guidance.title })}
        </Typography>
        <GuidanceText guidance={guidance} />
      </div>
    </aside>
  );
}

/**
 * The guidance as a bottom sheet (panels too narrow for the column, and the source editor below the
 * threshold). Closing returns focus to the control that opened it.
 */
export function DocumentGuidanceSheet({
  open,
  guidance,
  onOpenChange,
  restoreFocusTo,
}: {
  open: boolean;
  guidance: DocumentGuidance | undefined;
  onOpenChange: (open: boolean) => void;
  restoreFocusTo?: () => HTMLElement | null | undefined;
}) {
  const { t } = useTranslation();

  return (
    <Drawer open={open && guidance !== undefined} onOpenChange={onOpenChange}>
      <DrawerContent
        side="bottom"
        size="compact"
        showClose={false}
        onCloseAutoFocus={(event) => {
          const opener = restoreFocusTo?.();
          if (opener?.isConnected) {
            event.preventDefault();
            opener.focus();
          }
        }}
      >
        <DrawerHeader className="flex items-start justify-between gap-3 pr-3">
          <div className="grid min-w-0 gap-0.5">
            <DrawerTitle>{t('documents.guidance.label')}</DrawerTitle>
            <DrawerDescription className="truncate">
              {guidance ? t('documents.guidance.heading', { type: guidance.title }) : ''}
            </DrawerDescription>
          </div>
          <DrawerClose asChild>
            <IconButton
              aria-label={t('documents.guidance.close')}
              className={cn('shrink-0', hitAreaClassName)}
              icon="close"
              size="sm"
              variant="ghost"
            />
          </DrawerClose>
        </DrawerHeader>
        <DrawerBody className="px-4 py-3">
          {guidance && <GuidanceText guidance={guidance} />}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
