import { useTranslation } from 'react-i18next';
import { InlineNote } from '@nevo/ui';

/**
 * Takes the Composer's place when the caller may only view the Session (no Manage, so no Turn,
 * answer or Stop is ever theirs): the archived bar's quiet shape without an action
 * (full-session.md "Session actions", View-only Session).
 */
export function ViewOnlySessionBar() {
  const { t } = useTranslation();

  return (
    <div
      data-view-only-bar="true"
      role="status"
      className="rounded-composite border border-solid border-border-default bg-surface-raised px-4 py-3 shadow-lg"
    >
      <InlineNote tone="info">{t('managedSession.viewOnly.note')}</InlineNote>
    </div>
  );
}
