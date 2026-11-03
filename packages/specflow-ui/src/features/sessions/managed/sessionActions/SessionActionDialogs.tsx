import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  TextInput,
} from '@nevo/ui';

/** The contract's `CreateSessionSchema.title` limit. */
export const SESSION_TITLE_MAX_LENGTH = 256;

export type SessionTitleError = 'empty' | 'tooLong';

export function validateSessionTitle(value: string): SessionTitleError | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'empty';
  }

  return trimmed.length > SESSION_TITLE_MAX_LENGTH ? 'tooLong' : undefined;
}

/** Mounted only while open, so the draft always starts from the current title. */
function RenameSessionDialog({
  title,
  onSubmit,
  onClose,
}: {
  title: string;
  onSubmit: (title: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(title);
  const [showError, setShowError] = useState(false);
  const error = validateSessionTitle(draft);
  const submit = () => {
    if (error) {
      setShowError(true);

      return;
    }

    onSubmit(draft.trim());
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('managedSession.sessionActions.renameTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Field invalid={showError && Boolean(error)}>
            <Field.Label>{t('managedSession.sessionActions.renameLabel')}</Field.Label>
            <TextInput
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            {showError && error ? (
              <Field.Error>
                {error === 'empty'
                  ? t('managedSession.sessionActions.renameEmpty')
                  : t('managedSession.sessionActions.renameTooLong', {
                      max: SESSION_TITLE_MAX_LENGTH,
                    })}
              </Field.Error>
            ) : null}
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit}>{t('managedSession.sessionActions.renameSave')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type SessionActionDialog = 'rename' | 'archive' | 'delete';

/** Rename, archive and delete dialogs of the Session screen; `open` decides which one is shown. */
export function SessionActionDialogs({
  open,
  title,
  onRename,
  onArchive,
  onDelete,
  onClose,
}: {
  open: SessionActionDialog | undefined;
  title: string;
  onRename: (title: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      {open === 'rename' ? (
        <RenameSessionDialog title={title} onSubmit={onRename} onClose={onClose} />
      ) : null}
      <AlertDialog open={open === 'archive'} onOpenChange={(next) => !next && onClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('managedSession.sessionActions.archiveTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('managedSession.sessionActions.archiveDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary">{t('common.cancel')}</Button>
            </AlertDialogCancel>
            <Button onClick={onArchive}>{t('managedSession.sessionActions.archive')}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={open === 'delete'} onOpenChange={(next) => !next && onClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('managedSession.sessionActions.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('managedSession.sessionActions.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary">{t('common.cancel')}</Button>
            </AlertDialogCancel>
            <Button variant="destructive" onClick={onDelete}>
              {t('managedSession.sessionActions.delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
