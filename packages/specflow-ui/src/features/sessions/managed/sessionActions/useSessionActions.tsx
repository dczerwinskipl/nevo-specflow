import { useRef, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { WorkspaceHeaderAction } from '@nevo/ui';
import type {
  ArchiveSession,
  RenameSession,
  SessionSnapshot,
} from '@nevo/specflow-contracts/sessions';
import { isApiError } from '../../../../api';
import { sendRetained, type RequestAttempt } from '../../../../shared/operations/retainedRequest';
import { sessionErrorCode, type ManagedSessionsApi } from '../api';
import {
  SessionActionDialogs,
  type SessionActionDialog,
  type SessionCommandView,
} from './SessionActionDialogs';
import { sessionCommandFailure, turnBlockNote } from './sessionCommandFailure';

interface Attempt<T> {
  current: RequestAttempt<T> | null;
}

/** Only a lost answer keeps the request id for the retry; a definite answer releases it. */
const releaseOnDefiniteAnswer = (error: unknown) => sessionCommandFailure(error) !== 'unconfirmed';

function commandView(mutation: { isPending: boolean; error: Error | null }): SessionCommandView {
  const error = mutation.error;

  return {
    pending: mutation.isPending,
    ...(error
      ? {
          failure: sessionCommandFailure(error),
          ...(isApiError(error) ? { errorKind: error.kind } : {}),
        }
      : {}),
  };
}

/**
 * Rename, Archive, Unarchive and Delete of one Session (full-session-screen-structure §22.1): the header menu
 * items, their dialogs and the one owner of each command, shared by every trigger (Unarchive is
 * pressed from the menu or from the archived bar). Nothing is patched locally: the Session's new
 * state arrives as a `session` change on the stream.
 */
export function useSessionActions({
  api,
  sessionId,
  session,
  activeTurn,
  onUnarchived,
  onDeleted,
}: {
  api: ManagedSessionsApi;
  sessionId: string;
  /** The Session's effective projection; absent before the first snapshot (no actions then). */
  session: SessionSnapshot['session'] | undefined;
  activeTurn: SessionSnapshot['activeTurn'];
  onUnarchived?: () => void;
  /** The Session is gone (204, or 404 for a delete this view sent). */
  onDeleted?: () => void;
}): {
  /** Header overflow actions, in menu order (Delete last, danger); empty without capabilities. */
  actions: WorkspaceHeaderAction[];
  dialogs: ReactNode;
  /** The Unarchive command, also pressed from the archived bar. */
  unarchive: SessionCommandView & { run: () => void };
  /**
   * This view's own Delete. While it `holds` (in flight, unconfirmed, or done), a Session that turns
   * out to be gone (the stream closed by the delete, then 404) is this view's success, never the
   * deleted-elsewhere view: `confirmGone` finishes it (once).
   */
  deletion: { holds: boolean; confirmGone: () => void };
} {
  const { t } = useTranslation();
  const [open, setOpen] = useState<SessionActionDialog>();
  const [deleted, setDeleted] = useState(false);
  // Guards the one-time finish across its two triggers (the DELETE's answer, the 404 on the
  // stream); owned by this hook for the screen's lifetime.
  const deleteFinished = useRef(false);
  // Idempotency keys, kept only across an unconfirmed attempt (not UI state).
  const [attempts] = useState(() => {
    const rename: Attempt<RenameSession> = { current: null };
    const archive: Attempt<ArchiveSession> = { current: null };
    const unarchive: Attempt<ArchiveSession> = { current: null };

    return { rename, archive, unarchive };
  });
  const close = () => setOpen(undefined);
  const rename = useMutation({
    mutationFn: (title: string) =>
      sendRetained(
        attempts.rename,
        { title },
        (input) => api.rename(sessionId, input),
        'requestId',
        releaseOnDefiniteAnswer,
      ),
  });
  const archive = useMutation({
    mutationFn: () =>
      sendRetained(
        attempts.archive,
        {},
        (input) => api.archive(sessionId, input),
        'requestId',
        releaseOnDefiniteAnswer,
      ),
  });
  const unarchive = useMutation({
    mutationFn: () =>
      sendRetained(
        attempts.unarchive,
        {},
        (input) => api.unarchive(sessionId, input),
        'requestId',
        releaseOnDefiniteAnswer,
      ),
  });
  const remove = useMutation({
    // No body and no request id: a retry repeats the DELETE, and a 404 for it means the earlier,
    // unconfirmed attempt had in fact deleted the Session.
    mutationFn: async () => {
      try {
        await api.delete(sessionId);
      } catch (error) {
        if (sessionErrorCode(error) !== 'SESSION_NOT_FOUND') {
          throw error;
        }
      }
    },
  });
  const finishDelete = () => {
    if (deleteFinished.current) {
      return;
    }

    deleteFinished.current = true;
    setDeleted(true);
    close();
    onDeleted?.();
  };

  const openDialog = (dialog: SessionActionDialog, mutation: { reset: () => void }) => {
    mutation.reset();
    setOpen(dialog);
  };

  // Success reactions are per call: they run only while this screen is still mounted, so a late
  // answer never closes, focuses or navigates on behalf of a screen the user has left.
  const runUnarchive = () => {
    if (!unarchive.isPending) {
      unarchive.mutate(undefined, { onSuccess: () => onUnarchived?.() });
    }
  };

  const manage = !!session?.capabilities.manage;
  const canDelete = !!session?.capabilities.delete;
  const archived = !!session?.archivedAt;
  const base = { direct: 'never', group: 'actions' } as const;
  // An unavailable action is omitted, never shown disabled (full-session-screen-structure §22.1).
  const actions: WorkspaceHeaderAction[] = [];
  if (manage) {
    actions.push({
      ...base,
      id: 'rename-session',
      label: t('managedSession.sessionActions.rename'),
      icon: 'rename',
      onPress: () => openDialog('rename', rename),
    });
    actions.push(
      archived
        ? {
            ...base,
            id: 'unarchive-session',
            label: unarchive.isPending
              ? t('managedSession.sessionActions.unarchiving')
              : t('managedSession.sessionActions.unarchive'),
            icon: 'undo',
            onPress: runUnarchive,
          }
        : {
            ...base,
            id: 'archive-session',
            label: t('managedSession.sessionActions.archive'),
            icon: 'archive',
            onPress: () => openDialog('archive', archive),
          },
    );
  }

  if (canDelete) {
    actions.push({
      ...base,
      id: 'delete-session',
      label: t('managedSession.sessionActions.delete'),
      icon: 'trash',
      tone: 'danger',
      onPress: () => openDialog('delete', remove),
    });
  }

  const dialogs = (
    <SessionActionDialogs
      open={open}
      title={session?.title ?? t('managedSession.title')}
      turnNote={activeTurn ? turnBlockNote(activeTurn.state) : undefined}
      rename={commandView(rename)}
      archive={commandView(archive)}
      remove={commandView(remove)}
      onClose={close}
      onRename={(title) => rename.mutate(title, { onSuccess: close })}
      onArchive={() => archive.mutate(undefined, { onSuccess: close })}
      onDelete={() => remove.mutate(undefined, { onSuccess: finishDelete })}
    />
  );
  const removeView = commandView(remove);

  return {
    actions,
    dialogs,
    unarchive: {
      ...commandView(unarchive),
      run: runUnarchive,
    },
    deletion: {
      holds: deleted || removeView.pending || removeView.failure === 'unconfirmed',
      confirmGone: finishDelete,
    },
  };
}
