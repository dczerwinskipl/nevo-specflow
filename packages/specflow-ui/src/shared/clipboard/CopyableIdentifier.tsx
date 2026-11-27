import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { IconButton, Typography, cn } from '@nevo/ui';
import { copyText } from './copyText';

/**
 * A technical identifier as secondary metadata (a Task's key under its title): monospace, quiet,
 * selectable, with an icon action that copies it (interaction-model.md "Visual conventions":
 * monospace only for ids and code). The copy result is announced and the icon confirms it for a
 * moment.
 */
export function CopyableIdentifier({
  value,
  copyLabel,
  copiedLabel,
  failedLabel,
  className,
}: {
  readonly value: string;
  /** The icon action's accessible name ("Copy task key"). */
  readonly copyLabel: string;
  readonly copiedLabel: string;
  readonly failedLabel: string;
  readonly className?: string;
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    clearTimeout(timer.current);
    void copyText(value).then((copied) => {
      setStatus(copied ? 'copied' : 'failed');
      timer.current = setTimeout(() => setStatus('idle'), 2000);
    });
  };

  return (
    <Typography
      as="p"
      variant="body-sm"
      className={cn('flex min-w-0 items-center gap-1 text-content-muted', className)}
      data-copyable-identifier=""
    >
      <span className="min-w-0 font-mono [overflow-wrap:anywhere] select-all">{value}</span>
      <IconButton
        aria-label={copyLabel}
        title={copyLabel}
        icon={status === 'copied' ? Check : Copy}
        size="xs"
        variant="ghost"
        className="shrink-0"
        onClick={copy}
      />
      <span role="status" aria-live="polite" className="sr-only">
        {status === 'copied' ? copiedLabel : status === 'failed' ? failedLabel : ''}
      </span>
    </Typography>
  );
}
