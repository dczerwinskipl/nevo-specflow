import { useTranslation } from 'react-i18next';
import { Button } from '@nevo/ui';

/**
 * The reader's way on once auto-loading older Work or Actions pages has stopped because the pages
 * added nothing to the list (`useAutoLoadOlder`). Shared by both screens: at the top of the list,
 * where the older history would arrive. With a filter or search active it says what the click
 * does for them — look further back — instead of a generic "load".
 */
export function OlderHistoryButton({
  searching,
  onClick,
}: {
  /** A kind filter or a search is active. */
  searching: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Button size="sm" variant="secondary" className="self-center" onClick={onClick}>
      {t(
        searching
          ? 'managedSession.workInspector.searchOlder'
          : 'managedSession.workInspector.loadOlder',
      )}
    </Button>
  );
}
