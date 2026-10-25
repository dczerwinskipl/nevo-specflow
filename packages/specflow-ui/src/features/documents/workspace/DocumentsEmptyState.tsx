import { useTranslation } from 'react-i18next';
import { Button, Typography, type IconGlyph } from '@nevo/ui';

/** A start action offered under the line (New document…, Upload). */
export interface DocumentsEmptyStateAction {
  id: string;
  label: string;
  icon?: IconGlyph;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * The document area with nothing open: one line and, when the Specification allows it, the start
 * actions. It does not repeat the tree beside it. Nothing opens by itself, so closing the last tab
 * does not bring a document back.
 */
export function DocumentsEmptyState({
  actions = [],
}: {
  /** Only the actions the capabilities allow; one that waits for a running operation is disabled. */
  actions?: readonly DocumentsEmptyStateAction[];
}) {
  const { t } = useTranslation();
  return (
    // Left-aligned on the reading measure under the header, like the document.
    <div className="flex max-w-content-narrow flex-col items-start gap-4 p-6">
      <Typography as="p" className="m-0 text-content-secondary">
        {t('documents.empty.title')}
      </Typography>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action.id}
              variant="secondary"
              leadingIcon={action.icon}
              disabled={action.disabled}
              onClick={action.onPress}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
