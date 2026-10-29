import { useTranslation } from 'react-i18next';
import { Button, EmptyState, type IconGlyph } from '@nevo/ui';

/** A start action offered in the empty area (New document…, Upload). */
export interface DocumentsEmptyStateAction {
  id: string;
  label: string;
  icon?: IconGlyph;
  disabled?: boolean;
  onPress: () => void;
}

/** Creating a document is the one primary start action; Upload stays secondary even when alone. */
const primaryActionId = 'documents-new-file';

/**
 * The document area with nothing open: the shared empty screen (centred in the area) with, when the
 * Specification allows them, the start actions. It does not repeat the tree beside it. Nothing
 * opens by itself, so closing the last tab does not bring a document back.
 */
export function DocumentsEmptyState({
  actions = [],
}: {
  /** Only the actions the capabilities allow; one that waits for a running operation is disabled. */
  actions?: readonly DocumentsEmptyStateAction[];
}) {
  const { t } = useTranslation();
  // The primary comes first, whatever order the caller uses.
  const ordered = [
    ...actions.filter((action) => action.id === primaryActionId),
    ...actions.filter((action) => action.id !== primaryActionId),
  ];
  return (
    <EmptyState
      variant="pane"
      icon="file"
      title={t('documents.empty.heading')}
      description={actions.length > 0 ? t('documents.empty.title') : t('documents.empty.choose')}
      actions={
        ordered.length > 0
          ? ordered.map((action) => (
              <Button
                key={action.id}
                variant={action.id === primaryActionId ? 'primary' : 'secondary'}
                leadingIcon={action.icon}
                disabled={action.disabled}
                onClick={action.onPress}
              >
                {action.label}
              </Button>
            ))
          : undefined
      }
    />
  );
}
