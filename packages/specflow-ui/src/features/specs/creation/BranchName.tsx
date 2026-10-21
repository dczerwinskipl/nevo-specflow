import { cn, Icon, Typography } from '@nevo/ui';
/**
 * A branch used as a value: decorative branch icon plus the name in the `code-md` role, kept as
 * one unit. Prose (button text, announcements) uses the plain name instead.
 */
export function BranchName({
  name,
  truncate = false,
  className,
}: {
  name: string;
  /** Single line with an ellipsis (select trigger/options); otherwise a long name wraps. */
  truncate?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex min-w-0 max-w-full items-start gap-1 align-baseline', className)}
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
