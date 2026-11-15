import { useTranslation } from 'react-i18next';
import { Button, InlineNote } from '@nevo/ui';
import type { SessionCommandView } from './SessionActionDialogs';

/**
 * Takes the Composer's place while the Session is archived (full-session.md "Session actions"): a
 * quiet note and, with Manage, a direct Restore (reversible, so no confirmation).
 */
export function ArchivedSessionBar({
  canManage,
  unarchive,
}: {
  canManage: boolean;
  unarchive: SessionCommandView & { run: () => void };
}) {
  const { t } = useTranslation();
  const failure = unarchive.pending ? undefined : unarchive.failure;
  const message =
    failure === 'unconfirmed'
      ? t('managedSession.sessionActions.unconfirmed')
      : failure === 'forbidden'
        ? t('managedSession.sessionActions.forbidden')
        : failure
          ? t(`apiErrors.kind.${unarchive.errorKind ?? 'server'}.title`)
          : undefined;

  return (
    <div
      data-archived-bar="true"
      className="rounded-composite border border-solid border-border-default bg-surface-raised px-4 py-3 shadow-lg"
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
      {/* Always there (a block, so an empty region takes no space). */}
      <div role="alert">
        {message ? (
          <InlineNote tone="danger" className="mt-2">
            {message}
          </InlineNote>
        ) : null}
      </div>
    </div>
  );
}
