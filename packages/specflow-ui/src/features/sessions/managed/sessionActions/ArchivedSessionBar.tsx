import { useTranslation } from 'react-i18next';
import { Button, InlineNote } from '@nevo/ui';
import type { SessionCommandView } from './SessionActionDialogs';

/**
 * Takes the Composer's place while the Session is archived (session-actions-ux §3.4): a quiet note
 * and, with Manage, a direct Restore (reversible, so no confirmation).
 */
export function ArchivedSessionBar({
  canManage,
  unarchive,
}: {
  canManage: boolean;
  unarchive: SessionCommandView & { run: () => void };
}) {
  const { t } = useTranslation();
  const failure = unarchive.failure;

  return (
    <div
      data-archived-bar="true"
      className="workspace-floating-pill grid gap-2 rounded-composite px-4 py-3 shadow-lg"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <InlineNote tone="info" className="min-w-0 flex-1">
          {t('managedSession.sessionActions.archivedNote')}
        </InlineNote>
        {canManage ? (
          <Button
            variant="secondary"
            size="sm"
            // Keeps focus while it waits; the shared handler ignores presses.
            aria-disabled={unarchive.pending || undefined}
            onClick={unarchive.run}
          >
            {unarchive.pending
              ? t('managedSession.sessionActions.unarchiving')
              : t('managedSession.sessionActions.unarchive')}
          </Button>
        ) : null}
      </div>
      {/* Always there, without a grid row of its own while empty. */}
      <div role="alert" className="contents">
        {failure && !unarchive.pending ? (
          <InlineNote tone="danger">
            {failure === 'forbidden'
              ? t('managedSession.sessionActions.forbidden')
              : t('managedSession.sessionActions.unconfirmed')}
          </InlineNote>
        ) : null}
      </div>
    </div>
  );
}
