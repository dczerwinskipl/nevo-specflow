import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkspaceHeaderAction } from '@nevo/ui';
import { SessionActionDialogs, type SessionActionDialog } from './SessionActionDialogs';

/**
 * Session-level actions. Visual-only for now: the managed-Sessions contract has no rename, archive
 * or delete command, so the route leaves every callback unwired (items render disabled) and only
 * Storybook passes them. Each callback runs after the user confirms its dialog.
 */
export interface SessionActionHandlers {
  onRenameSession?: (title: string) => void;
  onArchiveSession?: () => void;
  onDeleteSession?: () => void;
}

export function useSessionActions({
  title,
  onRenameSession,
  onArchiveSession,
  onDeleteSession,
}: SessionActionHandlers & { title: string | undefined }): {
  /** Header overflow actions, in menu order (Delete last, danger). */
  actions: WorkspaceHeaderAction[];
  dialogs: ReactNode;
  /** The title to show: a just-confirmed rename wins until the snapshot title itself changes. */
  title: string | undefined;
} {
  const { t } = useTranslation();
  const [open, setOpen] = useState<SessionActionDialog>();
  const [renamed, setRenamed] = useState<{ from: string | undefined; to: string }>();
  const close = () => setOpen(undefined);
  const shownTitle = renamed && renamed.from === title ? renamed.to : title;
  const base = { direct: 'never', group: 'actions' } as const;
  const actions: WorkspaceHeaderAction[] = [
    {
      ...base,
      id: 'rename-session',
      label: t('managedSession.sessionActions.rename'),
      icon: 'rename',
      disabled: !onRenameSession,
      onPress: () => setOpen('rename'),
    },
    {
      ...base,
      id: 'archive-session',
      label: t('managedSession.sessionActions.archive'),
      icon: 'archive',
      disabled: !onArchiveSession,
      onPress: () => setOpen('archive'),
    },
    {
      ...base,
      id: 'delete-session',
      label: t('managedSession.sessionActions.delete'),
      icon: 'trash',
      tone: 'danger',
      disabled: !onDeleteSession,
      onPress: () => setOpen('delete'),
    },
  ];
  const dialogs = (
    <SessionActionDialogs
      open={open}
      title={shownTitle ?? ''}
      onClose={close}
      onRename={(next) => {
        setRenamed({ from: title, to: next });
        onRenameSession?.(next);
        close();
      }}
      onArchive={() => {
        onArchiveSession?.();
        close();
      }}
      onDelete={() => {
        onDeleteSession?.();
        close();
      }}
    />
  );

  return { actions, dialogs, title: shownTitle };
}
