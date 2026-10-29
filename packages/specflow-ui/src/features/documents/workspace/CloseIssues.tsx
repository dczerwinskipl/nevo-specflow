import type { DocumentIssue } from '@nevo/specflow-contracts/documents';
import { useTranslation } from 'react-i18next';
import { Alert } from '@nevo/ui';

/**
 * Issues after which Close archive is refused (`path-case-collision`, `archive-limit`): one static
 * attention Alert (present on load, not caused by an action, so no `role="alert"`), one bullet per
 * collision path and one for the archive limit, then the remedy. No action: the fix is on disk.
 */
export function CloseIssues({ issues }: { issues: readonly DocumentIssue[] }) {
  const { t } = useTranslation();
  if (issues.length === 0) return null;
  const archiveLimit = issues.some((issue) => issue.code === 'archive-limit');
  const collisions = issues.filter((issue) => issue.code === 'path-case-collision');
  return (
    <Alert tone="attention" title={t('documents.issues.title')}>
      <ul className="grid list-disc gap-1 pl-4">
        {collisions.map((issue, index) => (
          <li key={`${issue.path ?? ''}-${index}`} className="break-words">
            {t('documents.issues.caseCollision', { path: issue.path ?? '' })}
          </li>
        ))}
        {archiveLimit && <li>{t('documents.issues.archiveLimit')}</li>}
      </ul>
      <p className="mt-2 text-content-secondary">{t('documents.issues.remedy')}</p>
    </Alert>
  );
}
