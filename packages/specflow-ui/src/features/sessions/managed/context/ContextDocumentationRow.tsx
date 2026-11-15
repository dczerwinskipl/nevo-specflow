import { useTranslation } from 'react-i18next';
import { ContextNavigationRow } from './ContextNavigationRow';

/**
 * The project documentation as it is in this Session's workspace (the Runtime's own checkout,
 * where every Session runs): one navigation row of the section that names where the Session works.
 */
export function ContextDocumentationRow({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();

  return (
    <ContextNavigationRow
      icon="book-open"
      label={t('sessions.context.documentation.open')}
      secondary={t('sessions.context.documentation.workspace')}
      onClick={onOpen}
    />
  );
}
