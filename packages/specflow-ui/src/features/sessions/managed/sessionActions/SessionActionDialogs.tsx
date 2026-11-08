import { useId, useState, type ReactNode } from 'react';
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

/**
 * Pending or unconfirmed: Cancel, Escape and (Rename) the input stay locked until it settles. A Turn
 * that has not ended blocks the command itself, so it unlocks the way out even after an
 * unconfirmed attempt.
 */
function isLocked(view: SessionCommandView, turnNote?: TurnBlockNote) {
  return view.pending || (view.failure === 'unconfirmed' && !turnNote);
}

/** A refusal or an unconfirmed request, shown as an `Alert` with `role="alert"`. */
function FailureAlert({ view, className }: { view: SessionCommandView; className?: string }) {
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

  return alert ? <Alert role="alert" tone="attention" title={alert} className={className} /> : null;
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
          <Field invalid={showError && Boolean(error)}>
            <Field.Label>{t('managedSession.sessionActions.renameLabel')}</Field.Label>
            <TextInput
              autoFocus
              value={draft}
              // Not `disabled`: the input keeps focus while the rename is pending or unconfirmed.
              readOnly={locked}
              aria-disabled={locked || undefined}
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
          <FailureAlert view={view} className="mt-3" />
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

/**
 * The Archive or Delete confirmation. The Turn note sits in a polite region that is always there
 * (inside the header's description block, so it takes no grid row while empty) and is part of the
 * dialog's description, so it is read on open.
 */
function ConfirmSessionDialog({
  open,
  title,
  description,
  view,
  note,
  turnNote,
  confirmLabel,
  pendingLabel,
  destructive = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  view: SessionCommandView;
  note?: TurnBlockNote;
  turnNote?: TurnBlockNote;
  confirmLabel: string;
  pendingLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const descriptionId = useId();
  const noteId = useId();
  const locked = isLocked(view, turnNote);
  // `aria-disabled` (not `disabled`) keeps focus on the control; the press itself is ignored.
  const blocked = view.pending || !!turnNote;

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !locked && onClose()}>
      <AlertDialogContent aria-describedby={`${descriptionId} ${noteId}`}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <div>
            <AlertDialogDescription id={descriptionId}>{description}</AlertDialogDescription>
            <div id={noteId} role="status">
              {note ? (
                <InlineNote tone="attention" className="mt-4">
                  {t(`managedSession.sessionActions.${note}`)}
                </InlineNote>
              ) : null}
            </div>
          </div>
        </AlertDialogHeader>
        <FailureAlert view={view} />
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="secondary" disabled={locked}>
              {t('common.cancel')}
            </Button>
          </AlertDialogCancel>
          <Button
            {...(destructive ? { variant: 'destructive' as const } : {})}
            aria-disabled={blocked || undefined}
            onClick={() => {
              if (!blocked) {
                onConfirm();
              }
            }}
          >
            {view.pending ? pendingLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

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

  return (
    <>
      {open === 'rename' ? (
        <RenameSessionDialog title={title} view={rename} onSubmit={onRename} onClose={onClose} />
      ) : null}
      <ConfirmSessionDialog
        open={open === 'archive'}
        title={t('managedSession.sessionActions.archiveTitle')}
        description={t('managedSession.sessionActions.archiveDescription')}
        view={archive}
        note={noteFor(archive)}
        turnNote={turnNote}
        confirmLabel={t('managedSession.sessionActions.archive')}
        pendingLabel={t('managedSession.sessionActions.archiving')}
        onConfirm={onArchive}
        onClose={onClose}
      />
      <ConfirmSessionDialog
        open={open === 'delete'}
        title={t('managedSession.sessionActions.deleteTitle')}
        description={
          <>
            {/* The Session's own name on its own line, as Documents delete shows the path. */}
            <span className="mb-3 block break-words text-content-primary">{title}</span>
            {t('managedSession.sessionActions.deleteDescription')}
          </>
        }
        view={remove}
        note={noteFor(remove)}
        turnNote={turnNote}
        confirmLabel={t('managedSession.sessionActions.delete')}
        pendingLabel={t('managedSession.sessionActions.deleting')}
        destructive
        onConfirm={onDelete}
        onClose={onClose}
      />
    </>
  );
}
