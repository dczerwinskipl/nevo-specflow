import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '@nevo/ui';

/**
 * One unsaved-changes decision for documents: keep editing (cancel), discard (destructive)
 * or save (primary). Used by the editor's Cancel and by route/document departure.
 */
export function UnsavedChangesDialog({
  open,
  description,
  details,
  saveLabel,
  discardLabel,
  failureTitle,
  pending = false,
  saveFailed = false,
  onContinue,
  onDiscard,
  onSave,
  onCloseAutoFocus,
}: {
  open: boolean;
  description: ReactNode;
  /** Content under the description that is not a paragraph, for example a list of documents. */
  details?: ReactNode;
  saveLabel: string;
  /** Defaults to "Discard changes". */
  discardLabel?: string;
  /** Replaces the default save-failed message. */
  failureTitle?: string;
  pending?: boolean;
  saveFailed?: boolean;
  onContinue: () => void;
  onDiscard: () => void;
  onSave: () => void;
  onCloseAutoFocus?: ComponentPropsWithoutRef<typeof AlertDialogContent>['onCloseAutoFocus'];
}) {
  const { t } = useTranslation();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          onContinue();
        }
      }}
    >
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('documents.unsaved')}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {details}
        {saveFailed && (
          <Alert
            tone="attention"
            title={failureTitle ?? t('documents.dialogs.unsaved.saveFailed')}
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="secondary" disabled={pending}>
              {t('documents.dialogs.unsaved.continue')}
            </Button>
          </AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={onDiscard}>
            {discardLabel ?? t('documents.dialogs.unsaved.discard')}
          </Button>
          <Button disabled={pending} onClick={onSave}>
            {saveLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
