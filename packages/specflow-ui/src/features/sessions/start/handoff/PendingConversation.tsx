import { useTranslation } from 'react-i18next';
import { Button } from '@nevo/ui';
import type { FeedState } from '../../managed/feed';
import { StartedSessionPlaceholder } from './StartedSessionPlaceholder';
import type { StartedSession } from './startedSession';

/**
 * The conversation of a Session whose first snapshot has not arrived. One just started here shows
 * the ready empty state and the Composer in their places (no loading text, new-session-ui-spec.md
 * section 3(c)); any other Session, or one whose connection failed, says so and offers to retry.
 */
export function PendingConversation({
  started,
  connection,
  onRetry,
}: {
  started: StartedSession | undefined;
  connection: FeedState['connection'];
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const failed = connection === 'error';
  if (started && !failed) {
    return <StartedSessionPlaceholder started={started} />;
  }

  return (
    <div className="grid gap-3 p-5">
      <p role="status">{t(failed ? 'managedSession.failed' : 'managedSession.loading')}</p>
      {failed && <Button onClick={onRetry}>{t('common.retry')}</Button>}
    </div>
  );
}
