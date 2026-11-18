import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nevo/ui';

/** Names a confirm spells out before "+N". */
const NAMED = 3;

export interface UseDefaultContextDialogProps {
  readonly open: boolean;
  /** The entries of the own list. */
  readonly count: number;
  /** The names of the own entries the default does not hold (what the return removes). */
  readonly removed: readonly string[];
  readonly pending: boolean;
  readonly error?: ReactNode;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

/**
 * The confirm of "Use default context": what replaces the own list and which of its entries go,
 * named before the action (the default list is the Engine's, read from the projection).
 */
export function UseDefaultContextDialog({
  open,
  count,
  removed,
  pending,
  error,
  onConfirm,
  onClose,
}: UseDefaultContextDialogProps) {
  const { t } = useTranslation();
  const names = [
    ...removed.slice(0, NAMED),
    ...(removed.length > NAMED
      ? [t('taskAuthoring.context.moreNames', { count: removed.length - NAMED })]
      : []),
  ].join(', ');

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('taskAuthoring.context.useDefaultTitle')}</DialogTitle>
          <DialogDescription>
            {t('taskAuthoring.context.useDefaultBody', { count })}
            {removed.length > 0
              ? ` ${t('taskAuthoring.context.useDefaultRemoved', { names })}`
              : null}
          </DialogDescription>
        </DialogHeader>
        {error ? <DialogBody>{error}</DialogBody> : null}
        <DialogFooter>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={pending} onClick={onConfirm}>
            {t('taskAuthoring.context.useDefault')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
