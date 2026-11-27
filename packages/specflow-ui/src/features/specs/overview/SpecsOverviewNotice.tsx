import { Alert, Button } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { collectionTitleTrackMaxWidth } from '../../../shared/operational-list';
import { unreadableCopy, type UnreadableCause } from '../../../shared/unreadable/unreadable';

/**
 * A failed read. With rows already on screen the failure is a warning above them (the rows stay);
 * with nothing to show it is the whole answer.
 */
export function SpecsOverviewNotice({
  hasRows,
  busy,
  cause = 'failed',
  onRetry,
}: {
  readonly hasRows: boolean;
  readonly busy: boolean;
  /** Why the read failed: the notice says it in plain words (never "not supported"). */
  readonly cause?: UnreadableCause;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Alert
      role="alert"
      className={collectionTitleTrackMaxWidth}
      tone={hasRows ? 'attention' : 'danger'}
      title={t(hasRows ? 'specifications.refreshFailed' : 'specifications.unavailable')}
    >
      <p>
        {t(hasRows ? 'specifications.refreshFailedDescription' : unreadableCopy(cause).description)}
      </p>
      <Button className="mt-3" onClick={onRetry} disabled={busy} variant="secondary">
        {t('common.retry')}
      </Button>
    </Alert>
  );
}
