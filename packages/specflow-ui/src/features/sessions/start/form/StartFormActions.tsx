import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@nevo/ui';

/**
 * The form's last row (not a page footer): the note at the start, naming the one thing still
 * missing (or what Start will do), and **Start session** at the end. On a narrow form the note
 * wraps above the button. When no agent is usable the row also offers to check again.
 */
export function StartFormActions({
  noteId,
  note,
  label,
  disabled,
  pending,
  onRefresh,
}: {
  noteId: string;
  note: string;
  label: string;
  /** Start cannot be pressed: a prerequisite is missing or the form is locked. */
  disabled: boolean;
  /** The Session is being started: the button says so and announces it as busy. */
  pending: boolean;
  /** Reads the catalogue again; shown only while there is something to wait for. */
  onRefresh?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <Typography
        as="p"
        variant="body-sm"
        id={noteId}
        className="min-w-0 flex-1 basis-48 text-content-secondary"
      >
        {note}
      </Typography>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {onRefresh && (
          <Button type="button" variant="secondary" onClick={onRefresh}>
            {t('common.retry')}
          </Button>
        )}
        <Button
          type="submit"
          disabled={disabled}
          aria-busy={pending || undefined}
          aria-describedby={noteId}
        >
          {label}
        </Button>
      </div>
    </div>
  );
}
