import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuNote,
  MenuSeparator,
  MenuTrigger,
} from '@nevo/ui';

export interface NowOperation {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
  /** Shown unavailable; the menu's note says why (Finish step while an exit gate is unmet). */
  readonly disabled?: boolean;
}

/**
 * The Now block's ⋯ menu on the Specification Overview: the workflow operations that are not its
 * main action (Return to an earlier step, an unavailable Finish step), Workflow history, and one
 * note with why an operation is unavailable and the step id and workflow revision.
 */
export function NowOperationsMenu({
  operations,
  onOpenHistory,
  note,
}: {
  readonly operations: readonly NowOperation[];
  readonly onOpenHistory?: () => void;
  /** The menu's one note: lines of reason and technical detail. */
  readonly note: readonly string[];
}) {
  const { t } = useTranslation();
  const noteId = useId();
  if (operations.length === 0 && !onOpenHistory && note.length === 0) {
    return null;
  }

  return (
    <Menu modal={false}>
      <MenuTrigger asChild>
        <IconButton
          icon="ellipsis"
          size="sm"
          variant="ghost"
          aria-label={t('workflowExecution.now.operations')}
        />
      </MenuTrigger>
      <MenuContent align="end" aria-describedby={note.length > 0 ? noteId : undefined}>
        {operations.map((operation) => (
          <MenuItem key={operation.id} disabled={operation.disabled} onSelect={operation.onSelect}>
            {operation.label}
          </MenuItem>
        ))}
        {onOpenHistory ? (
          <MenuItem onSelect={onOpenHistory}>{t('workflowExecution.now.history')}</MenuItem>
        ) : null}
        {note.length > 0 ? (
          <>
            <MenuSeparator />
            <MenuNote id={noteId}>
              {note.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </MenuNote>
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}
