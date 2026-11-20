import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@nevo/ui';
import { copyText } from '../../../../shared/clipboard/copyText';
import { InlineAction } from '../InlineAction';

/**
 * An inline "Copy …" action of the Close dialog: it copies `text` and says whether it did (the
 * browser may refuse). Disabled with its `disabledReason` shown beside it until there is something
 * to copy.
 */
export function CopyAction({
  text,
  label,
  disabledReason,
}: {
  readonly text: string;
  readonly label: string;
  /** Set while there is nothing to copy yet: the action is off and this says why. */
  readonly disabledReason?: string;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<{ text: string; copied: boolean }>();
  const disabled = disabledReason !== undefined;
  // A result belongs to the text that was copied: a new choice clears it.
  const shown = status?.text === text && !disabled ? status : undefined;

  return (
    <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-2">
      <InlineAction
        disabled={disabled}
        className={cn(
          disabled &&
            'cursor-not-allowed text-content-muted hover:text-content-muted hover:no-underline',
        )}
        onClick={() => void copyText(text).then((copied) => setStatus({ text, copied }))}
      >
        {label}
      </InlineAction>
      <span role="status" className="text-body-sm text-content-muted">
        {disabled
          ? disabledReason
          : shown
            ? shown.copied
              ? t('workflowExecution.close.repository.copied')
              : t('workflowExecution.close.repository.copyFailed')
            : null}
      </span>
    </span>
  );
}
