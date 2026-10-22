import { Alert, Button } from '@nevo/ui';
import { useTranslation } from 'react-i18next';

/**
 * A failed read. With rows already on screen the failure is a warning above them (the rows stay);
 * with nothing to show it is the whole answer.
 */
export function SpecsOverviewNotice({
  hasRows,
  busy,
  onRetry,
}: {
  readonly hasRows: boolean;
  readonly busy: boolean;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Alert
      role="alert"
      tone={hasRows ? 'attention' : 'danger'}
      title={t(hasRows ? 'specifications.refreshFailed' : 'specifications.unavailable')}
    >
      <p>
        {t(
          hasRows
            ? 'specifications.refreshFailedDescription'
            : 'specifications.unavailableDescription',
        )}
      </p>
      <Button className="mt-3" onClick={onRetry} disabled={busy} variant="secondary">
        {t('common.retry')}
      </Button>
    </Alert>
  );
}
