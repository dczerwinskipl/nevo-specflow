import type { ReactNode } from 'react';
import { cn, Icon, Typography } from '@nevo/ui';
/**
 * The one way a Git branch appears in the Create workspace section (decision rows, notes, select
 * items): a decorative branch icon (one size) plus the name in the `code-md` role, kept as one
 * unit. There are no parenthesised or colon variants around it; prose that has to stay plain text
 * (button labels, announcements) uses the bare name instead.
 */
export function BranchRef({
  name,
  title,
  truncate = false,
  className,
}: {
  /** The branch name; a composed preview (`BranchPreview`) passes its parts. */
  name: ReactNode;
  /** The full name as a tooltip, for a truncated or composed name. */
  title?: string;
  /** Single line with an ellipsis (select trigger/options); otherwise a long name wraps. */
  truncate?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex min-w-0 max-w-full items-start gap-1 align-baseline', className)}
      title={title}
    >
      <Icon name="branch" size="sm" className="mt-0.5 shrink-0 text-content-muted" />
      <Typography
        as="span"
        variant="code-md"
        className={cn('min-w-0', truncate ? 'truncate' : 'wrap-anywhere')}
      >
        {name}
      </Typography>
    </span>
  );
}
