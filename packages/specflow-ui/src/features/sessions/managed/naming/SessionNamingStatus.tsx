import { useTranslation } from 'react-i18next';
import { Spinner } from '@nevo/ui';

/**
 * The Session header's `status` while the agent is still naming a Session started without an own
 * name: a small spinner and "Naming…" next to the provisional title. It disappears when the name
 * arrives (the title itself then changes); a failed naming simply leaves the provisional title,
 * which "Rename" in the header menu can replace. Announced politely, once.
 */
export function SessionNamingStatus() {
  const { t } = useTranslation();

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-body-sm text-content-muted"
    >
      <Spinner size="sm" />
      {t('sessionNaming.pending')}
    </span>
  );
}
