import { useState } from 'react';
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
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  InlineNote,
  TextInput,
} from '@nevo/ui';
import type { ApiErrorKind } from '../../../../api';
import type { SessionCommandFailure, TurnBlockNote } from './sessionCommandFailure';

/** The contract's `SessionTitleSchema` limit. */
export const SESSION_TITLE_MAX_LENGTH = 256;

export type SessionTitleError = 'empty' | 'tooLong';

export function validateSessionTitle(value: string): SessionTitleError | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'empty';
  }

  return trimmed.length > SESSION_TITLE_MAX_LENGTH ? 'tooLong' : undefined;
}

/** What one dialog's command is doing: in flight, or how its last attempt failed. */
export interface SessionCommandView {
  readonly pending: boolean;
  readonly failure?: SessionCommandFailure;
  /** The classified kind of a `refused` failure, for its generic copy. */
  readonly errorKind?: ApiErrorKind;
}

/** Pending or unconfirmed: Cancel, Escape and (Rename) the input stay locked until it settles. */
function isLocked(view: SessionCommandView) {
  return view.pending || view.failure === 'unconfirmed';
}

/**
 * The dialog's feedback above its footer: the Turn note in a polite region that is always there,
 * a refusal or an unconfirmed request as an `Alert` with `role="alert"` (session-actions-ux).
 */
function DialogFeedback({
  view,
  note,
  className,
}: {
  view: SessionCommandView;
  note?: TurnBlockNote;
  className?: string;
}) {
  const { t } = useTranslation();
  const alert =
    view.failure === 'unconfirmed'
      ? t('managedSession.sessionActions.unconfirmed')
      : view.failure === 'forbidden'
        ? t('managedSession.sessionActions.forbidden')
        : view.failure === 'deleteBlocked'
          ? t('managedSession.sessionActions.deleteBlocked')
          : view.failure === 'refused'
            ? t(`apiErrors.kind.${view.errorKind ?? 'server'}.title`)
            : undefined;

  // `contents`: the region is always there (announcing what appears in it) without taking a row of
  // the dialog's grid while it is empty.
  return (
    <>
      <div role="status" className="contents">
        {note ? (
          <InlineNote tone="attention">{t(`managedSession.sessionActions.${note}`)}</InlineNote>
        ) : null}
      </div>
      {alert ? <Alert role="alert" tone="attention" title={alert} className={className} /> : null}
    </>
  );
}

/** Mounted only while open, so the draft always starts from the current title. */
function RenameSessionDialog({
  title,
  view,
  onSubmit,
  onClose,
}: {
  title: string;
  view: SessionCommandView;
  onSubmit: (title: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(title);
  const [showError, setShowError] = useState(false);
  const error = validateSessionTitle(draft);
  const locked = isLocked(view);
  const submit = () => {
    // `aria-disabled` keeps focus on the pressed control; the press itself is ignored.
    if (view.pending) {
      return;
    }

    if (error) {
      setShowError(true);

      return;
    }

    onSubmit(draft.trim());
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !locked && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('managedSession.sessionActions.renameTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Field invalid={showError && Boolean(error)} disabled={locked}>
            <Field.Label>{t('managedSession.sessionActions.renameLabel')}</Field.Label>
            <TextInput
              autoFocus
              value={draft}
              disabled={locked}
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
          <DialogFeedback view={view} className="mt-3" />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" disabled={locked} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button aria-disabled={view.pending || undefined} onClick={submit}>
            {view.pending
              ? t('managedSession.sessionActions.renaming')
              : t('managedSession.sessionActions.renameSave')}
          </Button>
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
  turnNote,
  rename,
  archive,
  remove,
  onRename,
  onArchive,
  onDelete,
  onClose,
}: {
  open: SessionActionDialog | undefined;
  title: string;
  /** Archive and Delete cannot be confirmed while the Session has a Turn that has not ended. */
  turnNote?: TurnBlockNote;
  rename: SessionCommandView;
  archive: SessionCommandView;
  remove: SessionCommandView;
  onRename: (title: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // A race the snapshot has not caught up with yet still says why.
  const noteFor = (view: SessionCommandView) =>
    turnNote ?? (view.failure === 'turnConflict' ? 'turnActive' : undefined);
  const closeUnless = (view: SessionCommandView) => (next: boolean) => {
    if (!next && !isLocked(view)) {
      onClose();
    }
  };

  const confirmPress = (view: SessionCommandView, run: () => void) => () => {
    if (!view.pending && !turnNote) {
      run();
    }
  };

  return (
    <>
      {open === 'rename' ? (
        <RenameSessionDialog title={title} view={rename} onSubmit={onRename} onClose={onClose} />
      ) : null}
      <AlertDialog open={open === 'archive'} onOpenChange={closeUnless(archive)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('managedSession.sessionActions.archiveTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('managedSession.sessionActions.archiveDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <DialogFeedback view={archive} note={noteFor(archive)} />
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary" disabled={isLocked(archive)}>
                {t('common.cancel')}
              </Button>
            </AlertDialogCancel>
            <Button
              disabled={!!turnNote}
              aria-disabled={archive.pending || undefined}
              onClick={confirmPress(archive, onArchive)}
            >
              {archive.pending
                ? t('managedSession.sessionActions.archiving')
                : t('managedSession.sessionActions.archive')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={open === 'delete'} onOpenChange={closeUnless(remove)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('managedSession.sessionActions.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {/* The Session's own name on its own line, as Documents delete shows the path. */}
              <span className="mb-3 block break-words text-content-primary">{title}</span>
              {t('managedSession.sessionActions.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <DialogFeedback view={remove} note={noteFor(remove)} />
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary" disabled={isLocked(remove)}>
                {t('common.cancel')}
              </Button>
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!!turnNote}
              aria-disabled={remove.pending || undefined}
              onClick={confirmPress(remove, onDelete)}
            >
              {remove.pending
                ? t('managedSession.sessionActions.deleting')
                : t('managedSession.sessionActions.delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
